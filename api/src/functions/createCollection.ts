import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { getLogModel } from "../models/log"; // ★ 必ずasync関数でexport
import { z } from "zod";

// 型定義
const CreateCollectionSchema = z.object({
  contractId: z.string().min(1, "contractId is required"),
});

type CreateCollectionRequest = z.infer<typeof CreateCollectionSchema>;

export async function createCollection(
  request: HttpRequest
): Promise<HttpResponseInit> {
  try {
    const json = await request.json();
    const body = CreateCollectionSchema.parse(json); // バリデーション
    const { contractId } = body;

    await getLogModel(contractId); // ← await必須

    return {
      status: 201,
      body: "Collection created",
    };
  } catch (err: any) {
    if (err.name === "ZodError") {
      return {
        status: 400,
        jsonBody: { error: "Invalid request", details: err.errors },
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
