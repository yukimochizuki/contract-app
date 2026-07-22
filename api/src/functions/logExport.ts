import {
    app,
    HttpRequest,
    HttpResponseInit,
    InvocationContext,
  } from "@azure/functions";
  import { getContractModel } from "../models/contract";
  import getLogModel from "../models/log";
  import { stringify } from "csv-stringify/sync";
  import * as JSZip from "jszip";
  
  function flattenAndExpand(obj: any) {
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
    try {
      const requestBody = await request.json();
      const { contractIds, format } = requestBody as {
        contractIds: string[];
        format?: string;
      };
  
      if (!Array.isArray(contractIds)) {
        return {
          status: 400,
          body: JSON.stringify({ error: "contractIds（配列）が必要です" }),
        };
      }
  
      await getContractModel();
  
      // CSVの場合：ZIPを作成
      if (format === "csv" || format === "json") {
        const zip = new JSZip();
        const now = new Date();
        const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
        const hhmmss = now.toTimeString().slice(0, 8).replace(/:/g, "");
      
        for (const contractId of contractIds) {
          try {
            const LogModel = await getLogModel(contractId);
            const results = await LogModel.aggregate(getAggregationPipeline()).exec();
      
            if (format === "csv") {
              const flatResults = results.map(flattenAndExpand);
              const csv = stringify(flatResults, { header: true });
              const fileName = `logs_${contractId}_${yyyymmdd}_${hhmmss}.csv`;
              zip.file(fileName, csv);
            } else {
              // JSONファイル
              const fileName = `logs_${contractId}_${yyyymmdd}_${hhmmss}.json`;
              zip.file(fileName, JSON.stringify(results, null, 2));
            }
          } catch (err) {
            context.log(`Warning: コレクションlogs_${contractId}でエラー: ${err}`);
          }
        }
      
        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
        return {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename=logs_${yyyymmdd}_${hhmmss}.zip`,
            "Access-Control-Expose-Headers": "Content-Disposition",
            "Access-Control-Allow-Origin": "*",
          },
          body: zipBuffer,
        };
      }
    } catch (err) {
      context.log("ログダウンロードAPIエラー:", err);
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
  