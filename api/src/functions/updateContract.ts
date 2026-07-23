import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { authorizeAdmin } from "../auth/admin";
import { contractEnvironments } from "../config/environments";
import { getContractModel } from "../models/contract";

const UpdatePayloadSchema = z.object({
  selectedEnv: z.enum(contractEnvironments),
  _id: z.string().min(1),
  points: z.number().int().nonnegative(),
});

export async function updateContract(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const authorization = authorizeAdmin(request);
  if (authorization.response) return authorization.response;

  try {
    const body = UpdatePayloadSchema.parse(await request.json());
    const { selectedEnv, _id, points } = body;

    const ContractModel = await getContractModel(selectedEnv);
    const updated = await ContractModel.findByIdAndUpdate(
      _id,
      { $set: { points } },
      { new: true } // ← 更新後のドキュメントを返す
    ).lean();

    if (!updated) {
      return {
        status: 404,
        body: "Contract not found"
      };
    }

    return {
      status: 200,
      jsonBody: updated
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: 400,
        jsonBody: { error: "Invalid request", details: error.issues },
      };
    }
    context.error("Error updating contract");
    return {
      status: 500,
      body: "Error updating contract"
    };
  }
}

app.http("updateContract", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: updateContract
});
