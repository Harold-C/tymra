import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const files = ["apps", "packages", "e2e", "test", "scripts"].flatMap((directory) => sources(directory));
const errors = [];
const modules = new Map();
for (const file of files) {
  const content = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const client = source.statements.some((node) => ts.isExpressionStatement(node)
    && ts.isStringLiteral(node.expression) && node.expression.text === "use client");
  const area = file.split(path.sep).slice(0, 2).join("/");
  const test = /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file);
  const edges = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly = node.isTypeOnly || node.importClause?.isTypeOnly
        || (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
          && !node.importClause.name && node.importClause.namedBindings.elements.length > 0
          && node.importClause.namedBindings.elements.every((item) => item.isTypeOnly))
        || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0
          && node.exportClause.elements.every((item) => item.isTypeOnly));
      check(node, node.moduleSpecifier.text, typeOnly);
    } else if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")
      && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      check(node, node.arguments[0].text, false);
    }
    ts.forEachChild(node, visit);
  }
  function check(node, specifier, typeOnly) {
    const target = specifier.startsWith("@tymra/") ? `packages/${specifier.split("/")[1]}`
      : specifier.startsWith("@/") ? `apps/web/${specifier.slice(2)}`
      : specifier.startsWith(".") ? path.relative(root, path.resolve(path.dirname(file), specifier)) : specifier;
    if (area.startsWith("packages/") && target.startsWith("apps/")) report(node, "Shared packages cannot depend on applications.");
    if (area === "packages/domain" && target.startsWith("packages/") && target !== area && !target.startsWith(`${area}/`)) report(node, "Domain contracts must stay independent of infrastructure.");
    if (!test && area.startsWith("apps/") && target.startsWith("apps/") && !target.startsWith(`${area}/`)) report(node, "Applications must communicate through contracts, not source imports.");
    if (!typeOnly) edges.push({ node, specifier, target, resolved: resolveSource(file, specifier, target) });
  }
  function report(node, message) {
    errors.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${message}`);
  }
  visit(source);
  modules.set(file, { source, client, edges });
}
for (const [file, module] of modules) {
  if (!module.client) continue;
  for (const edge of module.edges) {
    const chain = serverImportChain(edge, new Set([file]));
    if (chain) errors.push(`${file}:${module.source.getLineAndCharacterOfPosition(edge.node.getStart(module.source)).line + 1}: Client components cannot import server infrastructure (${chain.join(" -> ")}).`);
  }
}
if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`Module boundaries passed for ${files.length} source files.\n`);

function serverImportChain(edge, visited) {
  if (/^packages\/(?:db|config|providers|queue)(?:\/|$)/u.test(edge.target)
    || edge.target.startsWith("apps/web/lib/server/") || edge.specifier === "@prisma/client"
    || edge.specifier === "server-only" || edge.specifier.startsWith("node:")) return [edge.specifier];
  if (!edge.resolved || visited.has(edge.resolved)) return null;
  visited.add(edge.resolved);
  for (const next of modules.get(edge.resolved)?.edges ?? []) {
    const chain = serverImportChain(next, visited);
    if (chain) return [edge.specifier, ...chain];
  }
  return null;
}

function resolveSource(file, specifier, target) {
  let source = target;
  if (specifier.startsWith("@tymra/")) {
    const packageFile = path.join(target, "package.json");
    if (!existsSync(packageFile)) return null;
    const manifest = JSON.parse(readFileSync(packageFile, "utf8"));
    const subpath = specifier.split("/").slice(2).join("/");
    const entry = (typeof manifest.exports === "string" && !subpath ? manifest.exports : manifest.exports?.[subpath ? `./${subpath}` : "."])
      ?? (!subpath ? manifest.main : null);
    if (typeof entry !== "string") return null;
    source = path.join(target, entry);
  } else if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  return [source, ...[".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"].map((suffix) => source + suffix)]
    .find((candidate) => files.includes(candidate)) ?? null;
}

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || ["node_modules", "dist", "output"].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(file) : /\.[cm]?[jt]sx?$/u.test(file) ? [file] : [];
  });
}
