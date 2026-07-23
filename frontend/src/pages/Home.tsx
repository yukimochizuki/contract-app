import { useNavigate } from "react-router-dom";
import { useEnvironment, type EnvType } from "../environment";

const environments = [
  { label: "開発環境1", value: "dev1" },
  { label: "開発環境2", value: "dev2" },
  { label: "開発環境3", value: "dev3" },
  { label: "本番環境", value: "prod" },
];

export default function Home() {
  const navigate = useNavigate();
  const { selectedEnv, setSelectedEnv } = useEnvironment();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white shadow rounded-xl p-8 space-y-6">
        <h1 className="text-3xl font-bold text-center text-gray-800">環境選択 & 管理画面</h1>

        <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
          <label className="text-gray-600 font-medium">接続先環境：</label>
          <select
            className="border border-gray-300 px-4 py-2 rounded w-full sm:w-1/2"
            value={selectedEnv}
            onChange={(e) => setSelectedEnv(e.target.value as EnvType)}
          >
            {environments.map((env) => (
              <option key={env.value} value={env.value}>
                {env.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={() => navigate("/contracts")}
            className="bg-blue-600 text-white px-6 py-3 rounded shadow hover:bg-blue-700 transition"
          >
            契約管理
          </button>
          <button
            onClick={() => navigate("/ContractsLogExport")}
            className="bg-green-600 text-white px-6 py-3 rounded shadow hover:bg-green-700 transition"
          >
            ログ出力
          </button>
          <button
            onClick={() => navigate("/RagSetupForm")}
            className="bg-purple-600 text-white px-6 py-3 rounded shadow hover:bg-purple-700 transition"
          >
            RAG登録
          </button>
        </div>
      </div>
    </div>
  );
}
