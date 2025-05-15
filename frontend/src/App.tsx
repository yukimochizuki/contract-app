import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home.tsx";
import Contracts from "./pages/Contracts";


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/contracts" element={<Contracts />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App
