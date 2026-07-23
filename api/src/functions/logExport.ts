import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { authorizeAdmin } from "../auth/admin";
import { isContractEnvironment } from "../config/environments";
import { getContractModel } from "../models/contract";
import getLogModel from "../models/log";
import { stringify } from "csv-stringify/sync";
import * as JSZip from "jszip";

type ExportLog = {
  salesforceUserId?: string;
  created?: string;
  lastMessageContent?: string;
  openaiResMessageContent?: string;
  queryResult?: string;
  openAiError?: string;
  openAiErrorParam?: string;
  contentFilter?: string;
  feedback?: { evaluation?: string; comment?: string };
  additionalPrompt?: string;
  additionalPromptBot?: string;
  model?: string;
  systemPrompt?: string;
  completion_tokens?: number;
  prompt_tokens?: number;
  total_tokens?: number;
};

function flattenAndExpand(obj: ExportLog) {
    return {
      salesforceUserId: obj.salesforceUserId ?? "",
      created: obj.created ?? "",
      lastMessageContent: obj.lastMessageContent ?? "",
      openaiResMessageContent: obj.openaiResMessageContent ?? "",
      queryResult: obj.queryResult ?? "",
      openAiError: obj.openAiError ?? "",
      openAiErrorParam: obj.openAiErrorParam ?? "",
      contentFilter: obj.contentFilter ?? "",
      feedback_evaluation: obj.feedback?.evaluation ?? "",
      feedback_comment: obj.feedback?.comment ?? "",
      additionalPrompt: obj.additionalPrompt ?? "",
      additionalPromptBot: obj.additionalPromptBot ?? "",
      model: obj.model ?? "",
      systemPrompt: obj.systemPrompt ?? "",
      completion_tokens: obj.completion_tokens ?? "",
      prompt_tokens: obj.prompt_tokens ?? "",
      total_tokens: obj.total_tokens ?? "",
    };
}

const getAggregationPipeline = () => [
    {
      $project: {
        salesforceUserId: 1,
        created: {
          $dateToString: {
            format: "%Y/%m/%d %H:%M:%S",
            timezone: "+09:00",
            date: {
              $toDate: { $multiply: ["$openaiRes.created", 1000] },
            },
          },
        },
        lastMessageContent: { $last: "$messages.content" },
        openaiResMessageContent: { $first: "$openaiRes.choices.message.content" },
        queryResult: 1,
        openAiError: "$openaiRes.error.message",
        openAiErrorParam: "$openaiRes.error.param",
        contentFilter: "$openaiRes.error.innererror",
        feedback: 1,
        additionalPrompt: 1,
        additionalPromptBot: 1,
        model: 1,
        systemPrompt: 1,
        completion_tokens: "$openaiRes.usage.completion_tokens",
        prompt_tokens: "$openaiRes.usage.prompt_tokens",
        total_tokens: "$openaiRes.usage.total_tokens",
      },
    },
];

export async function logExport(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const authorization = authorizeAdmin(request);
  if (authorization.response) return authorization.response;

  try {
    const requestBody = await request.json();
    const { contractIds, format, selectedEnv } = requestBody as {
      contractIds: string[];
      format?: string;
      selectedEnv?: string;
    };

    if (!Array.isArray(contractIds) || !isContractEnvironment(selectedEnv)) {
      return {
        status: 400,
        jsonBody: { error: "contractIds and selectedEnv are required" },
      };
    }

    if (format !== "csv" && format !== "json") {
      return {
        status: 400,
        jsonBody: { error: "format must be csv or json" },
      };
    }

    await getContractModel(selectedEnv);
    const zip = new JSZip();
    const now = new Date();
    const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
    const hhmmss = now.toTimeString().slice(0, 8).replace(/:/g, "");

    for (const contractId of contractIds) {
      try {
        const LogModel = await getLogModel(contractId, selectedEnv);
        const results = await LogModel.aggregate<ExportLog>(
          getAggregationPipeline()
        ).exec();
        const safeContractId = contractId.replace(/[^a-zA-Z0-9_-]/g, "_");

        if (format === "csv") {
          const flatResults = results.map(flattenAndExpand);
          const csv = stringify(flatResults, { header: true });
          zip.file(
            `logs_${safeContractId}_${yyyymmdd}_${hhmmss}.csv`,
            csv
          );
        } else {
          zip.file(
            `logs_${safeContractId}_${yyyymmdd}_${hhmmss}.json`,
            JSON.stringify(results, null, 2)
          );
        }
      } catch {
        context.warn(`Log export skipped for contract ${contractId}`);
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    return {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=logs_${yyyymmdd}_${hhmmss}.zip`,
        "Access-Control-Expose-Headers": "Content-Disposition",
      },
      body: zipBuffer,
    };
  } catch {
    context.error("Log export failed");
    return {
      status: 500,
      jsonBody: { error: "ログダウンロードに失敗しました" },
    };
  }
}

app.http("logExport", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: logExport,
});
  