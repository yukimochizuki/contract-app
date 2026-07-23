import { DefaultAzureCredential } from "@azure/identity";
import {
  IRagProvisioningRequest,
  RagResourceNames,
} from "../models/ragProvisioningRequest";

type WorkerRequest = {
  requestId: string;
  operation: IRagProvisioningRequest["operation"];
  environment: "development";
  contractEnvironment: IRagProvisioningRequest["contractEnvironment"];
  contractId: string;
  resourceKey: string;
  contractStartDate: string;
  contractEndDate: string;
  storageSizeMB?: number;
  resources: RagResourceNames;
};

type JobExecution = {
  name?: string;
};

const armScope = "https://management.azure.com/.default";
const apiVersion = "2025-07-01";

function requiredSetting(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function requestDatabaseSecretName(
  environment: IRagProvisioningRequest["contractEnvironment"]
): string {
  return requiredSetting(`RAG_REQUEST_DB_SECRET_${environment.toUpperCase()}`);
}

function requestDatabaseName(
  environment: IRagProvisioningRequest["contractEnvironment"]
): string {
  return (
    process.env[`RAG_REQUEST_DATABASE_NAME_${environment.toUpperCase()}`] ??
    process.env.RAG_REQUEST_DATABASE_NAME ??
    "test"
  );
}

async function readExecutionResponse(
  response: Response,
  accessToken: string
): Promise<JobExecution> {
  if (response.status === 200) return (await response.json()) as JobExecution;

  const location = response.headers.get("location");
  if (response.status !== 202 || !location) {
    throw new Error(`Container Apps Job start failed with status ${response.status}`);
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const pollResponse = await fetch(location, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (pollResponse.status === 202) continue;
    if (!pollResponse.ok) {
      throw new Error(
        `Container Apps Job polling failed with status ${pollResponse.status}`
      );
    }
    return (await pollResponse.json()) as JobExecution;
  }

  throw new Error("Container Apps Job start timed out");
}

export async function startRagContainerAppJob(
  request: IRagProvisioningRequest
): Promise<string> {
  const jobResourceId = requiredSetting("RAG_CONTAINER_APP_JOB_RESOURCE_ID");
  const image = requiredSetting("RAG_WORKER_IMAGE");
  const containerName = requiredSetting("RAG_WORKER_CONTAINER_NAME");
  const configSecret = requiredSetting("RAG_DEV_CONFIG_SECRET");
  const developmentSubscriptionId = requiredSetting("RAG_DEV_SUBSCRIPTION_ID");
  const developmentResourceGroup = requiredSetting("RAG_DEV_RESOURCE_GROUP");
  const databaseSecret = requestDatabaseSecretName(request.contractEnvironment);
  const workerRequest: WorkerRequest = {
    requestId: request.requestId,
    operation: request.operation,
    environment: "development",
    contractEnvironment: request.contractEnvironment,
    contractId: request.contractId,
    resourceKey: request.resourceKey,
    contractStartDate: request.contractStartDate.toISOString(),
    contractEndDate: request.contractEndDate.toISOString(),
    storageSizeMB: request.storageSizeMB,
    resources: request.resources,
  };

  const credential = new DefaultAzureCredential();
  const token = await credential.getToken(armScope);
  if (!token) throw new Error("Unable to acquire Azure management token");

  const response = await fetch(
    `https://management.azure.com${jobResourceId}/start?api-version=${apiVersion}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        containers: [
          {
            name: containerName,
            image,
            resources: {
              cpu: Number(process.env.RAG_WORKER_CPU ?? "0.5"),
              memory: process.env.RAG_WORKER_MEMORY ?? "1Gi",
            },
            env: [
              { name: "RAG_CONFIG_JSON", secretRef: configSecret },
              {
                name: "RAG_REQUEST_DATABASE_CONNECTION",
                secretRef: databaseSecret,
              },
              {
                name: "RAG_REQUEST_DATABASE_NAME",
                value: requestDatabaseName(request.contractEnvironment),
              },
              {
                name: "RAG_ALLOWED_SUBSCRIPTION_ID",
                value: developmentSubscriptionId,
              },
              {
                name: "RAG_ALLOWED_RESOURCE_GROUP",
                value: developmentResourceGroup,
              },
              {
                name: "RAG_REQUEST_JSON",
                value: JSON.stringify(workerRequest),
              },
            ],
          },
        ],
      }),
    }
  );

  const execution = await readExecutionResponse(response, token.token);
  if (!execution.name) throw new Error("Container Apps Job returned no execution name");
  return execution.name;
}
