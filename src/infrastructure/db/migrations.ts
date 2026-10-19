import "server-only";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@neondatabase/serverless";
import { getDatabase } from "./client.ts";
import { getServerEnvironment } from "../config/env.ts";

type AppliedMigration = { name: string; checksum: string };
export type Migration = AppliedMigration & { sql: string; applied: boolean };
export type MigrationPlan = { endpoint: string; database: string; migrations: Migration[] };

const migrationDirectory = fileURLToPath(new URL("./migrations/", import.meta.url));
const ledgerSql = `CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export async function getMigrationPlan(): Promise<MigrationPlan> {
  const connection = directConnection();
  const sql = getDatabase("direct");
  const [ledger] = await sql`SELECT to_regclass('public.schema_migrations') AS relation`;
  const applied = ledger.relation
    ? await sql`SELECT name, checksum FROM schema_migrations ORDER BY name` as AppliedMigration[]
    : [];
  const migrations = await readMigrations();
  validateChecksums(migrations, applied);
  const appliedNames = new Set(applied.map((entry) => entry.name));
  return {
    endpoint: connection.hostname.split(".")[0],
    database: decodeURIComponent(connection.pathname.slice(1)),
    migrations: migrations.map((migration) => ({ ...migration, applied: appliedNames.has(migration.name) })),
  };
}

export function renderMigrationSql(plan: MigrationPlan): string {
  return [ledgerSql + ";", ...plan.migrations.filter((migration) => !migration.applied).map((migration) =>
    `${migration.sql}\nINSERT INTO schema_migrations (name, checksum) VALUES (${sqlLiteral(migration.name)}, ${sqlLiteral(migration.checksum)});`,
  )].join("\n\n");
}

export async function applyMigrations(expectedEndpoint: string): Promise<string[]> {
  const connection = directConnection();
  if (connection.hostname.split(".")[0] !== expectedEndpoint) throw new MigrationError("O endpoint não corresponde ao destino confirmado.");
  const migrations = await readMigrations();
  const client = new Client({ connectionString: connection.toString(), connectionTimeoutMillis: 15_000 });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('atlas:schema-migrations', 0))");
    const applied = await applyPendingMigrations(client, migrations);
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function applyPendingMigrations(client: Client, migrations: Omit<Migration, "applied">[]): Promise<string[]> {
  await client.query(ledgerSql);
  const { rows } = await client.query<AppliedMigration>("SELECT name, checksum FROM schema_migrations ORDER BY name");
  validateChecksums(migrations, rows);
  const appliedNames = new Set(rows.map((migration) => migration.name));
  const pending = migrations.filter((migration) => !appliedNames.has(migration.name));
  for (const migration of pending) {
    await client.query(migration.sql);
    await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [migration.name, migration.checksum]);
  }
  return pending.map((migration) => migration.name);
}

async function readMigrations(): Promise<Omit<Migration, "applied">[]> {
  const names = (await readdir(migrationDirectory)).filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(path.join(migrationDirectory, name), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
}

function validateChecksums(migrations: AppliedMigration[], applied: AppliedMigration[]): void {
  const expected = new Map(migrations.map((migration) => [migration.name, migration.checksum]));
  for (const migration of applied) {
    if (expected.get(migration.name) !== migration.checksum) {
      throw new MigrationError(`Migração aplicada foi alterada ou não existe nesta versão: ${migration.name}.`);
    }
  }
}

function directConnection(): URL {
  const value = getServerEnvironment().DATABASE_URL_UNPOOLED;
  if (!value) throw new MigrationError("Configure DATABASE_URL_UNPOOLED para verificar ou aplicar migrações.");
  const connection = new URL(value);
  if (connection.hostname.includes("-pooler")) throw new MigrationError("Migrações exigem conexão direta, sem -pooler.");
  return connection;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
