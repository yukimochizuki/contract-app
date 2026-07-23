import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { z } from "zod";
import { authorizeAdmin } from "../auth/admin";
import { contractEnvironments } from "../config/environments";
import { getLogModel } from "../models/log";

const CreateCollectionSchema = z.object({
  contractId: z.string().min(1, "contractId is required"),
  selectedEnv: z.enum(contractEnvironments),
});

export async function createCollection(
  request: HttpRequest
): Promise<HttpResponseInit> {
  const authorization = authorizeAdmin(request);
  if (authorization.response) return authorization.response;

  try {
    const json = await request.json();
    const body = CreateCollectionSchema.parse(json);
    const { contractId, selectedEnv } = body;

    await getLogModel(contractId, selectedEnv);

    return {
      status: 201,
      body: "Collection created",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: 400,
        jsonBody: { error: "Invalid request", details: error.issues },
      };
    }

    return {
      status: 500,
      body: "Internal Server Error",
    };
  }
}

app.http("createCollection", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: createCollection,
});
