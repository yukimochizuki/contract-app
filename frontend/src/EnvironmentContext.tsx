import { useState } from "react";
import type { ReactNode } from "react";
import { EnvironmentContext, type EnvType } from "./environment";

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [selectedEnv, setSelectedEnv] = useState<EnvType>(() => {
    const saved = localStorage.getItem("selectedEnv");
    return saved === "dev1" ||
      saved === "dev2" ||
      saved === "dev3" ||
      saved === "prod"
      ? saved
      : "dev1";
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
