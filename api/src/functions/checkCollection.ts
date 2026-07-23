import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { authorizeAdmin } from "../auth/admin";
import { isContractEnvironment } from "../config/environments";
import { getConn } from "../config/cosmosDB";

type UpdatePayload = {
  contractId: string;
  selectedEnv: string;
};

export async function checkCollection(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const authorization = authorizeAdmin(request);
  if (authorization.response) return authorization.response;

  const body = (await request.json()) as UpdatePayload;
  const { contractId, selectedEnv } = body;

  if (!contractId || !isContractEnvironment(selectedEnv)) {
    return { status: 400, body: "Missing contractId or selectedEnv" };
  }

  try {
    const connection = await getConn(selectedEnv);
    const collections = await connection.db
      .listCollections({ name: `logs_${contractId}` })
      .toArray();
    return {
      status: 200,
      jsonBody: { exists: collections.length > 0 },
    };
  } catch {
    context.error("Failed to check collection");
    return {
      status: 500,
      jsonBody: { error: "Failed to check collection" },
    };
  }
}

app.http("checkCollection", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: checkCollection,
});
