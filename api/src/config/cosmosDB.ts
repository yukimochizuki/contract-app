import mongoose from "mongoose";

const connections = new Map<string, mongoose.Connection>();

export async function getConn(env: string = "prod"): Promise<mongoose.Connection> {
  const uri = process.env[`MONGO_URI_${env.toUpperCase()}`];
  if (!uri) throw new Error(`MONGO_URI_${env.toUpperCase()} is not set`);

  const existing = connections.get(env);
  if (existing?.readyState === 1) return existing;
  if (existing?.readyState === 2) {
    await existing.asPromise();
    return existing;
  }
  if (existing) {
    await existing.close();
    connections.delete(env);
  }

  const connection = mongoose.createConnection(uri, {
    dbName:
      process.env[`MONGO_DB_NAME_${env.toUpperCase()}`] ??
      process.env.MONGO_DB_NAME ??
      "test",
    maxPoolSize: 1,
  });
  connections.set(env, connection);

  await connection.asPromise();
  return connection;
}
