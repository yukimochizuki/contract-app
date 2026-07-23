# RAG provisioning worker

Azure Container Apps Job で実行する PowerShell 7 worker です。

## 固定構成

- environment: development
- config secret: `mitoco-ai-rag-dev-v3.json` の内容
- template: `template-v3`
- VNet: なし

## Container Apps Job の設定

Job には Azure resource の作成・削除に必要な Managed Identity role を付与します。
API の Managed Identity には Job の start action だけを許可します。

Job secret:

- RAG config JSON
- contract-app の environment 別 MongoDB connection

API は secret value を受け取らず、Container Apps Job の secret reference 名だけを指定します。
`RAG_REQUEST_JSON` は contract ID、resource key、契約期間、storage size、request ID だけを含みます。
