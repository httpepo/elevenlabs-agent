import assert from "node:assert/strict";
import test from "node:test";
import { createDemoLeadUseCases } from "../src/modules/leads/application/demo-leads.ts";
import { ValidationError } from "../src/modules/leads/domain/lead.ts";

const form = { fullName: " Ana Souza ", email: "ANA@EXEMPLO.COM.BR", phone: "11999999999", company: "Empresa", website: "" };

test("cadastro usa o repositório injetado e só devolve o contrato público após persistir", async () => {
  const records = new Map();
  const useCases = createDemoLeadUseCases({
    async save(record) { records.set(record.id, record); },
    async get(id) { return records.get(id) ?? null; },
    async list() { return [...records.values()]; },
  });
  const response = await useCases.create(form);
  assert.deepEqual(Object.keys(response).sort(), ["id", "mode"]);
  assert.equal(response.mode, "demo");
  const stored = await useCases.get(response.id);
  assert.deepEqual(stored.original, form);
  assert.equal(stored.normalized.fullName, "Ana Souza");
  assert.equal((await useCases.list()).length, 1);
  assert.equal(await useCases.get("missing"), null);
});

test("falhas de validação e persistência não são convertidas em sucesso", async () => {
  let calls = 0;
  const storageError = new Error("storage unavailable");
  const useCases = createDemoLeadUseCases({
    async save() { calls++; throw storageError; },
    async get() { return null; },
    async list() { return []; },
  });
  await assert.rejects(useCases.create({ ...form, email: "invalid" }), ValidationError);
  assert.equal(calls, 0);
  await assert.rejects(useCases.create(form), (error) => error === storageError);
  assert.equal(calls, 1);
});
