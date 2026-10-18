import assert from "node:assert/strict";
import test from "node:test";
import { isLocalDemo } from "../src/lib/config.ts";

test("registros da base local ficam indisponíveis em produção", () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousMode = process.env.APP_MODE;
  try {
    process.env.APP_MODE = "demo";
    process.env.NODE_ENV = "development";
    assert.equal(isLocalDemo(), true);
    process.env.NODE_ENV = "production";
    assert.equal(isLocalDemo(), false);
    process.env.NODE_ENV = "development";
    process.env.APP_MODE = "live";
    assert.equal(isLocalDemo(), false);
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousMode === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previousMode;
  }
});
