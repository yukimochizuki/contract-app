import { useEffect, useState } from "react";

type Contract = {
  contractId: string;
  startDate: number;
  endDate: number;
  points: string;
};

export default function Contracts() {
  const [contracts, setContracts] = useState<Contract[]>([]);

  useEffect(() => {
    fetch("/api/listContracts")
      .then((res) => res.json())
      .then(setContracts);
  }, []);

  return (
    <div>
      <h1>契約一覧</h1>
      <table border={1}>
        <thead>
          <tr>
            <th>ID</th>
            <th>開始日</th>
            <th>終了日</th>
            <th>ポイント</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <tr key={c.contractId}>
              <td>{c.contractId}</td>
              <td>{new Date(c.startDate).toLocaleDateString()}</td>
              <td>{new Date(c.endDate).toLocaleDateString()}</td>
              <td>{c.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
