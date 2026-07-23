# 契約アプリ

契約関連業務を管理するためのReact + Azure Functionsアプリです。

## 構造

- frontend/` : Reactフロントエンド (Vite)
- api/` : Azure Functions バックエンド (TypeScript)

## デプロイメント

Azure Static Web Apps (SWA) と GitHub Actions 経由でデプロイ。

## RAG provisioning

初回リリースは開発環境の V3 RAG 作成・削除を対象とします。

- config: `mitoco-ai-rag-dev-v3.json`
- template: `template-v3`
- VNet: なし
- worker: Azure Container Apps Job

Secret を browser や repository に配置せず、standalone Azure Functions から
Managed Identity で Container Apps Job を開始します。

詳細は [docs/rag-provisioning.md](docs/rag-provisioning.md) を参照してください。
