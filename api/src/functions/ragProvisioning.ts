import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { randomUUID } from "crypto";
import { z } from "zod";
import { authorizeAdmin } from "../auth/admin";
import {
  isRagContractEnvironment,
  ragContractEnvironments,
  RagContractEnvironment,
} from "../config/environments";
import { getContractModel } from "../models/contract";
import {
  getRagProvisioningRequestModel,
  IRagProvisioningRequest,
  RagOperation,
} from "../models/ragProvisioningRequest";
import { startRagContainerAppJob } from "../rag/containerAppJob";
import {
  createRagResourceKey,
  createRagResourceNames,
} from "../rag/resourceNames";

const createRequestSchema = z
  .object({
    selectedEnv: z.enum(ragContractEnvironments),
    contractId: z.string().trim().min(1),
    storageSizeMB: z.number().int().positive(),
  })
  .strict();

const deleteRequestSchema = z
  .object({
    selectedEnv: z.enum(ragContractEnvironments),
    contractId: z.string().trim().min(1),
    confirmationContractId: z.string().trim().min(1),
  })
  .strict();

const activeStatuses = ["QUEUED", "RUNNING"] as const;

function selectedEnvironment(
  request: HttpRequest
): RagContractEnvironment | null {
  const selectedEnv = request.query.get("selectedEnv");
  return isRagContractEnvironment(selectedEnv) ? selectedEnv : null;
}

function stepsFor(operation: RagOperation) {
  const names =
    operation === "CREATE"
      ? ["BLOB", "SEARCH", "DATABASE", "VALIDATION"]
      : ["SEARCH", "BLOB", "DATABASE", "VALIDATION"];
  return names.map((name) => ({
    name,
    status: "PENDING" as const,
    updatedAt: new Date(),
  }));
}

async function queueRequest(
  requestDocument: IRagProvisioningRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const RequestModel = await getRagProvisioningRequestModel(
    requestDocument.contractEnvironment
  );

  try {
    const document = await RequestModel.create(requestDocument);
    try {
      const executionName = await startRagContainerAppJob(document.toObject());
      document.executionName = executionName;
      await document.save();
      return {
        status: 202,
        jsonBody: document.toObject(),
      };
    } catch {
      context.error("Unable to start RAG worker");
      document.status = "FAILED";
      document.error = "RAG worker could not be started";
      document.completedAt = new Date();
      document.lockKey = undefined;
      await document.save();
      return {
        status: 503,
        jsonBody: {
          error: "RAG worker is not available",
          requestId: document.requestId,
        },
      };
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return {
        status: 409,
        jsonBody: { error: "Another RAG operation is already running" },
      };
    }
    throw error;
  }
}

export async function getRagContracts(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const authorization = authorizeAdmin(request);
  if (authorization.response) return authorization.response;

  const environment = selectedEnvironment(request);
  if (!environment) {
    return {
      status: 400,
      jsonBody: { error: "Development contract environment is required" },
    };
  }

  try {
    const ContractModel = await getContractModel(environment);
    const RequestModel = await getRagProvisioningRequestModel(environment);
    const contracts = await ContractModel.find({}).sort({ contractId: 1 }).lean();
    const requests = await RequestModel.find({
      contractId: { $in: contracts.map((contract) => contract.contractId) },
    })
      .sort({ createdAt: -1 })
      .lean();
    const latestByContract = new Map<string, (typeof requests)[number]>();
    const latestSuccessfulByContract = new Map<
      string,
      (typeof requests)[number]
    >();

    for (const ragRequest of requests) {
      if (!latestByContract.has(ragRequest.contractId)) {
        latestByContract.set(ragRequest.contractId, ragRequest);
      }
      if (
        ragRequest.status === "SUCCEEDED" &&
        !latestSuccessfulByContract.has(ragRequest.contractId)
      ) {
        latestSuccessfulByContract.set(ragRequest.contractId, ragRequest);
      }
    }

    return {
      status: 200,
      jsonBody: contracts.map((contract) => {
        const resourceKey = createRagResourceKey(
          contract.contractId,
          environment
        );
        return {
          ...contract,
          ragPreview: {
            resourceKey,
            resources: createRagResourceNames(resourceKey),
          },
          latestRagRequest: latestByContract.get(contract.contractId) ?? null,
          ragActive:
            latestSuccessfulByContract.get(contract.contractId)?.operation ===
            "CREATE",
        };
      }),
    };
  } catch {
    context.error("Failed to load RAG contracts");
    return {
      status: 500,
      jsonBody: { error: "Failed to load contracts" },
    };
  }
}

export async function getRagRequests(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const authorization = authorizeAdmin(request);
  if (authorization.response) return authorization.response;

  const environment = selectedEnvironment(request);
  if (!environment) {
    return {
      status: 400,
      jsonBody: { error: "Development contract environment is required" },
    };
  }

  try {
    const RequestModel = await getRagProvisioningRequestModel(environment);
    const contractId = request.query.get("contractId");
    const filter = contractId ? { contractId } : {};
    const requests = await RequestModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return { status: 200, jsonBody: requests };
  } catch {
    context.error("Failed to load RAG requests");
    return {
      status: 500,
      jsonBody: { error: "Failed to load RAG requests" },
    };
  }
}

