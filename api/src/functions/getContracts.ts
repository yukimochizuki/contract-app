import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { getContractModel } from "../models/contract";

export async function getContracts(
  request: HttpRequest
): Promise<HttpResponseInit> {
  try {
    // 必ずPOSTのみ許可
    if (request.method !== "POST") {
      return {
        status: 405,
        jsonBody: { error: "Method Not Allowed" },
      };
    }

    // ボディからselectedEnv取得
    const body = (await request.json()) as { selectedEnv?: string };
    const selectedEnv = body.selectedEnv;
    if (
      !selectedEnv ||
      !["dev1", "dev2", "dev3", "prod"].includes(selectedEnv)
    ) {
      return {
        status: 400,
        jsonBody: { error: "Invalid or missing selectedEnv" },
      };
    }

    const ContractModel = await getContractModel(selectedEnv);
    const contracts = await ContractModel.find({}).lean(); // ★ここを修正
    return {
      status: 200,
      jsonBody: contracts,
    };
  } catch (err) {
    return {
      status: 500,
      jsonBody: { error: "Internal Server Error" },
    };
  }
}

app.http("getContracts", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: getContracts,
});
