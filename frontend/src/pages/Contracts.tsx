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

const Contracts = () => {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ [id: string]: string }>({});
  const [newContract, setNewContract] = useState<Contract>({
    contractId: "",
    startDate: "",
    endDate: "",
    points: 0,
    conversation: "",
  });
  const navigate = useNavigate();
  const { selectedEnv } = useEnvironment();

  const baseUrl = import.meta.env.VITE_API_BASE || "/api";

  const [accountInfo, setAccountInfo] = useState("");

  useEffect(() => {
    fetch(`${baseUrl}/getEnv?selectedEnv=${selectedEnv}`)
      .then((res) => res.json())
      .then((data) => {
        setAccountInfo(`接続先アカウント: ${data.accountName}（${data.env}）`);
      });
  }, [baseUrl, selectedEnv]);

  type CollectionStatus = "checking" | "exists" | "missing";

  const [collectionStatusMap, setCollectionStatusMap] = useState<
    Record<string, CollectionStatus>
  >({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${baseUrl}/getContracts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedEnv }), // ← ここで送る！
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch contracts");
        setContracts(data);

        // ✅ 初期状態で「checking」をセット（これが抜けている）
        const initialMap: Record<string, CollectionStatus> = {};
        data.forEach((c: Contract) => {
          initialMap[c.contractId] = "checking";
        });
        setCollectionStatusMap(initialMap);
      } catch (err: unknown) {
        console.error("Failed to fetch contracts:", err);
        setError("データ取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [baseUrl, selectedEnv]);

  useEffect(() => {
    const checkCollections = async () => {
      const updatedMap: Record<string, CollectionStatus> = {};

      await Promise.all(
        contracts.map(async (contract) => {
          try {
            const res = await fetch(`${baseUrl}/checkCollection`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contractId: contract.contractId,
                selectedEnv,
              }),
            });
            const result = await res.json();
            updatedMap[contract.contractId] = result.exists
              ? "exists"
              : "missing";
          } catch {
            updatedMap[contract.contractId] = "missing";
          }
        })
      );

      setCollectionStatusMap(updatedMap);
    };

    if (contracts.length > 0) {
      checkCollections();
    }
  }, [baseUrl, contracts, selectedEnv]);

  const handleUpdate = async (_id: string, points: number) => {
    const confirmed = window.confirm("この契約のポイントを更新しますか？");
    if (!confirmed) return;

    try {
      const res = await fetch(`${baseUrl}/updateContract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedEnv, _id, points }),
      });
      if (res.ok) {
        const updated = contracts.map((c) =>
          c._id === _id ? { ...c, points } : c
        );
        setContracts(updated);
      }
    } catch {
      alert("更新失敗");
    }
  };

  const handleAdd = async () => {
    const confirmed = window.confirm("この内容で契約を追加しますか？");
    if (!confirmed) return;

    try {
      // 開始日：00:00:00.000
      const startDateObj = new Date(newContract.startDate);
      startDateObj.setHours(0, 0, 0, 0); // ← 明示的に設定
      const startTimestamp = startDateObj.getTime();

      // 終了日：23:59:59.999
      const endDateObj = new Date(newContract.endDate);
      endDateObj.setHours(23, 59, 59, 999); // ← 精度最大
      const endTimestamp = endDateObj.getTime();

      const payload = {
        ...newContract,
        selectedEnv,
        startDate: startTimestamp,
        endDate: endTimestamp,
      };

      const res = await fetch(`${baseUrl}/createContract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const added = await res.json();
        setContracts([...contracts, added]);
        setNewContract({
          contractId: "",
          startDate: "",
          endDate: "",
          points: 0,
          conversation: "",
        });
      }
    } catch {
      alert("追加失敗");
    }
  };

  const createCollection = async (contractId: string) => {
    const confirmed = window.confirm(
      "この契約のログ格納コレクションを作成しますか？"
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`${baseUrl}/createCollection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId, selectedEnv }),
      });

      if (res.ok) {
        // 成功したら状態を「exists」に更新
        setCollectionStatusMap((prev) => ({
          ...prev,
          [contractId]: "exists",
        }));
      } else {
        alert("コレクション作成に失敗しました");
      }
    } catch (err) {
      console.error("createCollection error:", err);
      alert("コレクション作成中にエラーが発生しました");
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

      <div className="overflow-x-auto">
        <table className="min-w-full table-auto border border-gray-400 bg-white shadow rounded-lg">
          <thead>
            <tr className="bg-gray-100 text-gray-700 text-left text-sm border-b border-gray-400">
              <th className="px-4 py-2 border-r border-gray-300">ID</th>
              <th className="px-4 py-2 border-r border-gray-300">開始日</th>
              <th className="px-4 py-2 border-r border-gray-300">終了日</th>
              <th className="px-4 py-2 border-r border-gray-300">ポイント</th>
              <th className="px-4 py-2 border-r border-gray-300">会話</th>
              <th className="px-4 py-2 border-r border-gray-300">操作</th>
              <th className="px-4 py-2">ログ格納</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c._id} className="border-t border-gray-300 text-sm">
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
                  <input
                    className="border border-gray-400 rounded px-2 py-1 w-24"
                    value={editing[c._id ?? ""] ?? c.points}
                    onChange={(e) =>
                      setEditing({ ...editing, [c._id ?? ""]: e.target.value })
                    }
                  />
                </td>
                <td className="px-4 py-2 border-r border-gray-200">
                  {c.conversation}
                </td>
                <td className="px-4 py-2 border-r border-gray-200">
                  <button
                    onClick={() =>
                      handleUpdate(
                        c._id!,
                        parseInt(editing[c._id ?? ""] ?? `${c.points}`)
                      )
                    }
                    className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition"
                  >
                    更新
                  </button>
                </td>
                <td className="px-4 py-2">
                  {(() => {
                    const status = collectionStatusMap[c.contractId];
                    if (!status || status === "checking") {
                      return (
                        <button
                          className="px-3 py-1 rounded bg-gray-300 text-gray-700"
                          disabled
                        >
                          ロード中...
                        </button>
                      );
                    }
                    if (status === "exists") {
                      return (
                        <button
                          className="px-3 py-1 rounded bg-green-500 text-white"
                          disabled
                        >
                          作成済み
                        </button>
                      );
                    }
                    return (
                      <button
                        className="px-3 py-1 rounded bg-yellow-500 text-white hover:bg-yellow-600 transition"
                        onClick={() => createCollection(c.contractId)}
                      >
                        作成
                      </button>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-xl font-semibold mt-10 mb-4 border-b pb-2">
        新規契約の追加
      </h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
        className="bg-white shadow-md rounded-md p-6 space-y-6 border border-gray-400"
      >
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            Contract ID
          </label>
          <input
            className="w-full border border-gray-400 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="contractId"
            value={newContract.contractId}
            onChange={(e) =>
              setNewContract({ ...newContract, contractId: e.target.value })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            開始日（0時）
          </label>
          <input
            type="date"
            className="w-full border border-gray-400 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={newContract.startDate}
            onChange={(e) =>
              setNewContract({ ...newContract, startDate: e.target.value })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            終了日（23:59:59）
          </label>
          <input
            type="date"
            className="w-full border border-gray-400 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={newContract.endDate}
            onChange={(e) =>
              setNewContract({ ...newContract, endDate: e.target.value })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            ポイント
          </label>
          <input
            type="number"
            className="w-full border border-gray-400 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={newContract.points}
            onChange={(e) =>
              setNewContract({
                ...newContract,
                points: parseInt(e.target.value),
              })
            }
          />
        </div>

        <div>
          <button
            type="submit"
            className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 transition"
          >
            追加
          </button>
        </div>
      </form>
    </div>
  );
};

export default Contracts;
