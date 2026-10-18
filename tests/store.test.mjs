import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDemoLead } from "../src/lib/domain.ts";
import { FileLeadStore } from "../src/lib/store.ts";

const form = { fullName: "Ana Souza", email: "ana@exemplo.com.br", phone: "11999999999", company: "Empresa Exemplo", website: "" };

test("cadastros simultâneos persistem e podem ser abertos por uma nova instância", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atlas-store-test-"));
  try {
    const directory = path.join(temporary, "leads");
    const store = new FileLeadStore(directory);
    const ana = createDemoLead(form);
    const bruno = createDemoLead({ ...form, fullName: "Bruno Silva", email: "bruno@exemplo.com.br" });
    await Promise.all([store.save(ana), store.save(bruno)]);
    const reopened = new FileLeadStore(directory);
    assert.equal((await reopened.list()).length, 2);
    assert.deepEqual(await reopened.get(ana.id), ana);
    assert.equal((await reopened.get(bruno.id)).original.fullName, "Bruno Silva");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("diretório novo começa vazio e identificadores não podem escapar da pasta", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atlas-store-test-"));
  try {
    const store = new FileLeadStore(path.join(temporary, "leads"));
    assert.deepEqual(await store.list(), []);
    assert.equal(await store.get("../../package"), null);
    await assert.rejects(store.save({ ...createDemoLead(form), id: "../../escape" }));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
