import assert from "node:assert/strict";
import test from "node:test";
import { createDemoLead, parseLeadForm, ValidationError } from "../src/lib/domain.ts";

const form = {
  fullName: " Ana Souza ", email: " ANA@EXEMPLO.COM.BR ", phone: "(11) 99999-9999",
  company: " Empresa Exemplo ", website: "https://exemplo.com.br",
};

test("preserva o formulário original e mantém a normalização separada", () => {
  const lead = createDemoLead(form);
  assert.deepEqual(lead.original, form);
  assert.equal(lead.normalized.fullName, "Ana Souza");
  assert.equal(lead.normalized.email, "ana@exemplo.com.br");
  assert.equal(lead.normalized.phone, "11999999999");
});

test("a demonstração não inventa pesquisa, qualificação, conversa ou reunião", () => {
  const lead = createDemoLead(form);
  assert.equal(lead.research.status, "pending");
  assert.deepEqual(lead.research.sources, []);
  for (const field of Object.values(lead.spiced)) {
    assert.equal(field.value, null);
    assert.deepEqual(field.evidence, []);
  }
  assert.equal(lead.conversation.transcript, null);
  assert.equal(lead.meeting.status, "not_booked");
});

test("rejeita contatos inválidos e informa os campos a corrigir", () => {
  assert.throws(() => parseLeadForm({ ...form, email: "ana", phone: "123" }), (error) => {
    assert.ok(error instanceof ValidationError);
    assert.ok(error.fields.email);
    assert.ok(error.fields.phone);
    return true;
  });
});

test("rejeita payloads inesperados e sites com credenciais ou protocolos impróprios", () => {
  for (const value of [null, [], "texto", { ...form, company: {} }]) {
    assert.throws(() => parseLeadForm(value), ValidationError);
  }
  for (const website of ["javascript:alert(1)", "https://usuario:senha@exemplo.com.br"]) {
    assert.throws(() => parseLeadForm({ ...form, website }), ValidationError);
  }
  assert.equal(parseLeadForm({ ...form, website: undefined }).normalized.website, "");
});
