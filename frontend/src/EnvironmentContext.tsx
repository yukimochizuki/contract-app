import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type EnvType = "dev1" | "dev2" | "dev3" | "prod";

const EnvironmentContext = createContext<{
  selectedEnv: EnvType;
  setSelectedEnv: (env: EnvType) => void;
}>({
  selectedEnv: "dev1",
  setSelectedEnv: () => {},
});

export const useEnvironment = () => useContext(EnvironmentContext);

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [selectedEnv, setSelectedEnv] = useState<EnvType>(() => {
    return (localStorage.getItem("selectedEnv") as EnvType) || "dev1";
  });

  // ローカルストレージに保存
  const setEnv = (env: EnvType) => {
    setSelectedEnv(env);
    localStorage.setItem("selectedEnv", env);
  };

  return (
    <EnvironmentContext.Provider value={{ selectedEnv, setSelectedEnv: setEnv }}>
      {children}
    </EnvironmentContext.Provider>
  );
}
