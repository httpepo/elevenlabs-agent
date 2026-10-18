import assert from "node:assert/strict";
import test from "node:test";
import { EnvironmentError, parseServerEnvironment } from "../src/infrastructure/config/env.ts";

test("setup funciona sem chaves de integrações e mantém demo como padrão", () => {
  assert.deepEqual(parseServerEnvironment({}), { APP_MODE: "demo" });
  assert.deepEqual(parseServerEnvironment({ GEMINI_API_KEY: "  ", GEMINI_MODEL: "" }), { APP_MODE: "demo" });
  assert.equal(parseServerEnvironment({ GEMINI_API_KEY: " example " }).GEMINI_API_KEY, "example");
});

test("URLs e modo inválidos falham sem revelar valores de configuração", () => {
  const secretValue = "https://usuario:segredo@example.invalid";
  assert.throws(() => parseServerEnvironment({ DATABASE_URL: secretValue, APP_MODE: "production" }), (error) => {
    assert.ok(error instanceof EnvironmentError);
    assert.deepEqual(error.variables, ["APP_MODE", "DATABASE_URL"]);
    assert.ok(!error.message.includes("segredo"));
    assert.ok(!error.message.includes(secretValue));
    return true;
  });
  assert.throws(() => parseServerEnvironment({ AGENDA_BASE_URL: secretValue }), EnvironmentError);
  assert.equal(parseServerEnvironment({ DATABASE_URL: "postgresql://user:password@localhost/database" }).APP_MODE, "demo");
});

test("credenciais não podem ser configuradas como variáveis públicas", () => {
  for (const name of ["GEMINI_API_KEY", "ELEVENLABS_API_KEY", "DATABASE_URL", "AGENDA_TOKEN"]) {
    assert.throws(() => parseServerEnvironment({ [`NEXT_PUBLIC_${name}`]: "sensitive" }), (error) => {
      assert.ok(error instanceof EnvironmentError);
      assert.ok(!error.message.includes("sensitive"));
      return true;
    });
  }
});

test("agenda usa o contrato Bearer e rejeita token em URL ou quebra de linha", () => {
  const result = parseServerEnvironment({ AGENDA_AUTH_HEADER: "Authorization", AGENDA_AUTH_PREFIX: "Bearer" });
  assert.equal(result.AGENDA_AUTH_PREFIX, "Bearer");
  for (const input of [
    { AGENDA_BASE_URL: "https://example.invalid?token=sensitive" },
    { AGENDA_TOKEN: "sensitive\r\nX-Test: value" },
    { AGENDA_AUTH_HEADER: "X-Api-Key" },
    { AGENDA_AUTH_PREFIX: "Basic" },
  ]) assert.throws(() => parseServerEnvironment(input), (error) => {
    assert.ok(error instanceof EnvironmentError);
    assert.ok(!error.message.includes("sensitive"));
    return true;
  });
});
