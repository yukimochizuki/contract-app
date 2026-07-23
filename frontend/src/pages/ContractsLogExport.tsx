import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEnvironment } from "../environment";

type Contract = {
  _id?: string;
  contractId: string;
  startDate: string;
  endDate: string;
  points: number;
  conversation: string;
};

const ContractsLogExport = () => {
  const [downloading, setDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState("csv");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<{ [id: string]: boolean }>({});
  const baseUrl = import.meta.env.VITE_API_BASE || "/api";
  const [accountInfo, setAccountInfo] = useState("");
  const navigate = useNavigate();
  const { selectedEnv } = useEnvironment();

  useEffect(() => {
    fetch(`${baseUrl}/getEnv?selectedEnv=${selectedEnv}`)
      .then((res) => res.json())
      .then((data) => {
        setAccountInfo(`接続先アカウント: ${data.accountName}（${data.env}）`);
      });
  }, [baseUrl, selectedEnv]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${baseUrl}/getContracts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedEnv }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch contracts");
        setContracts(data);
      } catch {
        setError("データ取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [baseUrl, selectedEnv]);

  // チェックボックス切り替え
  const handleCheck = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // ★ ログ出力（API POST → ファイルダウンロード）
  const handleLogOutput = async () => {
    // ダウンロード開始
    setDownloading(true);

    const selectedIds = contracts
      .filter((c) => checked[c._id ?? ""])
      .map((c) => c.contractId ?? "")
      .filter(Boolean);

    if (selectedIds.length === 0) {
      alert("1件以上選択してください");
      return;
    }

    try {
      // 1. API呼び出し
      const res = await fetch(`${baseUrl}/logExport`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractIds: selectedIds,
          format: downloadFormat,
          selectedEnv,
        }),
      });
      if (!res.ok) throw new Error("APIエラー");

      // ZIPなので必ずblobで取得
      const blob = await res.blob();

      // サーバーからのContent-Dispositionヘッダを利用する場合（推奨）
      let fileName = "logs.zip";
      const disposition = res.headers.get("Content-Disposition");
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) fileName = match[1];
      }
      // そのままダウンロード
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("ログ出力に失敗しました");
    } finally {
      // ダウンロード終了
      setDownloading(false);
    }
  };

  if (loading) return <p>読み込み中...</p>;
  if (error) return <p>エラー: {error}</p>;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-lg shadow hover:bg-gray-200 transition font-semibold"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          ホームへ戻る
        </button>
      </div>

      <h2 className="text-2xl font-bold mb-2">契約一覧</h2>
      <h3 className="text-sm text-gray-600 mb-4">{accountInfo}</h3>
      {/* ログ出力ボタン＆形式切替 */}
      <div className="mb-4 flex gap-2 items-center">
        <button
          onClick={handleLogOutput}
          className={`bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition ${
            downloading ? "opacity-60 cursor-not-allowed" : ""
          }`}
          disabled={Object.values(checked).every((v) => !v) || downloading}
        >
          {downloading ? "ダウンロード中..." : "選択した契約のログ出力"}
        </button>
        <select
          className="border border-gray-300 rounded px-2 py-1"
          value={downloadFormat}
          onChange={(e) => setDownloadFormat(e.target.value)}
        >
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
        </select>
        {downloading && (
          <span className="text-gray-600 animate-pulse">
            出力ファイル作成中...
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto border border-gray-400 bg-white shadow rounded-lg">
          <thead>
            <tr className="bg-gray-100 text-gray-700 text-left text-sm border-b border-gray-400">
              <th className="px-2 py-2 border-r border-gray-300 w-10">
                <input
                  type="checkbox"
                  checked={
                    contracts.length > 0 &&
                    contracts.every((c) => checked[c._id ?? ""])
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      // すべて選択
                      const allChecked: { [id: string]: boolean } = {};
                      contracts.forEach((c) => {
                        if (c._id) allChecked[c._id] = true;
                      });
                      setChecked(allChecked);
                    } else {
                      // すべて解除
                      setChecked({});
                    }
                  }}
                />
              </th>
              <th className="px-4 py-2 border-r border-gray-300">ID</th>
              <th className="px-4 py-2 border-r border-gray-300">開始日</th>
              <th className="px-4 py-2 border-r border-gray-300">終了日</th>
              <th className="px-4 py-2 border-r border-gray-300">ポイント</th>
              <th className="px-4 py-2 border-r border-gray-300">会話</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c._id} className="border-t border-gray-300 text-sm">
                <td className="px-2 py-2 border-r border-gray-200">
                  <input
                    type="checkbox"
                    checked={!!checked[c._id ?? ""]}
                    onChange={() => handleCheck(c._id ?? "")}
                  />
                </td>
                <td className="px-4 py-2 border-r border-gray-200">
                  {c.contractId}
                </td>
                <td className="px-4 py-2 border-r border-gray-200">
                  {new Date(c.startDate).toLocaleString()}
                </td>
                <td className="px-4 py-2 border-r border-gray-200">
                  {new Date(c.endDate).toLocaleString()}
                </td>
                <td className="px-4 py-2 border-r border-gray-200">
                  {c.points}
                </td>
                <td className="px-4 py-2 border-r border-gray-200">
                  {c.conversation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ContractsLogExport;
