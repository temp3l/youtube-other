import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "../..");
const packageName = "@mediaforge/educational-renderer";
const ignored = new Set(["node_modules", "dist", "coverage", ".cache", ".artifacts", ".git"]);

async function files(directory) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
    if (ignored.has(entry.name)) continue;
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(item));
    else if (/\.(?:[cm]?[jt]sx?|json)$/u.test(entry.name)) output.push(item);
  }
  return output;
}

function specifiers(source, fileName) {
  if (fileName.endsWith(".json")) return [];
  const script = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) found.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(script);
  return found;
}

function referencesPackage(source, fileName) {
  if (fileName.endsWith(".json")) return source.includes(packageName);
  const script = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;
  const visit = (node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && (node.text === packageName || node.text.startsWith(`${packageName}/`))) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(script);
  return found;
}

async function scan(packageDirectory, repositoryDirectory) {
  const violations = [];
  for (const file of await files(packageDirectory)) {
    const source = await fs.readFile(file, "utf8");
    if (path.basename(file) === "package.json") {
      const manifest = JSON.parse(source);
      for (const group of ["dependencies", "optionalDependencies", "peerDependencies"]) for (const dependency of Object.keys(manifest[group] ?? {})) if (dependency.startsWith("@mediaforge/") && dependency !== packageName) violations.push(`renderer dependency: ${file}: ${dependency}`);
    }
    for (const specifier of specifiers(source, file)) {
      if (specifier.startsWith("@mediaforge/") && specifier !== packageName && !specifier.startsWith(`${packageName}/`)) violations.push(`renderer import: ${file}: ${specifier}`);
      if (specifier.startsWith(".")) {
        const resolved = path.resolve(path.dirname(file), specifier);
        if (resolved !== packageDirectory && !resolved.startsWith(`${packageDirectory}${path.sep}`)) violations.push(`renderer escape: ${file}: ${specifier}`);
      }
    }
  }
  for (const parent of [path.join(repositoryDirectory, "apps"), path.join(repositoryDirectory, "packages")]) for (const file of await files(parent)) {
    if (file === packageDirectory || file.startsWith(`${packageDirectory}${path.sep}`)) continue;
    const source = await fs.readFile(file, "utf8");
    if (path.basename(file) === "package.json") {
      const manifest = JSON.parse(source);
      for (const group of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) if (manifest[group]?.[packageName]) violations.push(`consumer dependency: ${file}: ${packageName}`);
    }
    if (referencesPackage(source, file)) violations.push(`consumer reference: ${file}: ${packageName}`);
  }
  return violations;
}

async function selfTest() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "renderer-boundary-"));
  try {
    const renderer = path.join(root, "packages", "educational-renderer"); const app = path.join(root, "apps", "consumer");
    await fs.mkdir(path.join(renderer, "src"), { recursive: true }); await fs.mkdir(path.join(app, "src"), { recursive: true });
    await fs.writeFile(path.join(renderer, "package.json"), JSON.stringify({ name: packageName }));
    await fs.writeFile(path.join(renderer, "src", "bad.ts"), 'import "@mediaforge/config";\n');
    await fs.writeFile(path.join(app, "src", "bad.js"), 'await import("@mediaforge/educational-renderer");\nconst pluginRegistry = ["@mediaforge/educational-renderer"];\nvoid pluginRegistry;\n');
    const violations = await scan(renderer, root);
    if (!violations.some((item) => item.startsWith("renderer import:")) || !violations.some((item) => item.startsWith("consumer reference:"))) throw new Error(`Boundary self-test did not detect both directions: ${violations.join("; ")}`);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

if (process.argv.includes("--self-test")) await selfTest();
else {
  const violations = await scan(packageRoot, repositoryRoot);
  if (violations.length) { process.stderr.write(`${violations.join("\n")}\n`); process.exitCode = 1; }
}
