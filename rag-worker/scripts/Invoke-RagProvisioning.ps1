$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$here/Rag.Common.ps1"
. "$here/Rag.Database.ps1"

$inputData = Get-WorkerInput
$config = $inputData.Config
$request = $inputData.Request
$requestId = $request.requestId
$templateRoot = "/app/template-v3"
$currentStep = ""

function New-RagBlobContainers {
    $context = New-AzStorageContext `
        -StorageAccountName $config.blob_account `
        -UseConnectedAccount
    foreach ($containerName in $request.resources.blobContainers) {
        $existing = Get-AzStorageContainer -Name $containerName `
            -Context $context -ErrorAction SilentlyContinue
        if (-not $existing) {
            New-AzStorageContainer -Name $containerName -Permission Off `
                -Context $context | Out-Null
        }
    }
}

function Remove-RagBlobContainers {
    $context = New-AzStorageContext `
        -StorageAccountName $config.blob_account `
        -UseConnectedAccount
    foreach ($containerName in $request.resources.blobContainers) {
        $existing = Get-AzStorageContainer -Name $containerName `
            -Context $context -ErrorAction SilentlyContinue
        if ($existing) {
            Remove-AzStorageContainer -Name $containerName -Context $context `
                -Force | Out-Null
        }
    }
}

function New-RagSearchResources {
    $definitions = @(
        @{ File = "index.json"; Component = "indexes"; Name = $request.resources.searchIndex },
        @{ File = "datasource.json"; Component = "datasources"; Name = $request.resources.searchDatasource },
        @{ File = "skillset.json"; Component = "skillsets"; Name = $request.resources.searchSkillset },
        @{ File = "indexer.json"; Component = "indexers"; Name = $request.resources.searchIndexer }
    )
    foreach ($definition in $definitions) {
        $body = Get-RenderedTemplate "$templateRoot/$($definition.File)" `
            $config $request.resourceKey
        Invoke-SearchPut $config $definition.Component $definition.Name $body
    }
}

function Remove-RagSearchResources {
    $definitions = @(
        @{ Component = "indexers"; Name = $request.resources.searchIndexer },
        @{ Component = "skillsets"; Name = $request.resources.searchSkillset },
        @{ Component = "datasources"; Name = $request.resources.searchDatasource },
        @{ Component = "indexes"; Name = $request.resources.searchIndex }
    )
    foreach ($definition in $definitions) {
        Invoke-SearchDelete $config $definition.Component $definition.Name
    }
}

function New-RagDatabaseResources {
    New-MongoCollection $config $request.resources.settingCollection
    New-SiteConfig $config $request.resources.settingCollection
    Set-ContractRag $config $request
}

function Remove-RagDatabaseResources {
    Remove-MongoCollection $config $request.resources.settingCollection
    Remove-ContractRag $config $request
    Remove-GraphRagContainers $config $request.resourceKey
}

function Test-RagResources([bool]$ShouldExist) {
    $context = New-AzStorageContext `
        -StorageAccountName $config.blob_account `
        -UseConnectedAccount
    foreach ($containerName in $request.resources.blobContainers) {
        $container = Get-AzStorageContainer -Name $containerName `
            -Context $context -ErrorAction SilentlyContinue
        if ($ShouldExist -and -not $container) {
            throw "Blob validation failed"
        }
        if (-not $ShouldExist -and $container) {
            throw "Blob container still exists"
        }
    }

    Test-SearchResource $config "indexes" $request.resources.searchIndex $ShouldExist
    Test-SearchResource $config "datasources" $request.resources.searchDatasource $ShouldExist
    Test-SearchResource $config "skillsets" $request.resources.searchSkillset $ShouldExist
    Test-SearchResource $config "indexers" $request.resources.searchIndexer $ShouldExist

    $settingExists = Test-MongoCollection $config $request.resources.settingCollection
    if ($ShouldExist -ne $settingExists) {
        throw "RAG setting collection validation failed"
    }
    Test-ContractRag $config $request $ShouldExist
    if (-not $ShouldExist) {
        Test-GraphRagContainersAbsent $config $request.resourceKey
    }
}

function Invoke-TrackedStep([string]$Name, [scriptblock]$Action) {
    $script:currentStep = $Name
    Invoke-RequestStep $requestId $Name $Action
}

try {
    Connect-WorkerAzure $config
    Set-RequestStatus $requestId "RUNNING" ""

    if ($request.operation -eq "CREATE") {
        Invoke-TrackedStep "BLOB" { New-RagBlobContainers }
        Invoke-TrackedStep "SEARCH" { New-RagSearchResources }
        Invoke-TrackedStep "DATABASE" { New-RagDatabaseResources }
        Invoke-TrackedStep "VALIDATION" { Test-RagResources $true }
    } elseif ($request.operation -eq "DELETE") {
        Invoke-TrackedStep "SEARCH" { Remove-RagSearchResources }
        Invoke-TrackedStep "BLOB" { Remove-RagBlobContainers }
        Invoke-TrackedStep "DATABASE" { Remove-RagDatabaseResources }
        Invoke-TrackedStep "VALIDATION" { Test-RagResources $false }
    } else {
        throw "Unsupported operation"
    }

    Set-RequestStatus $requestId "SUCCEEDED" "" -Terminal
    Write-Host "RAG request $requestId completed"
} catch {
    if ($currentStep) {
        Set-RequestStep $requestId $currentStep "FAILED" "Step failed"
    }
    $status = $currentStep ? "PARTIALLY_FAILED" : "FAILED"
    Set-RequestStatus $requestId $status "RAG operation failed during $currentStep" -Terminal
    Write-Error "RAG request $requestId failed during $currentStep"
    exit 1
}
