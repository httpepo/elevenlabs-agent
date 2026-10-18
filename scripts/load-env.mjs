import nextEnv from "@next/env";

// Mesma precedência e expansão de variáveis do Next.js, inclusive .env.local.
// O logger omite detalhes: um erro de parsing não deve imprimir credenciais.
export function loadProjectEnvironment() {
  const silentLogger = {
    info() {},
    error() { throw new Error("Não foi possível carregar os arquivos de ambiente."); },
  };
  return nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", silentLogger);
}
