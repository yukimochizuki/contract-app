import { Model, Schema } from "mongoose";
import { getConn } from "../config/cosmosDB";
import { RagContractEnvironment } from "../config/environments";

export type RagOperation = "CREATE" | "DELETE";
export type RagRequestStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "PARTIALLY_FAILED";
export type RagStepStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type RagResourceNames = {
  blobContainers: string[];
  searchIndex: string;
  searchDatasource: string;
  searchSkillset: string;
  searchIndexer: string;
  settingCollection: string;
  contractRagRecord: string;
  graphRagContainerPrefix: string;
};

export interface IRagProvisioningRequest {
  requestId: string;
  operation: RagOperation;
  environment: "development";
  contractEnvironment: RagContractEnvironment;
  contractId: string;
  resourceKey: string;
  contractStartDate: Date;
  contractEndDate: Date;
  storageSizeMB?: number;
  requestedBy: string;
  confirmedBy: string;
  status: RagRequestStatus;
  lockKey?: string;
  resources: RagResourceNames;
  steps: Array<{
    name: string;
    status: RagStepStatus;
    message?: string;
    updatedAt: Date;
  }>;
  executionName?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const ragProvisioningRequestSchema = new Schema<IRagProvisioningRequest>(
  {
    requestId: { type: String, required: true, unique: true },
    operation: { type: String, enum: ["CREATE", "DELETE"], required: true },
    environment: { type: String, enum: ["development"], required: true },
    contractEnvironment: {
      type: String,
      enum: ["dev1", "dev2", "dev3"],
      required: true,
    },
    contractId: { type: String, required: true, index: true },
    resourceKey: { type: String, required: true },
    contractStartDate: { type: Date, required: true },
    contractEndDate: { type: Date, required: true },
    storageSizeMB: Number,
    requestedBy: { type: String, required: true },
    confirmedBy: { type: String, required: true },
    status: {
      type: String,
      enum: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "PARTIALLY_FAILED"],
      required: true,
    },
    lockKey: { type: String, unique: true, sparse: true },
    resources: {
      blobContainers: { type: [String], required: true },
      searchIndex: { type: String, required: true },
      searchDatasource: { type: String, required: true },
      searchSkillset: { type: String, required: true },
      searchIndexer: { type: String, required: true },
      settingCollection: { type: String, required: true },
      contractRagRecord: { type: String, required: true },
      graphRagContainerPrefix: { type: String, required: true },
    },
    steps: [
      {
        name: { type: String, required: true },
        status: {
          type: String,
          enum: ["PENDING", "RUNNING", "SUCCEEDED", "FAILED"],
          required: true,
        },
        message: String,
        updatedAt: { type: Date, required: true },
      },
    ],
    executionName: String,
    error: String,
    startedAt: Date,
    completedAt: Date,
  },
  {
    timestamps: true,
    collection: "RagProvisioningRequest",
  }
);

ragProvisioningRequestSchema.index({
  contractEnvironment: 1,
  contractId: 1,
  createdAt: -1,
});

const models = new Map<string, Model<IRagProvisioningRequest>>();

export async function getRagProvisioningRequestModel(
  selectedEnv: RagContractEnvironment
): Promise<Model<IRagProvisioningRequest>> {
  const existing = models.get(selectedEnv);
  if (existing) return existing;

  const conn = await getConn(selectedEnv);
  const registered = conn.models.RagProvisioningRequest as
    | Model<IRagProvisioningRequest>
    | undefined;
  const model =
    registered ??
    conn.model<IRagProvisioningRequest>(
      "RagProvisioningRequest",
      ragProvisioningRequestSchema
    );
  models.set(selectedEnv, model);
  return model;
}
