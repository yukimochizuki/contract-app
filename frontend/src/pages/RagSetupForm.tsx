import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEnvironment } from "../environment";

type UserInfo = {
  userId: string;
  userDetails: string;
  identityProvider: string;
};

type RagRequestStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "PARTIALLY_FAILED";

type RagResources = {
  blobContainers: string[];
  searchIndex: string;
  searchDatasource: string;
  searchSkillset: string;
  searchIndexer: string;
  settingCollection: string;
  contractRagRecord: string;
  graphRagContainerPrefix: string;
};

type RagRequest = {
  requestId: string;
  operation: "CREATE" | "DELETE";
  contractId: string;
  resourceKey: string;
  status: RagRequestStatus;
  resources: RagResources;
  steps: Array<{
    name: string;
    status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  }>;
  error?: string;
  createdAt: string;
};

type Contract = {
  _id: string;
  contractId: string;
  startDate: string;
  endDate: string;
  points: number;
  ragPreview: {
    resourceKey: string;
    resources: RagResources;
  };
  latestRagRequest: RagRequest | null;
  ragActive: boolean;
};

const activeStatuses: RagRequestStatus[] = ["QUEUED", "RUNNING"];
const apiBase = import.meta.env.VITE_API_BASE || "/api";

function apiUrl(path: string) {
  return `${apiBase.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function statusLabel(status: RagRequestStatus) {
  const labels: Record<RagRequestStatus, string> = {
    QUEUED: "待機中",
    RUNNING: "実行中",
    SUCCEEDED: "完了",
    FAILED: "失敗",
    PARTIALLY_FAILED: "一部失敗",
  };
  return labels[status];
}

export default function RagSetupForm() {
  const navigate = useNavigate();
  const { selectedEnv } = useEnvironment();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [requests, setRequests] = useState<RagRequest[]>([]);
  const [selectedContractId, setSelectedContractId] = useState("");
  const [storageSizeMB, setStorageSizeMB] = useState(3000);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isDevelopmentEnvironment = selectedEnv !== "prod";
  const selectedContract = useMemo(
    () =>
      contracts.find((contract) => contract.contractId === selectedContractId) ??
      null,
    [contracts, selectedContractId]
  );

  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const response = await fetch("/.auth/me");
        const body = await response.json();
        const principal = body?.clientPrincipal;
        if (principal?.userId) {
          setUser({
            userId: principal.userId,
            userDetails: principal.userDetails,
            identityProvider: principal.identityProvider,
          });
        }
      } finally {
        setLoadingAuth(false);
      }
    };
    void fetchAuth();
  }, []);

  const loadData = useCallback(async () => {
    if (!isDevelopmentEnvironment) {
      setContracts([]);
      setRequests([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ selectedEnv });
      const [contractsResponse, requestsResponse] = await Promise.all([
        fetch(apiUrl(`getRagContracts?${query}`)),
        fetch(apiUrl(`getRagRequests?${query}`)),
      ]);
      const contractsBody = await contractsResponse.json();
      const requestsBody = await requestsResponse.json();
      if (!contractsResponse.ok) {
        throw new Error(contractsBody.error || "契約一覧の取得に失敗しました");
      }
      if (!requestsResponse.ok) {
        throw new Error(requestsBody.error || "実行履歴の取得に失敗しました");
      }
      setContracts(contractsBody);
      setRequests(requestsBody);
      setSelectedContractId((current) => {
        if (current && contractsBody.some((contract: Contract) => contract.contractId === current)) {
          return current;
        }
        return contractsBody[0]?.contractId ?? "";
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "データ取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [isDevelopmentEnvironment, selectedEnv]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!requests.some((request) => activeStatuses.includes(request.status))) {
      return;
    }
    const timer = window.setInterval(() => void loadData(), 5000);
    return () => window.clearInterval(timer);
  }, [loadData, requests]);

  const submitRequest = async (
    endpoint: "createRagRequest" | "deleteRagRequest",
    payload: Record<string, unknown>
  ) => {
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "RAG request の登録に失敗しました");
      }
      setMessage(`Request ${body.requestId} を受け付けました`);
      setDeleteConfirmation("");
      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "RAG request の登録に失敗しました"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const createRag = async () => {
    if (!selectedContract) return;
    if (!window.confirm("表示された開発環境のRAGリソースを作成しますか？")) {
      return;
    }
    await submitRequest("createRagRequest", {
      selectedEnv,
      contractId: selectedContract.contractId,
      storageSizeMB,
    });
  };

  const deleteRag = async () => {
    if (!selectedContract) return;
    if (deleteConfirmation !== selectedContract.contractId) {
      setError("確認用Contract IDが一致しません");
      return;
    }
    if (!window.confirm("対象データは復元できません。RAGリソースを削除しますか？")) {
      return;
    }
    await submitRequest("deleteRagRequest", {
      selectedEnv,
      contractId: selectedContract.contractId,
      confirmationContractId: deleteConfirmation,
    });
  };

  const latest = selectedContract?.latestRagRequest;
  const hasRunningRequest = latest && activeStatuses.includes(latest.status);
  const ragIsActive = selectedContract?.ragActive ?? false;
  const contractEnded =
    selectedContract !== null && new Date(selectedContract.endDate) <= new Date();
  const contractActive =
    selectedContract !== null &&
    new Date(selectedContract.startDate) <= new Date() &&
    new Date(selectedContract.endDate) >= new Date();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mb-3 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              ホームへ戻る
            </button>
            <h1 className="text-3xl font-bold">V3 RAG新規作成・削除</h1>
            <p className="mt-2 text-sm text-slate-600">
              開発環境 / VNetなし / mitoco-ai-rag-dev-v3.json / template-v3 固定
            </p>
          </div>
          <div className="text-right text-sm text-slate-600">
            {loadingAuth ? (
              <span>認証確認中...</span>
            ) : user ? (
              <>
                <p>{user.userDetails}</p>
                <a className="text-blue-700 underline" href="/.auth/logout">
                  ログアウト
                </a>
              </>
            ) : (
              <a
                className="rounded bg-blue-700 px-4 py-2 font-semibold text-white"
                href="/.auth/login/aad"
              >
                Microsoftでログイン
              </a>
            )}
          </div>
        </header>

        {!isDevelopmentEnvironment && (
          <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
            本番環境のRAG操作は初回リリース対象外です。ホームで開発環境を選択してください。
          </section>
        )}

        {message && (
          <section className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
            {message}
          </section>
        )}
        {error && (
          <section className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
            {error}
          </section>
        )}

        {isDevelopmentEnvironment && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">既存契約を選択</h2>
                <button
                  type="button"
                  onClick={() => void loadData()}
                  disabled={loading}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
                >
                  {loading ? "更新中..." : "更新"}
                </button>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">Contract ID</span>
                <select
                  value={selectedContractId}
                  onChange={(event) => {
                    setSelectedContractId(event.target.value);
                    setDeleteConfirmation("");
                  }}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2"
                >
                  {contracts.map((contract) => (
                    <option key={contract.contractId} value={contract.contractId}>
                      {contract.contractId}
                    </option>
                  ))}
                </select>
              </label>

              {selectedContract ? (
                <div className="mt-5 space-y-5">
                  <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
                    <div>
                      <dt className="text-slate-500">契約開始</dt>
                      <dd>{new Date(selectedContract.startDate).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">契約終了</dt>
                      <dd>{new Date(selectedContract.endDate).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">points</dt>
                      <dd>{selectedContract.points}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">RAG状態</dt>
                      <dd>
                        {latest
                          ? `${latest.operation} / ${statusLabel(latest.status)}`
                          : "未作成"}
                      </dd>
                    </div>
                  </dl>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">
                      storageSize (MB)
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={storageSizeMB}
                      onChange={(event) =>
                        setStorageSizeMB(Number(event.target.value))
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </label>

                  <div>
                    <h3 className="mb-2 font-semibold">作成・削除対象</h3>
                    <div className="space-y-2 rounded-lg border border-slate-200 p-4 text-sm">
                      <p>
                        <span className="text-slate-500">Resource key:</span>{" "}
                        {selectedContract.ragPreview.resourceKey}
                      </p>
                      <p>
                        <span className="text-slate-500">Blob:</span>{" "}
                        {selectedContract.ragPreview.resources.blobContainers.join(", ")}
                      </p>
                      <p>
                        <span className="text-slate-500">Search:</span>{" "}
                        {selectedContract.ragPreview.resources.searchIndex},{" "}
                        {selectedContract.ragPreview.resources.searchDatasource},{" "}
                        {selectedContract.ragPreview.resources.searchSkillset},{" "}
                        {selectedContract.ragPreview.resources.searchIndexer}
                      </p>
                      <p>
                        <span className="text-slate-500">MongoDB:</span>{" "}
                        {selectedContract.ragPreview.resources.settingCollection},{" "}
                        ContractRag
                      </p>
                      <p>
                        <span className="text-slate-500">GraphRAG SQL:</span>{" "}
                        {selectedContract.ragPreview.resources.graphRagContainerPrefix}*
                        （存在する場合）
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void createRag()}
                    disabled={
                      submitting ||
                      Boolean(hasRunningRequest) ||
                      ragIsActive ||
                      !contractActive ||
                      !Number.isInteger(storageSizeMB) ||
                      storageSizeMB <= 0
                    }
                    className="w-full rounded bg-purple-700 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {submitting ? "送信中..." : "V3 RAGを作成"}
                  </button>

                  <div className="border-t border-slate-200 pt-5">
                    <h3 className="font-semibold text-red-800">契約終了後の手動削除</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      契約終了後のみ実行できます。Contract IDを再入力してください。
                    </p>
                    <input
                      value={deleteConfirmation}
                      onChange={(event) => setDeleteConfirmation(event.target.value)}
                      placeholder={selectedContract.contractId}
                      className="mt-3 w-full rounded border border-red-300 px-3 py-2"
                    />
                    <button
                      type="button"
                      onClick={() => void deleteRag()}
                      disabled={
                        submitting ||
                        Boolean(hasRunningRequest) ||
                        !contractEnded ||
                        !ragIsActive ||
                        deleteConfirmation !== selectedContract.contractId
                      }
                      className="mt-3 w-full rounded bg-red-700 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      RAGリソースを削除
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-slate-600">登録済み契約がありません。</p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">実行履歴</h2>
              <div className="mt-4 space-y-3">
                {requests.length === 0 && (
                  <p className="text-sm text-slate-600">実行履歴はありません。</p>
                )}
                {requests.map((request) => (
                  <article
                    key={request.requestId}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {request.operation} / {request.contractId}
                        </p>
                        <p className="mt-1 break-all text-xs text-slate-500">
                          {request.requestId}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                        {statusLabel(request.status)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      {request.steps.map((step) => (
                        <div key={step.name} className="rounded bg-slate-50 p-2">
                          {step.name}: {step.status}
                        </div>
                      ))}
                    </div>
                    {request.error && (
                      <p className="mt-3 text-sm text-red-700">{request.error}</p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
