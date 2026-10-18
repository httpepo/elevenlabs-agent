import assert from "node:assert/strict";
import { loadProjectEnvironment } from "./load-env.mjs";

try {
  loadProjectEnvironment();
  const { getDatabase } = await import("../src/infrastructure/db/client.ts");
  for (const connection of ["pooled", "direct"]) {
    const sql = getDatabase(connection);
    const [row] = await sql.query(
      "SELECT 1 AS connection_ok, current_database() AS database, current_setting('server_version') AS postgres_version",
      [],
      { fetchOptions: { signal: AbortSignal.timeout(15_000) } },
    );
    assert.equal(row?.connection_ok, 1);
    console.log(JSON.stringify({ connection, ...row }));
  }
  console.log("Neon: conexões com pool e direta verificadas com sucesso.");
} catch (error) {
  console.error("Falha ao verificar a Neon. Confira as variáveis de conexão e o acesso à rede.");
  console.error(error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
}
