import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home.tsx";
import Contracts from "./pages/Contracts";
import ContractsLogExport from "./pages/ContractsLogExport";
import RagSetupForm from "./pages/RagSetupForm";
import { EnvironmentProvider } from "./EnvironmentContext";

function App() {
  return (
    <EnvironmentProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/ContractsLogExport" element={<ContractsLogExport />} />
          <Route path="/RagSetupForm" element={<RagSetupForm />} />
        </Routes>
      </BrowserRouter>
    </EnvironmentProvider>
  );
}

export default App;
