$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Get-RequiredEnvironmentValue([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Required worker setting is missing: $Name"
    }
    return $value
}

function Get-WorkerInput {
    $config = (Get-RequiredEnvironmentValue "RAG_CONFIG_JSON") | ConvertFrom-Json -AsHashtable
    $request = (Get-RequiredEnvironmentValue "RAG_REQUEST_JSON") | ConvertFrom-Json -AsHashtable

    $requiredConfig = @(
        "_profile",
        "subscription",
        "resource_group",
        "database_account",
        "database_connection",
        "database_name",
        "search_endpoint",
        "search_key",
        "blob_account",
        "blob_key",
        "customskill_endpoint",
        "customskill_appid",
        "openai_endpoint",
        "openai_key",
        "graphrag",
        "graphrag_db_name",
        "graphrag_db_connection",
        "chunk_size",
        "chunk_overlap",
        "documentintelligence_name",
        "documentintelligence_key"
    )
    foreach ($name in $requiredConfig) {
        if (
            -not $config.ContainsKey($name) -or
            $null -eq $config[$name] -or
            ($config[$name] -is [string] -and [string]::IsNullOrWhiteSpace($config[$name]))
        ) {
            throw "RAG config is missing: $name"
        }
    }

    $requiredRequest = @(
        "requestId",
        "operation",
        "environment",
        "contractEnvironment",
        "contractId",
        "resourceKey",
        "contractStartDate",
        "contractEndDate",
        "resources"
    )
    foreach ($name in $requiredRequest) {
        if (
            -not $request.ContainsKey($name) -or
            $null -eq $request[$name] -or
            ($request[$name] -is [string] -and [string]::IsNullOrWhiteSpace($request[$name]))
        ) {
            throw "RAG request is missing: $name"
        }
    }

    if ($config._profile -ne "development-v3") {
        throw "Only the development-v3 RAG profile is allowed"
    }
    if ($config.subscription -ne (Get-RequiredEnvironmentValue "RAG_ALLOWED_SUBSCRIPTION_ID")) {
        throw "RAG subscription is not allowed"
    }
    if ($config.resource_group -ne (Get-RequiredEnvironmentValue "RAG_ALLOWED_RESOURCE_GROUP")) {
        throw "RAG resource group is not allowed"
    }
    if ($request.environment -ne "development") {
        throw "Only the development environment is allowed"
    }
    if ($request.contractEnvironment -notin @("dev1", "dev2", "dev3")) {
        throw "Invalid contract environment"
    }
    if ($request.operation -notin @("CREATE", "DELETE")) {
        throw "Invalid RAG operation"
    }
    if (
        $request.resourceKey.Length -gt 53 -or
        $request.resourceKey -notmatch "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$"
    ) {
        throw "Invalid RAG resource key"
    }

    $expectedResources = @{
        blobContainers = @(
            $request.resourceKey,
            "$($request.resourceKey)-text",
            "$($request.resourceKey)-graphrag"
        )
        searchIndex = $request.resourceKey
        searchDatasource = "$($request.resourceKey)-datasource"
        searchSkillset = "$($request.resourceKey)-skillset"
        searchIndexer = "$($request.resourceKey)-indexer"
        settingCollection = "setting_$($request.resourceKey)"
        contractRagRecord = $request.resourceKey
        graphRagContainerPrefix = "$($request.resourceKey)-"
    }
    if ((@($request.resources.blobContainers) -join ",") -ne ($expectedResources.blobContainers -join ",")) {
        throw "Unexpected Blob resources"
    }
    foreach ($name in @(
        "searchIndex",
        "searchDatasource",
        "searchSkillset",
        "searchIndexer",
        "settingCollection",
        "contractRagRecord",
        "graphRagContainerPrefix"
    )) {
        if ($request.resources[$name] -ne $expectedResources[$name]) {
            throw "Unexpected RAG resource mapping"
        }
    }
    if ($request.operation -eq "CREATE" -and [int]$request.storageSizeMB -le 0) {
        throw "Invalid storage size"
    }

    return @{
        Config = $config
        Request = $request
    }
}

function Connect-WorkerAzure([hashtable]$Config) {
    Disable-AzContextAutosave -Scope Process | Out-Null
    Connect-AzAccount -Identity -ErrorAction Stop | Out-Null
    Set-AzContext -SubscriptionId $Config.subscription -ErrorAction Stop | Out-Null
}

function Connect-RequestDatabase {
    $connection = Get-RequiredEnvironmentValue "RAG_REQUEST_DATABASE_CONNECTION"
    $database = Get-RequiredEnvironmentValue "RAG_REQUEST_DATABASE_NAME"
    Connect-Mdbc -ConnectionString $connection $database "RagProvisioningRequest"
}

