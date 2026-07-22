import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getContractModel } from "../models/contract";

type UpdatePayload = {
  _id: string;
  points: number;
};

export async function updateContract(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const body = await request.json() as UpdatePayload;
    const { _id, points } = body;

    if (!_id || points == null) {
      return {
        status: 400,
        body: "Missing _id or points"
      };
    }

    const ContractModel = await getContractModel();
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
  } catch (err) {
    context.log("Error updating contract:", err);
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
