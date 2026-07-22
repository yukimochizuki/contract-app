import { Schema, Model } from "mongoose";
import { getConn } from "../config/cosmosDB";
import { formatInTimeZone } from "date-fns-tz";

// 1. 型インターフェース定義
export interface IContract {
  contractId: string;
  startDate: Date;
  endDate: Date;
  points: number;
  start?: string; // readable date: yyyy-MM-dd HH:mm:ss GMT+9
  end?: string; // readable date: yyyy-MM-dd HH:mm:ss GMT+9
  conversation?: string;
}

// 2. スキーマ
const contractSchema = new Schema<IContract>(
  {
    contractId: { type: String, required: true, unique: true },
    startDate: { type: Date, required: true },  // UNIXミリ秒
    endDate: { type: Date, required: true },    // UNIXミリ秒
    start: String, // フォーマット済み文字列
    end: String,
    points: { type: Number, required: true },
    conversation: { type: String },
  },
  {
    timestamps: true,
    collection: "Contract",
  }
);

contractSchema.pre("save", function (next) {
  const format = "yyyy-MM-dd HH:mm:ss XXX";
  if (this.isModified("startDate")) {
    this.start = formatInTimeZone(this.startDate, "Asia/Tokyo", format);
  }
  if (this.isModified("endDate")) {
    this.end = formatInTimeZone(this.endDate, "Asia/Tokyo", format);
  }
  next();
});

// 3. モデルのキャッシュ
let _model: Model<IContract> | null = null;

// 4. モデル取得関数（conn取得はawaitで!）
export async function getContractModel(selectedEnv: string): Promise<Model<IContract>> {
  if (_model) return _model;
  const conn = await getConn(selectedEnv);
  _model = conn.model<IContract>("Contract", contractSchema);
  return _model;
}
