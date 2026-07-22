import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";

dotenv.config();
const uri = process.env.MONGO_URI!;
const dbName = "test";

type UpdatePayload = {
  contractId: string;
};

export async function checkCollection(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const body = (await request.json()) as UpdatePayload;
  const contractId = body.contractId;

  if (!contractId) {
    return { status: 400, body: "Missing contractId" };
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const collections = await db
    .listCollections({ name: `logs_${contractId}` })
    .toArray();

  return {
    status: 200,
    jsonBody: { exists: collections.length > 0 },
  };
}

app.http("checkCollection", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: checkCollection,
});
