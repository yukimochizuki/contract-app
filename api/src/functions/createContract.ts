import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { authorizeAdmin } from "../auth/admin";
import { contractEnvironments } from "../config/environments";
import { getContractModel } from "../models/contract";

const ContractPayloadSchema = z
  .object({
    selectedEnv: z.enum(contractEnvironments),
    contractId: z.string().trim().min(1),
    startDate: z.number().int().positive(),
    endDate: z.number().int().positive(),
    points: z.number().int().nonnegative(),
    conversation: z.string().optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "endDate must be greater than or equal to startDate",
    path: ["endDate"],
  });

export async function createContract(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const authorization = authorizeAdmin(request);
  if (authorization.response) return authorization.response;

  try {
    const body = ContractPayloadSchema.parse(await request.json());
    const { selectedEnv, contractId, startDate, endDate, points, conversation } =
      body;

    const ContractModel = await getContractModel(selectedEnv);
    const doc = await ContractModel.create({
      contractId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      points,
      conversation,
    });

    return {
      status: 201,
      jsonBody: doc.toObject()
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: 400,
        jsonBody: { error: "Invalid request", details: error.issues },
      };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return {
        status: 409,
        body: "Contract already exists"
      };
    }

    context.error("Error inserting contract");
    return {
      status: 500,
      body: "Failed to insert contract"
    };
  }
}

app.http("createContract", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: createContract
});
