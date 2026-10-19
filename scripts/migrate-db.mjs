import { loadProjectEnvironment } from "./load-env.mjs";

try {
  loadProjectEnvironment();
  const { applyMigrations, getMigrationPlan, MigrationError } = await import("../src/infrastructure/db/migrations.ts");
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const apply = args.includes("--apply");
  const endpointIndex = args.indexOf("--expect-endpoint");
  const expectedEndpoint = endpointIndex >= 0 ? args[endpointIndex + 1] : null;
  const plan = await getMigrationPlan();
  console.log(JSON.stringify({ endpoint: plan.endpoint, database: plan.database, mode: apply ? "apply" : "plan" }));
  for (const migration of plan.migrations) console.log(`${migration.applied ? "applied" : "pending"}: ${migration.name}`);
  if (apply) {
    if (!expectedEndpoint) throw new MigrationError("Para aplicar, informe --apply --expect-endpoint seguido do endpoint exibido no plano.");
    const applied = await applyMigrations(expectedEndpoint);
    console.log(`Migrações aplicadas: ${applied.length}.`);
  } else {
    console.log("Somente leitura. Nenhuma migração aplicada. Use --apply --expect-endpoint para confirmar o destino.");
  }
} catch (error) {
  console.error("Não foi possível verificar/aplicar as migrações. Confira a conexão direta e o plano de migração.");
  console.error(error instanceof Error && ["MigrationError", "EnvironmentError"].includes(error.name)
    ? error.message : error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
}
