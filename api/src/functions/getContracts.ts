import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { authorizeAdmin } from "../auth/admin";
import { isContractEnvironment } from "../config/environments";
import { getContractModel } from "../models/contract";

export async function getContracts(
  request: HttpRequest
): Promise<HttpResponseInit> {
  const authorization = authorizeAdmin(request);
  if (authorization.response) return authorization.response;

  try {
    const body = (await request.json()) as { selectedEnv?: string };
    const selectedEnv = body.selectedEnv;
    if (!isContractEnvironment(selectedEnv)) {
      return {
        status: 400,
        jsonBody: { error: "Invalid or missing selectedEnv" },
      };
    }

    const ContractModel = await getContractModel(selectedEnv);
    const contracts = await ContractModel.find({}).lean();
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
  methods: ["POST"],
  authLevel: "anonymous",
  handler: getContracts,
});
