import { HttpRequest, HttpResponseInit } from "@azure/functions";

export type AdminPrincipal = {
  userId: string;
  userDetails: string;
  identityProvider: string;
  userRoles: string[];
};

type AuthorizationResult =
  | { principal: AdminPrincipal; response?: never }
  | { principal?: never; response: HttpResponseInit };

function parsePrincipal(request: HttpRequest): AdminPrincipal | null {
  const encoded = request.headers.get("x-ms-client-principal");
  if (!encoded) return null;

  try {
    const principal = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8")
    ) as Partial<AdminPrincipal>;
    if (!principal.userId || !Array.isArray(principal.userRoles)) {
      return null;
    }
    return {
      userId: principal.userId,
      userDetails: principal.userDetails ?? principal.userId,
      identityProvider: principal.identityProvider ?? "unknown",
      userRoles: principal.userRoles,
    };
  } catch {
    return null;
  }
}

function localPrincipal(): AdminPrincipal | null {
  const isDevelopment =
    process.env.NODE_ENV === "development" ||
    process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Development";

  if (!isDevelopment || process.env.ALLOW_LOCAL_ADMIN !== "true") return null;

  return {
    userId: "local-admin",
    userDetails: "local-admin",
    identityProvider: "local",
    userRoles: ["admin"],
  };
}

export function authorizeAdmin(request: HttpRequest): AuthorizationResult {
  const principal = parsePrincipal(request) ?? localPrincipal();
  if (!principal) {
    return {
      response: {
        status: 401,
        jsonBody: { error: "Authentication required" },
      },
    };
  }

  const configuredAdmins = (process.env.ADMIN_USERS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const identities = [principal.userId, principal.userDetails].map((value) =>
    value.toLowerCase()
  );
  const isAdmin =
    principal.userRoles.includes("admin") ||
    configuredAdmins.some((admin) => identities.includes(admin));

  if (!isAdmin) {
    return {
      response: {
        status: 403,
        jsonBody: { error: "Administrator role required" },
      },
    };
  }

  return { principal };
}
