import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const checker = fileURLToPath(new URL("../scripts/check-architecture.mjs", import.meta.url));

async function withProject(files, run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atlas-architecture-"));
  try {
    const fixtures = {
      "tsconfig.json": JSON.stringify({ compilerOptions: { moduleResolution: "bundler", paths: { "@/*": ["./src/*"] } } }),
      ...files,
    };
    for (const [name, source] of Object.entries(fixtures)) {
      const absolute = path.join(directory, name);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, source);
    }
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("checagem permite o fluxo app -> composição -> aplicação -> portas/domínio", async () => {
  await withProject({
    "src/modules/leads/domain/lead.ts": "export type Lead = { id: string };",
    "src/modules/leads/ports/repository.ts": 'import type { Lead } from "../domain/lead";',
    "src/modules/leads/application/create.ts": 'import type {} from "../ports/repository";',
    "src/infrastructure/bootstrap.ts": 'import {} from "@/modules/leads/application/create";',
    "src/app/api/leads/route.ts": 'import {} from "@/infrastructure/bootstrap";',
  }, async (cwd) => {
    const result = await exec(process.execPath, [checker], { cwd });
    assert.equal(result.stderr, "");
  });
});

test("checagem rejeita acesso a banco pelo domínio e por Route Handlers", async () => {
  await withProject({
    "src/infrastructure/db/client.ts": "export const db = {};",
    "src/modules/leads/domain/lead.ts": 'import { db } from "@/infrastructure/db/client";',
    "src/app/api/leads/route.ts": 'import { db } from "../../../infrastructure/db/client";',
  }, async (cwd) => {
    await assert.rejects(exec(process.execPath, [checker], { cwd }), (error) => {
      assert.equal(error.code, 1);
      assert.ok(error.stderr.includes("src/modules/leads/domain/lead.ts"));
      assert.ok(error.stderr.includes("src/app/api/leads/route.ts"));
      return true;
    });
  });
});