function Set-RequestStatus(
    [string]$RequestId,
    [string]$Status,
    [string]$ErrorMessage,
    [switch]$Terminal
) {
    Connect-RequestDatabase
    $set = @{
        status = $Status
        updatedAt = [DateTime]::UtcNow
    }
    if ($Status -eq "RUNNING") {
        $set.startedAt = [DateTime]::UtcNow
    }
    if ($ErrorMessage) {
        $set.error = $ErrorMessage
    }
    if ($Terminal) {
        $set.completedAt = [DateTime]::UtcNow
        Update-MdbcData -Filter @{ requestId = $RequestId } @{
            '$set' = $set
            '$unset' = @{ lockKey = "" }
        }
        return
    }
    Update-MdbcData -Filter @{ requestId = $RequestId } @{ '$set' = $set }
}

function Set-RequestStep(
    [string]$RequestId,
    [string]$StepName,
    [string]$Status,
    [string]$Message
) {
    Connect-RequestDatabase
    $document = Get-MdbcData -Filter @{ requestId = $RequestId } -First 1
    if (-not $document) {
        throw "Provisioning request was not found"
    }

    foreach ($step in $document.steps) {
        if ($step.name -eq $StepName) {
            $step.status = $Status
            $step.updatedAt = [DateTime]::UtcNow
            if ($Message) {
                $step.message = $Message
            }
        }
    }
    Update-MdbcData -Filter @{ requestId = $RequestId } @{
        '$set' = @{
            steps = $document.steps
            updatedAt = [DateTime]::UtcNow
        }
    }
}

function Invoke-RequestStep(
    [string]$RequestId,
    [string]$StepName,
    [scriptblock]$Action
) {
    Set-RequestStep $RequestId $StepName "RUNNING" ""
    & $Action
    Set-RequestStep $RequestId $StepName "SUCCEEDED" ""
}

function Get-RenderedTemplate(
    [string]$Path,
    [hashtable]$Config,
    [string]$ResourceKey
) {
    $content = Get-Content -Raw -Encoding utf8 $Path
    $replacements = @{
        '${subscription}' = $Config.subscription
        '${resource_group}' = $Config.resource_group
        '${search_endpoint}' = $Config.search_endpoint
        '${blob_account}' = $Config.blob_account
        '${blob_key}' = $Config.blob_key
        '${contractid}' = $ResourceKey
        '${openai_endpoint}' = ($Config.openai_search_endpoint ? $Config.openai_search_endpoint : $Config.openai_endpoint)
        '${openai_key}' = ($Config.openai_search_key ? $Config.openai_search_key : $Config.openai_key)
        '${customskill_endpoint}' = $Config.customskill_endpoint
        '${customskill_appid}' = $Config.customskill_appid
    }
    foreach ($entry in $replacements.GetEnumerator()) {
        $content = $content.Replace($entry.Key, [string]$entry.Value)
    }
    return $content
}

function Invoke-SearchPut(
    [hashtable]$Config,
    [string]$Component,
    [string]$Name,
    [string]$Body
) {
    $url = "$($Config.search_endpoint)/$Component('$Name')?api-version=2024-07-01"
    $response = Invoke-WebRequest -Method Put -Uri $url -Body ([Text.Encoding]::UTF8.GetBytes($Body)) `
        -ContentType "application/json" -Headers @{ "api-key" = $Config.search_key } `
        -SkipHttpErrorCheck
    if ($response.StatusCode -ge 400) {
        throw "Failed to create Search $Component"
    }
}

function Invoke-SearchDelete(
    [hashtable]$Config,
    [string]$Component,
    [string]$Name
) {
    $url = "$($Config.search_endpoint)/$Component('$Name')?api-version=2024-07-01"
    $response = Invoke-WebRequest -Method Delete -Uri $url `
        -Headers @{ "api-key" = $Config.search_key } -SkipHttpErrorCheck
    if ($response.StatusCode -ne 404 -and $response.StatusCode -ge 400) {
        throw "Failed to delete Search $Component"
    }
}

function Test-SearchResource(
    [hashtable]$Config,
    [string]$Component,
    [string]$Name,
    [bool]$ShouldExist
) {
    $url = "$($Config.search_endpoint)/$Component('$Name')?api-version=2024-07-01"
    $response = Invoke-WebRequest -Method Get -Uri $url `
        -Headers @{ "api-key" = $Config.search_key } -SkipHttpErrorCheck
    if ($ShouldExist -and $response.StatusCode -ne 200) {
        throw "Search $Component validation failed"
    }
    if (-not $ShouldExist -and $response.StatusCode -ne 404) {
        throw "Search $Component still exists"
    }
}
