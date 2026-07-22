import mongoose from "mongoose";

let conn: mongoose.Connection | null = null;

// 1. コネクションの取得
export async function getConn(env: string = "prod"): Promise<mongoose.Connection> {

  const uri = process.env[`MONGO_URI_${env.toUpperCase()}`];
  if (!uri) throw new Error(`MONGO_URI_${env.toUpperCase()} is not set`);

  // 1. コネクションが存在し、状態が1（接続中）ならそれを返す
  if (conn && conn.readyState === 1) return conn;
  if (!conn) {
    // 2. コネクションが存在しない場合は新たに作成
    conn = mongoose.createConnection(uri, {
      dbName: "test",
      maxPoolSize: 1
    });
    await new Promise((resolve, reject) => {
      conn!.once("open", resolve);
      conn!.once("error", reject);
    });
    conn.on("connected", () => console.log("✅ Mongoose connected"));
    conn.on("error", (err) => console.error("❌ Mongoose connection error:", err));
  }
  return conn;
}
