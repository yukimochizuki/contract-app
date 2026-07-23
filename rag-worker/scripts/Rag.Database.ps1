function Test-MongoCollection(
    [hashtable]$Config,
    [string]$CollectionName
) {
    $collection = Get-AzCosmosDBMongoDBCollection `
        -ResourceGroupName $Config.resource_group `
        -AccountName $Config.database_account `
        -DatabaseName $Config.database_name |
        Where-Object Name -eq $CollectionName
    return $null -ne $collection
}

function New-MongoCollection(
    [hashtable]$Config,
    [string]$CollectionName
) {
    if (Test-MongoCollection $Config $CollectionName) {
        return
    }
    $index = New-AzCosmosDBMongoDBIndex -Key @("id") -Unique $true
    New-AzCosmosDBMongoDBCollection `
        -ResourceGroupName $Config.resource_group `
        -AccountName $Config.database_account `
        -DatabaseName $Config.database_name `
        -Name $CollectionName `
        -Shard "id" `
        -Index @($index) | Out-Null
}

function Remove-MongoCollection(
    [hashtable]$Config,
    [string]$CollectionName
) {
    if (-not (Test-MongoCollection $Config $CollectionName)) {
        return
    }
    Remove-AzCosmosDBMongoDBCollection `
        -ResourceGroupName $Config.resource_group `
        -AccountName $Config.database_account `
        -DatabaseName $Config.database_name `
        -Name $CollectionName `
        -Confirm:$false | Out-Null
}

function Connect-RagDatabase(
    [hashtable]$Config,
    [string]$CollectionName
) {
    Connect-Mdbc -ConnectionString $Config.database_connection `
        $Config.database_name $CollectionName
}

function New-SiteConfig(
    [hashtable]$Config,
    [string]$CollectionName
) {
    Connect-RagDatabase $Config $CollectionName
    $existing = Get-MdbcData -Filter @{ id = "config" } -First 1
    $accountKey = if ($existing.account_key) {
        $existing.account_key
    } else {
        [Guid]::NewGuid().ToString("N").Substring(0, 16)
    }

    $siteConfig = @{
        id = "config"
        search_endpoint = $Config.search_endpoint
        search_key = $Config.search_key
        blob_account = $Config.blob_account
        blob_key = $Config.blob_key
        account_key = $accountKey
        graphrag = $Config.graphrag
        graphrag_db_name = $Config.graphrag_db_name
        graphrag_db_connection = $Config.graphrag_db_connection
        openai_endpoint = $Config.openai_endpoint
        openai_key = $Config.openai_key
        chunk_size = $Config.chunk_size
        chunk_overlap = $Config.chunk_overlap
        documentintelligence_name = $Config.documentintelligence_name
        documentintelligence_key = $Config.documentintelligence_key
    }

    foreach ($optional in @(
        "openai_graphrag_index_endpoint",
        "openai_graphrag_index_key",
        "openai_graphrag_search_endpoint",
        "openai_graphrag_search_key"
    )) {
        if ($Config[$optional]) {
            $siteConfig[$optional] = $Config[$optional]
        }
    }

    if ($existing) {
        Update-MdbcData -Filter @{ id = "config" } @{ '$set' = $siteConfig }
    } else {
        Add-MdbcData $siteConfig
    }
}

function Set-ContractRag(
    [hashtable]$Config,
    [hashtable]$Request
) {
    Connect-RagDatabase $Config "ContractRag"
    $filter = @{ contractId = $Request.contractId }
    $existing = Get-MdbcData -Filter $filter -First 1
    $now = [DateTime]::UtcNow
    $record = @{
        contractId = $Request.contractId
        resourceKey = $Request.resourceKey
        storageSize = [int]$Request.storageSizeMB
        startDate = [DateTime]::Parse($Request.contractStartDate).ToUniversalTime()
        endDate = [DateTime]::Parse($Request.contractEndDate).ToUniversalTime()
        updatedAt = $now
    }
    if ($existing) {
        Update-MdbcData -Filter $filter @{ '$set' = $record }
    } else {
        $record.createdAt = $now
        Add-MdbcData $record
    }
}

function Remove-ContractRag(
    [hashtable]$Config,
    [hashtable]$Request
) {
    Connect-RagDatabase $Config "ContractRag"
    Remove-MdbcData -Filter @{
        contractId = $Request.contractId
        resourceKey = $Request.resourceKey
    } -Many
}

function Test-ContractRag(
    [hashtable]$Config,
    [hashtable]$Request,
    [bool]$ShouldExist
) {
    Connect-RagDatabase $Config "ContractRag"
    $record = Get-MdbcData -Filter @{
        contractId = $Request.contractId
        resourceKey = $Request.resourceKey
    } -First 1
    if ($ShouldExist -and -not $record) {
        throw "ContractRag validation failed"
    }
    if (-not $ShouldExist -and $record) {
        throw "ContractRag record still exists"
    }
}

function Get-GraphRagAccountName([hashtable]$Config) {
    if ($Config.graphrag_db_connection -match "https://([a-zA-Z0-9-]+)\.documents\.azure\.com:443/") {
        return $matches[1]
    }
    return $null
}

function Remove-GraphRagContainers(
    [hashtable]$Config,
    [string]$ResourceKey
) {
    $accountName = Get-GraphRagAccountName $Config
    if (-not $accountName) {
        return
    }
    $containers = Get-AzCosmosDBSqlContainer `
        -ResourceGroupName $Config.resource_group `
        -AccountName $accountName `
        -DatabaseName $Config.graphrag_db_name
    foreach ($container in $containers) {
        if ($container.Name -like "$ResourceKey-*") {
            Remove-AzCosmosDBSqlContainer `
                -ResourceGroupName $Config.resource_group `
                -AccountName $accountName `
                -DatabaseName $Config.graphrag_db_name `
                -Name $container.Name `
                -Confirm:$false | Out-Null
        }
    }
}

function Test-GraphRagContainersAbsent(
    [hashtable]$Config,
    [string]$ResourceKey
) {
    $accountName = Get-GraphRagAccountName $Config
    if (-not $accountName) {
        return
    }
    $remaining = Get-AzCosmosDBSqlContainer `
        -ResourceGroupName $Config.resource_group `
        -AccountName $accountName `
        -DatabaseName $Config.graphrag_db_name |
        Where-Object Name -like "$ResourceKey-*"
    if ($remaining) {
        throw "GraphRAG containers still exist"
    }
}
