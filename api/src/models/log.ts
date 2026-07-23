import { type HydratedDocumentFromSchema, Schema, Model } from "mongoose";
import { createHash } from "crypto";
import { LRUCache } from "lru-cache";
import { getConn } from "../config/cosmosDB";

const logSchema = new Schema({
  salesforceUserId: { type: String, index: true },
  salesforceOrgId: { type: String, index: true },
  contractId: { type: String, index: true },
  createdAt: { type: Date, index: true },
  botId: { type: String, index: true },
  botName: String,
  trigger: { type: String, index: true },
  encrypted: { type: Boolean, default: false },
  queryResult: String,
  sobjectInfo: Schema.Types.Mixed,
  systemPrompt: String,
  additionalPrompt: String,
  additionalPromptBot: String,
  model: String,
  feedback: { evaluation: String, comment: String },
  messages: [{ role: String, content: String }],
  openaiRes: {
    id: String,
    object: String,
    created: Number,
    model: String,
    prompt_filter_results: [
      {
        prompt_index: Number,
        content_filter_results: {
          hate: {
            filtered: Boolean,
            severity: String,
          },
          self_harm: {
            filtered: Boolean,
            severity: String,
          },
          sexual: {
            filtered: Boolean,
            severity: String,
          },
          violence: {
            filtered: Boolean,
            severity: String,
          },
        },
      },
    ],
    choices: [
      {
        index: Number,
        finish_reason: String,
        message: {
          role: String,
          content: String,
          function_call: {
            name: String,
            arguments: Schema.Types.Mixed,
          },
        },
        content_filter_results: {
          hate: {
            filtered: Boolean,
            severity: String,
          },
          self_harm: {
            filtered: Boolean,
            severity: String,
          },
          sexual: {
            filtered: Boolean,
            severity: String,
          },
          violence: {
            filtered: Boolean,
            severity: String,
          },
        },
      },
    ],
    usage: {
      completion_tokens: Number,
      prompt_tokens: Number,
      total_tokens: Number,
    },
    error: Schema.Types.Mixed,
  },
});
// add createdAt, updatedAt automatically
logSchema.set("timestamps", true);
logSchema.index({ createdAt: 1, _id: 1 });

// LRUキャッシュ（Model<LogDocument>型で）
const cache = new LRUCache<string, Model<LogDocument>>({ max: 20 });

export async function getLogModel(
  contractId: string,
  selectedEnv: string
): Promise<Model<LogDocument>> {
  const cacheKey = `${selectedEnv}:${contractId}`;
  let logModel = cache.get(cacheKey);
  if (!logModel) {
    const conn = await getConn(selectedEnv);
    const modelKey = createHash("sha256")
      .update(cacheKey)
      .digest("hex")
      .slice(0, 16);
    const modelName = `Log_${modelKey}`;
    logModel =
      (conn.models[modelName] as Model<LogDocument> | undefined) ??
      conn.model<LogDocument>(modelName, logSchema, `logs_${contractId}`);
    cache.set(cacheKey, logModel);
    logModel.ensureIndexes({ background: true }).catch(() => {
      console.error("Log index creation failed");
    });
  }
  return logModel;
}
export default getLogModel;
export type LogDocument = HydratedDocumentFromSchema<typeof logSchema>;
