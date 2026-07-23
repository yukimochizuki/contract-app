import { createHash } from "crypto";
import { RagContractEnvironment } from "../config/environments";
import { RagResourceNames } from "../models/ragProvisioningRequest";

export function createRagResourceKey(
  contractId: string,
  contractEnvironment: RagContractEnvironment
): string {
  const slug = contractId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 18);
  const hash = createHash("sha256")
    .update(`${contractEnvironment}:${contractId}`)
    .digest("hex")
    .slice(0, 20);
  return `rag-${slug || "contract"}-${hash}`;
}

export function createRagResourceNames(resourceKey: string): RagResourceNames {
  return {
    blobContainers: [
      resourceKey,
      `${resourceKey}-text`,
      `${resourceKey}-graphrag`,
    ],
    searchIndex: resourceKey,
    searchDatasource: `${resourceKey}-datasource`,
    searchSkillset: `${resourceKey}-skillset`,
    searchIndexer: `${resourceKey}-indexer`,
    settingCollection: `setting_${resourceKey}`,
    contractRagRecord: resourceKey,
    graphRagContainerPrefix: `${resourceKey}-`,
  };
}
