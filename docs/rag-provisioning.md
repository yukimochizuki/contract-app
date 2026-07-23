# RAG provisioning deployment

## Architecture

```text
Static Web Apps
  -> standalone Azure Functions API
  -> Azure Container Apps Job start API
  -> PowerShell worker
  -> Blob / Azure AI Search / Cosmos DB
```

SWA managed Functions は HTTP trigger のみで Managed Identity を利用できないため、
RAG provisioning API は standalone Functions として運用する。

Function App の public endpoint を直接公開せず、SWA linked backend と Function App
Authentication / access restriction を設定する。`x-ms-client-principal` は SWA または
認証済みApp Service proxy が付与したものだけを信頼する。

## Development profile

- config: `mitoco-ai-rag-dev-v3.json`
- template: `template-v3`
- network: VNetなし
- environment exposed by UI: development only

Config JSON は repository や browser に置かず、Container Apps Job の secret として登録する。
添付ZIPに含まれていた既存のkey/connection stringは再利用前にrotationする。
secret JSON には固定profile確認用の `"_profile": "development-v3"` を追加する。

## Identities and permissions

### API identity

Container Apps Job に対する start action のみを付与する。

### Worker identity

開発 subscription の対象 resource に限定して以下を付与する。

- Blob container create/delete
- Cosmos DB MongoDB/SQL container create/delete
- Azure resource read

AI Search と MongoDB の既存 key/connection は Container Apps secret から読み込み、
request、response、log へ出力しない。

## API settings

`api/local.settings.example.json` を参照する。`ADMIN_USERS` は Entra ID の user ID
またはメールアドレスを comma-separated で指定できる。SWA custom role `admin` も許可する。

`RAG_REQUEST_DB_SECRET_DEV1` 等は secret value ではなく、Container Apps Job に登録した
secret reference 名である。
`RAG_DEV_SUBSCRIPTION_ID` と `RAG_DEV_RESOURCE_GROUP` はworkerでもconfig値と照合し、
誤って本番profileを実行することを防止する。

## Job image

```sh
docker build -t <registry>/<image>:<version> rag-worker
docker push <registry>/<image>:<version>
```

Container Apps Job は manual trigger とし、worker 用 Managed Identity、RAG config secret、
environment 別 contract DB secret を設定する。

## Production

初回リリースでは API が `prod` を拒否する。本番対応時は
`mitoco-ai-rag-prod-v3.json` + `template-v3-vnet` に固定し、
本番VNetなし構成は許可しない。
