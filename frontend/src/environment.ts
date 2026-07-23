import { createContext, useContext } from "react";

export type EnvType = "dev1" | "dev2" | "dev3" | "prod";

export const EnvironmentContext = createContext<{
  selectedEnv: EnvType;
  setSelectedEnv: (env: EnvType) => void;
}>({
  selectedEnv: "dev1",
  setSelectedEnv: () => {},
});

export const useEnvironment = () => useContext(EnvironmentContext);
