import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const minimum = packageJson.engines.node.match(/^>=(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
const actual = process.versions.node.split(".").map(Number);

if (!minimum) throw new Error("Atualize check-runtime.mjs para o intervalo definido em engines.node.");
let comparison = 0;
for (let index = 0; index < 3 && comparison === 0; index++) comparison = actual[index] - minimum[index];

if (comparison < 0) {
  console.error(`Node ${process.versions.node} incompatível. Exigido: ${packageJson.engines.node}. Execute: source ~/.nvm/nvm.sh && nvm use`);
  process.exitCode = 1;
} else {
  const userAgent = process.env.npm_config_user_agent;
  const pnpmVersion = userAgent?.match(/^pnpm\/([^ ]+)/)?.[1];
  const expected = packageJson.packageManager.replace("pnpm@", "");
  if (userAgent && pnpmVersion !== expected) {
    console.error(`Use ${packageJson.packageManager}, conforme package.json.`);
    process.exitCode = 1;
  } else {
    console.log(`Runtime OK: Node ${process.versions.node}; gerenciador previsto: ${packageJson.packageManager}.`);
  }
}
