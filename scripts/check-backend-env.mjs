import { loadProjectEnvironment } from "./load-env.mjs";
import { getServerEnvironment, integrationRequirements } from "../src/infrastructure/config/env.ts";

try {
  loadProjectEnvironment();
  const environment = getServerEnvironment();
  console.log(`Ambiente válido. APP_MODE=${environment.APP_MODE}.`);
  for (const [integration, variables] of Object.entries(integrationRequirements)) {
    const missing = variables.filter((name) => !environment[name]);
    console.log(missing.length
      ? `${integration}: variáveis pendentes: ${missing.join(", ")}`
      : `${integration}: variáveis preenchidas (integração ainda não validada).`);
  }
  console.log("Checagem local: não chama provedores, não abre o banco e não ativa recursos.");
} catch (error) {
  console.error(error?.name === "EnvironmentError" ? error.message : "Falha ao verificar o ambiente. Confira os arquivos .env.");
  process.exitCode = 1;
}