export async function createRagRequest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const authorization = authorizeAdmin(request);
  if (authorization.response) return authorization.response;

  try {
    const payload = createRequestSchema.parse(await request.json());
    const ContractModel = await getContractModel(payload.selectedEnv);
    const RequestModel = await getRagProvisioningRequestModel(payload.selectedEnv);
    const contract = await ContractModel.findOne({
      contractId: payload.contractId,
    }).lean();

    if (!contract) {
      return { status: 404, jsonBody: { error: "Contract not found" } };
    }

    const now = new Date();
    if (contract.startDate > now || contract.endDate < now) {
      return {
        status: 409,
        jsonBody: { error: "RAG can only be created for an active contract" },
      };
    }

    const running = await RequestModel.exists({
      contractId: payload.contractId,
      status: { $in: activeStatuses },
    });
    if (running) {
      return {
        status: 409,
        jsonBody: { error: "Another RAG operation is already running" },
      };
    }

    const latest = await RequestModel.findOne({
      contractId: payload.contractId,
    })
      .sort({ createdAt: -1 })
      .lean();
    const latestSuccessful = await RequestModel.findOne({
      contractId: payload.contractId,
      status: "SUCCEEDED",
    })
      .sort({ createdAt: -1 })
      .lean();
    if (latestSuccessful?.operation === "CREATE") {
      return {
        status: 409,
        jsonBody: { error: "RAG resources already exist for this contract" },
      };
    }

    const resourceKey =
      latest?.resourceKey ??
      createRagResourceKey(payload.contractId, payload.selectedEnv);
    if (!latest) {
      const conflict = await RequestModel.exists({
        resourceKey,
        contractId: { $ne: payload.contractId },
      });
      if (conflict) {
        return {
          status: 409,
          jsonBody: { error: "Unable to allocate a unique RAG resource key" },
        };
      }
    }
    const requestId = randomUUID();
    return await queueRequest(
      {
        requestId,
        operation: "CREATE",
        environment: "development",
        contractEnvironment: payload.selectedEnv,
        contractId: payload.contractId,
        resourceKey,
        contractStartDate: contract.startDate,
        contractEndDate: contract.endDate,
        storageSizeMB: payload.storageSizeMB,
        requestedBy: authorization.principal.userDetails,
        confirmedBy: authorization.principal.userDetails,
        status: "QUEUED",
        lockKey: `${payload.selectedEnv}:${payload.contractId}`,
        resources: createRagResourceNames(resourceKey),
        steps: stepsFor("CREATE"),
      },
      context
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: 400,
        jsonBody: { error: "Invalid request", details: error.issues },
      };
    }
    context.error("Failed to create RAG request");
    return {
      status: 500,
      jsonBody: { error: "Failed to create RAG request" },
    };
  }
}

export async function deleteRagRequest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const authorization = authorizeAdmin(request);
  if (authorization.response) return authorization.response;

  try {
    const payload = deleteRequestSchema.parse(await request.json());
    if (payload.confirmationContractId !== payload.contractId) {
      return {
        status: 400,
        jsonBody: { error: "Contract ID confirmation does not match" },
      };
    }

    const ContractModel = await getContractModel(payload.selectedEnv);
    const RequestModel = await getRagProvisioningRequestModel(payload.selectedEnv);
    const contract = await ContractModel.findOne({
      contractId: payload.contractId,
    }).lean();
    if (!contract) {
      return { status: 404, jsonBody: { error: "Contract not found" } };
    }
    if (contract.endDate > new Date()) {
      return {
        status: 409,
        jsonBody: { error: "RAG can only be deleted after the contract ends" },
      };
    }

    const running = await RequestModel.exists({
      contractId: payload.contractId,
      status: { $in: activeStatuses },
    });
    if (running) {
      return {
        status: 409,
        jsonBody: { error: "Another RAG operation is already running" },
      };
    }

    const createRequest = await RequestModel.findOne({
      contractId: payload.contractId,
      operation: "CREATE",
      status: "SUCCEEDED",
    })
      .sort({ createdAt: -1 })
      .lean();
    if (!createRequest) {
      return {
        status: 409,
        jsonBody: { error: "No active RAG resources were found" },
      };
    }

    const completedDelete = await RequestModel.exists({
      contractId: payload.contractId,
      operation: "DELETE",
      status: "SUCCEEDED",
      createdAt: { $gt: createRequest.createdAt ?? new Date(0) },
    });
    if (completedDelete) {
      return {
        status: 409,
        jsonBody: { error: "RAG resources have already been deleted" },
      };
    }

    const requestId = randomUUID();
    return await queueRequest(
      {
        requestId,
        operation: "DELETE",
        environment: "development",
        contractEnvironment: payload.selectedEnv,
        contractId: payload.contractId,
        resourceKey: createRequest.resourceKey,
        contractStartDate: contract.startDate,
        contractEndDate: contract.endDate,
        storageSizeMB: createRequest.storageSizeMB,
        requestedBy: authorization.principal.userDetails,
        confirmedBy: authorization.principal.userDetails,
        status: "QUEUED",
        lockKey: `${payload.selectedEnv}:${payload.contractId}`,
        resources: createRequest.resources,
        steps: stepsFor("DELETE"),
      },
      context
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: 400,
        jsonBody: { error: "Invalid request", details: error.issues },
      };
    }
    context.error("Failed to create RAG deletion request");
    return {
      status: 500,
      jsonBody: { error: "Failed to create RAG deletion request" },
    };
  }
}

app.http("getRagContracts", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: getRagContracts,
});

app.http("getRagRequests", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: getRagRequests,
});

app.http("createRagRequest", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: createRagRequest,
});

app.http("deleteRagRequest", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: deleteRagRequest,
});
