
const ragUserCertification = async function (context, req) {
    // 開発用フラグ
    const isDev = process.env.NODE_ENV === "development" || process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Development";
    let principal = null;
  
    // SWA本番ならヘッダーから取得
    const principalHeader = req.headers["x-ms-client-principal"];
    if (principalHeader) {
      principal = JSON.parse(Buffer.from(principalHeader, "base64").toString());
    }
  
    // ローカル開発時はダミーユーザー
    if (!principal && isDev) {
      principal = {
        userId: "devuser",
        userDetails: "dev@example.com",
        userRoles: ["admin"],
        identityProvider: "local"
      };
    }
  
    if (!principal) {
      context.res = {
        status: 401,
        headers: { "Content-Type": "application/json" },
        body: { error: "Unauthorized" }
      };
      return;
    }
  
    // 必要ならロール/ユーザー制限
    // if (!principal.userRoles.includes("admin")) { ... }
  

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { message: `Hello, ${principal.userDetails}` }
    };
  };
  
  export default ragUserCertification;