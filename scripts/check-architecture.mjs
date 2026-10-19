import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
if (config.error) throw new Error("Não foi possível ler tsconfig.json.");
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const violations = [];

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(absolute));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

function localPath(absolute) {
  return path.relative(root, absolute).split(path.sep).join("/");
}

function inspectImport(from, dependency) {
  const resolved = ts.resolveModuleName(dependency, path.join(root, from), options, ts.sys).resolvedModule;
  const target = resolved && !resolved.isExternalLibraryImport ? localPath(resolved.resolvedFileName) : null;
  const layer = from.match(/^src\/modules\/([^/]+)\/(domain|application|ports)\//)?.[2];
  let reason;

  if (layer) {
    const internalLayer = target?.match(/^src\/modules\/[^/]+\/(domain|application|ports)\//)?.[1];
    if (target && !internalLayer) reason = "módulos não dependem de app, UI, lib ou infraestrutura";
    else if (layer === "domain" && internalLayer && internalLayer !== "domain") reason = "domínio depende somente de domínio";
    else if (layer === "ports" && internalLayer === "application") reason = "portas não dependem de casos de uso";
    else if (!target && (dependency === "server-only" || /^(react($|\/)|next($|\/)|@neondatabase\/|@elevenlabs\/|@google\/|@tavily\/)/.test(dependency))) reason = "módulos não importam framework ou SDK de provedor";
  }
  if (from.startsWith("src/design-system/") && target && !target.startsWith("src/design-system/")) reason = "design system permanece independente do produto";
  if (from.startsWith("src/app/") && target) {
    if (/^src\/infrastructure\//.test(target) && !["src/infrastructure/bootstrap.ts", "src/infrastructure/config/demo.ts"].includes(target)) reason = "app acessa infraestrutura somente pelo bootstrap/config de apresentação";
    else if (/^src\/modules\/[^/]+\/(domain|ports)\//.test(target) || target.startsWith("src/lib/")) reason = "app acessa casos de uso e DTOs, sem domínio ou adaptadores diretos";
  }
  if (from.startsWith("src/components/") && target && (/^src\/(infrastructure|lib)\//.test(target) || /^src\/modules\/[^/]+\/(domain|ports)\//.test(target))) reason = "componentes recebem DTOs e ações, sem persistência/domínio direto";
  if (/^@neondatabase\//.test(dependency) && !from.startsWith("src/infrastructure/db/")) reason = "driver do banco pertence à infraestrutura de banco";
  if (dependency === "@vercel/queue" && !from.startsWith("src/infrastructure/jobs/")) reason = "SDK de fila pertence ao adaptador de jobs";
  // O SDK React do ElevenLabs é um adaptador de navegador: precisa viver no
  // Client Component que possui o microfone. Os demais SDKs continuam server-only.
  if (/^(@elevenlabs\/|@google\/genai|@tavily\/)/.test(dependency) &&
      !from.startsWith("src/infrastructure/providers/") && !from.startsWith("src/components/voice/")) reason = "SDK de provedor pertence ao adaptador";
  if (reason) violations.push(`${from} -> ${dependency}: ${reason}`);
}

for (const file of await collect(path.join(root, "src"))) {
  const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
  const from = localPath(file);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) inspectImport(from, node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) inspectImport(from, node.arguments[0].text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) inspectImport(from, node.argument.literal.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
}

if (violations.length) {
  for (const violation of violations) console.error(violation);
  process.exitCode = 1;
} else {
  console.log("Arquitetura OK: imports respeitam as fronteiras entre as camadas.");
}
