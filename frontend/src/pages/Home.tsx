import { Link } from "react-router-dom";

export default function Home() {
    return (
      <div>
        <h1>トップページ</h1>
        <p>ようこそ！左のナビゲーションやURLから <Link to="/contracts">/contracts</Link> にアクセスしてみてください。</p>
      </div>
    );
}
