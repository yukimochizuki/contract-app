import { type HydratedDocumentFromSchema, Schema, Model } from "mongoose";
import { LRUCache } from 'lru-cache'
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

// contractIdごとに物理分割されたコレクションのモデル取得
export async function getLogModel(contractId: string): Promise<Model<LogDocument>> {
  let logModel = cache.get(contractId);
  if (!logModel) {
    const conn = await getConn();
    logModel = conn.model<LogDocument>("Log", logSchema, `logs_${contractId}`);
    cache.set(contractId, logModel);
    // Index生成は不要 or どうしても必要なら下記
    logModel.ensureIndexes({ background: true }).catch((err) => {
      console.error("Index creation error:", err);
    });
  }
  return logModel;
}
export default getLogModel;
export type LogDocument = HydratedDocumentFromSchema<typeof logSchema>;
