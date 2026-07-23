export const contractEnvironments = ["dev1", "dev2", "dev3", "prod"] as const;
export const ragContractEnvironments = ["dev1", "dev2", "dev3"] as const;

export type ContractEnvironment = (typeof contractEnvironments)[number];
export type RagContractEnvironment = (typeof ragContractEnvironments)[number];

export function isContractEnvironment(value: unknown): value is ContractEnvironment {
  return typeof value === "string" && contractEnvironments.includes(value as ContractEnvironment);
}

export function isRagContractEnvironment(value: unknown): value is RagContractEnvironment {
  return typeof value === "string" && ragContractEnvironments.includes(value as RagContractEnvironment);
}
