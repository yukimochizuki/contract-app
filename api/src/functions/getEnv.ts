import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { authorizeAdmin } from "../auth/admin";
import { isContractEnvironment } from "../config/environments";

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

export async function getEnv(request: HttpRequest): Promise<HttpResponseInit> {
  const authorization = authorizeAdmin(request);
  if (authorization.response) return authorization.response;

  const selectedEnv = request.query.get("selectedEnv");
  if (!isContractEnvironment(selectedEnv)) {
    return {
      status: 400,
      jsonBody: { error: "Invalid or missing selectedEnv" },
    };
  }

  const uri = process.env[`MONGO_URI_${selectedEnv.toUpperCase()}`];
  if (!uri) {
    return {
      status: 503,
      jsonBody: { error: `MONGO_URI_${selectedEnv.toUpperCase()} is not configured` },
    };
  }
  const accountName = extractAccountName(uri);

  return {
    status: 200,
    jsonBody: {
      accountName,
      env: selectedEnv,
    }
  };
}

app.http("getEnv", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: getEnv,
});
