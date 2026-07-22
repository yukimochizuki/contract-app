import { app, HttpRequest, HttpResponseInit } from "@azure/functions";

function extractAccountName(uri: string): string {
  try {
    // mongodb://user:pass@host:port でも mongodb+srv://user:pass@host/ でも対応
    const withoutProtocol = uri.replace(/^mongodb(\+srv)?:\/\//, "");
    const atIndex = withoutProtocol.indexOf("@");

    const hostSection =
      atIndex !== -1
        ? withoutProtocol.substring(atIndex + 1) // user:pass@host → host
        : withoutProtocol;

    const host = hostSection.split("/")[0].split("?")[0]; // host[:port] or host/?xxx
    return host || "不明";
  } catch (e) {
    return "不明";
  }
}

export async function getEnv(): Promise<HttpResponseInit> {
  const uri = process.env.MONGO_URI!;
  const accountName = extractAccountName(uri);
  const env = process.env.APP_ENV || "unknown";

  return {
    status: 200,
    jsonBody: {
      accountName,
      env
    }
  };
}

app.http("getEnv", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: getEnv,
});
