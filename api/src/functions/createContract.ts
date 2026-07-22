import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getContractModel } from "../models/contract";

type ContractPayload = {
  contractId: string;
  startDate: number;  // UNIXミリ秒
  endDate: number;
  points: number;
  conversation?: string;
};

export async function createContract(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const body = await request.json() as ContractPayload;
    const { contractId, startDate, endDate, points } = body;

    if (!contractId || !startDate || !endDate || !points) {
      return {
        status: 400,
        body: "Missing required fields"
      };
    }

    const ContractModel = await getContractModel();
    const doc = await ContractModel.create({
      contractId,
      startDate: new Date(startDate),  // ← ここで変換
      endDate: new Date(endDate),
      points,
    });

    return {
      status: 201,
      jsonBody: doc.toObject()
    };
  } catch (err: any) {
    context.log("Error inserting contract:", err);

    // 重複エラーの処理（任意）
    if (err.code === 11000) {
      return {
        status: 409,
        body: "Contract already exists"
      };
    }

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
