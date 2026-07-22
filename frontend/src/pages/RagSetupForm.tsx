import React, { useEffect, useState } from "react";

type RagSetupStatus = "idle" | "running" | "success" | "error";
// SWA認証ユーザー型
type UserInfo = {
  userId: string;
  userDetails: string; // 通常はメールアドレス
  identityProvider: string;
};

export default function RagSetupForm() {
  const [contractId, setContractId] = useState("");
  const [configFile, setConfigFile] = useState<File | null>(null);
  const [template, setTemplate] = useState("");
  const [skipBlob, setSkipBlob] = useState(false);
  const [skipSearch, setSkipSearch] = useState(false);
  const [skipDatabase, setSkipDatabase] = useState(false);
  const [v3, setV3] = useState(false);
  const [status, setStatus] = useState<RagSetupStatus>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 認証ユーザー情報のstate
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // on mount: /.auth/me でユーザー情報取得
  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const res = await fetch("/.auth/me");
        const json = await res.json();
        if (
          json &&
          Array.isArray(json.clientPrincipal?.userRoles) &&
          json.clientPrincipal.userRoles.length > 0
        ) {
          // ログイン済み
          setUser({
            userId: json.clientPrincipal.userId,
            userDetails: json.clientPrincipal.userDetails,
            identityProvider: json.clientPrincipal.identityProvider,
          });
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoadingAuth(false);
      }
    };
    fetchAuth();
  }, []);

  // 設定ファイル（JSON）を読み込み
  const handleConfigFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setConfigFile(e.target.files[0]);
  };

  // on mount: /.auth/me でユーザー情報取得
  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const res = await fetch("/.auth/me");
        const json = await res.json();
        if (
          json &&
          Array.isArray(json.clientPrincipal?.userRoles) &&
          json.clientPrincipal.userRoles.length > 0
        ) {
          // ログイン済み
          setUser({
            userId: json.clientPrincipal.userId,
            userDetails: json.clientPrincipal.userDetails,
            identityProvider: json.clientPrincipal.identityProvider,
          });
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoadingAuth(false);
      }
    };
    fetchAuth();
  }, []);
  // ログイン・ログアウトプロバイダ（SWA標準例）
  const providers = [
    { id: "aad", label: "Microsoft" },
    { id: "github", label: "GitHub" },
    { id: "google", label: "Google" },
    // 必要なら他も
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("running");
    setLog([]);
    setError(null);

    if (configFile) {
      try {
        const text = await configFile.text();
        JSON.parse(text); // Parse the file to validate JSON format
      } catch {
        setStatus("error");
        setError("設定ファイルの読み込みに失敗しました");
        return;
      }
    }

    setLog((log) => [...log, "セットアップ開始..."]);

    const payload = {
      startDate: String,
      endDate: String,
    };

    try {
      const res = await fetch("/api/ragUserCertification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "APIエラー");

      setStatus("success");
      setLog((log) => [...log, "セットアップ完了！"]);
    } catch (err: unknown) {
      setStatus("error");
      if (err instanceof Error) {
        setError(err.message);
        setLog((log) => [...log, "エラー発生: " + err.message]);
      } else {
        setError("不明なエラーが発生しました");
        setLog((log) => [...log, "エラー発生: 不明なエラー"]);
      }
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6 bg-white shadow-xl rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">RAGセットアップ</h1>
        {loadingAuth ? (
          <span>認証確認中...</span>
        ) : user ? (
          <div className="flex items-center gap-2">
            <span className="text-gray-600 text-sm">
              {user.userDetails}（{user.identityProvider}）
            </span>
            <a
              href="/.auth/logout"
              className="ml-2 text-blue-600 hover:underline"
            >
              ログアウト
            </a>
          </div>
        ) : (
          <div className="flex gap-2">
            {providers.map((p) => (
              <a
                key={p.id}
                href={`/.auth/login/${p.id}`}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm"
              >
                {p.label}でログイン
              </a>
            ))}
          </div>
        )}
      </div>
      <h1 className="text-2xl font-bold mb-4">RAGセットアップ</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span>Contract ID</span>
          <input
            type="text"
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            className="mt-1 block w-full border rounded p-2"
            required
          />
        </label>
        <label className="block">
          <span>設定ファイル（JSON）</span>
          <input
            type="file"
            accept=".json"
            onChange={handleConfigFileChange}
            className="mt-1"
          />
        </label>
        <label className="block">
          <span>インデックステンプレート指定（パス/名前）</span>
          <input
            type="text"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="mt-1 block w-full border rounded p-2"
            placeholder="例: template"
          />
        </label>
        <div className="flex gap-4 items-center">
          <label>
            <input
              type="checkbox"
              checked={skipBlob}
              onChange={() => setSkipBlob(!skipBlob)}
            />
            Blob作成スキップ
          </label>
          <label>
            <input
              type="checkbox"
              checked={skipSearch}
              onChange={() => setSkipSearch(!skipSearch)}
            />
            Search作成スキップ
          </label>
          <label>
            <input
              type="checkbox"
              checked={skipDatabase}
              onChange={() => setSkipDatabase(!skipDatabase)}
            />
            DB作成スキップ
          </label>
          <label>
            <input type="checkbox" checked={v3} onChange={() => setV3(!v3)} />
            v3モード
          </label>
        </div>
        <button
          type="submit"
          className="w-full py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 transition disabled:bg-gray-400"
          disabled={status === "running"}
        >
          {status === "running" ? "実行中..." : "RAG領域セットアップ"}
        </button>
      </form>
      <div className="mt-6">
        <h2 className="font-bold">実行ログ</h2>
        <div className="bg-gray-100 rounded p-2 mt-2 h-24 overflow-y-auto text-sm">
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        {status === "success" && (
          <div className="mt-2 text-green-600 font-bold">完了しました！</div>
        )}
        {status === "error" && (
          <div className="mt-2 text-red-600 font-bold">エラー: {error}</div>
        )}
      </div>
    </div>
  );
}
