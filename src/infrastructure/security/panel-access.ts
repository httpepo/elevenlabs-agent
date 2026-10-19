import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getServerEnvironment } from "../config/env.ts";
import { isLocalDemo } from "../config/demo.ts";

export function isPanelAuthorized(authorization: string | null): boolean {
  if (isLocalDemo()) return true;
  const environment = getServerEnvironment();
  if (!environment.PANEL_PASSWORD || environment.APP_MODE !== "live") return false;
  if (!authorization?.startsWith("Basic ") || authorization.length > 2048) return false;
  const supplied = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  const expected = `${environment.PANEL_USERNAME ?? "admin"}:${environment.PANEL_PASSWORD}`;
  return timingSafeEqual(hash(supplied), hash(expected));
}

function hash(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
