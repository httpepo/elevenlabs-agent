import "server-only";
import { neon } from "@neondatabase/serverless";
import { getServerEnvironment } from "../config/env.ts";

// A aplicação usa a URL com pool; a conexão direta fica disponível para migrações.
// O cliente é criado sob demanda, sem abrir conexões durante o build.
export function getDatabase(connection: "pooled" | "direct" = "pooled") {
  const variable = connection === "direct" ? "DATABASE_URL_UNPOOLED" : "DATABASE_URL";
  const environment = getServerEnvironment();
  const connectionString = environment[variable];

  if (!connectionString) throw new Error(`${variable} não está configurada no servidor.`);

  try {
    return neon(connectionString);
  } catch {
    // Erros do driver podem incluir a URL; não repassar credenciais ao log.
    throw new Error(`${variable} contém uma conexão inválida.`);
  }
}
