#!/usr/bin/env tsx

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const RAW_CONVEX_BUILDERS = new Set([
  "query",
  "mutation",
  "action",
  "internalQuery",
  "internalMutation",
  "internalAction",
]);
const GENERATED_SERVER_PATTERN = /(?:^|\/)_generated\/server$/;
const ALLOWED_FILES = new Set(["convex/_lib/errorObservability.ts"]);

export type ConvexFunctionRegistrationIssue = {
  filePath: string;
  line: number;
  column: number;
  importedBuilder: string;
};

const normalizePath = (filePath: string) => filePath.split(path.sep).join("/");

export const shouldCheckConvexFunctionRegistrationFile = (filePath: string) => {
  const normalized = normalizePath(filePath);
  if (!normalized.startsWith("convex/") || !normalized.endsWith(".ts")) return false;
  if (normalized.split("/").includes("_generated")) return false;
  return !ALLOWED_FILES.has(normalized);
};

const isGeneratedServerImport = (moduleSpecifier: ts.Expression): moduleSpecifier is ts.StringLiteral =>
  ts.isStringLiteral(moduleSpecifier) &&
  moduleSpecifier.text.startsWith(".") &&
  GENERATED_SERVER_PATTERN.test(moduleSpecifier.text);

const sourceLocation = (sourceFile: ts.SourceFile, node: ts.Node) => {
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: location.line + 1, column: location.character + 1 };
};

export const findRawConvexBuilderImportsInSource = (
  source: string,
  filePath: string,
): ConvexFunctionRegistrationIssue[] => {
  const normalizedFilePath = normalizePath(filePath);
  if (!shouldCheckConvexFunctionRegistrationFile(normalizedFilePath)) return [];

  const sourceFile = ts.createSourceFile(normalizedFilePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const issues: ConvexFunctionRegistrationIssue[] = [];

  const addIssue = (node: ts.Node, importedBuilder: string) => {
    const location = sourceLocation(sourceFile, node);
    issues.push({ filePath: normalizedFilePath, ...location, importedBuilder });
  };

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && isGeneratedServerImport(statement.moduleSpecifier)) {
      const importClause = statement.importClause;
      if (!importClause || importClause.isTypeOnly || !importClause.namedBindings) continue;

      if (ts.isNamespaceImport(importClause.namedBindings)) {
        addIssue(importClause.namedBindings, "*");
        continue;
      }

      for (const specifier of importClause.namedBindings.elements) {
        if (specifier.isTypeOnly) continue;
        const importedBuilder = (specifier.propertyName ?? specifier.name).text;
        if (RAW_CONVEX_BUILDERS.has(importedBuilder)) addIssue(specifier, importedBuilder);
      }
      continue;
    }

    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
    if (!isGeneratedServerImport(statement.moduleSpecifier) || statement.isTypeOnly) continue;

    if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) {
      addIssue(statement, "*");
      continue;
    }

    for (const specifier of statement.exportClause.elements) {
      if (specifier.isTypeOnly) continue;
      const importedBuilder = (specifier.propertyName ?? specifier.name).text;
      if (RAW_CONVEX_BUILDERS.has(importedBuilder)) addIssue(specifier, importedBuilder);
    }
  }

  return issues.sort(
    (a, b) => a.line - b.line || a.column - b.column || a.importedBuilder.localeCompare(b.importedBuilder),
  );
};

const collectFiles = async (rootDir: string, dir: string): Promise<string[]> => {
  const entries = await readdir(path.join(rootDir, dir), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = normalizePath(path.join(dir, entry.name));
    if (entry.isDirectory()) {
      if (entry.name !== "_generated") files.push(...(await collectFiles(rootDir, relativePath)));
      continue;
    }
    if (entry.isFile() && shouldCheckConvexFunctionRegistrationFile(relativePath)) files.push(relativePath);
  }

  return files;
};

export const collectConvexFunctionRegistrationIssues = async (rootDir = process.cwd()) => {
  const files = await collectFiles(rootDir, "convex");
  const issues: ConvexFunctionRegistrationIssue[] = [];

  for (const filePath of files) {
    const source = await readFile(path.join(rootDir, filePath), "utf8");
    issues.push(...findRawConvexBuilderImportsInSource(source, filePath));
  }

  return issues.sort(
    (a, b) =>
      a.filePath.localeCompare(b.filePath) ||
      a.line - b.line ||
      a.column - b.column ||
      a.importedBuilder.localeCompare(b.importedBuilder),
  );
};

const main = async () => {
  const issues = await collectConvexFunctionRegistrationIssues();
  if (issues.length === 0) {
    console.log("Convex function registration check passed.");
    return;
  }

  console.error(`Convex function registration check found ${issues.length} issue(s):`);
  for (const issue of issues) {
    const builder = issue.importedBuilder === "*" ? "namespace / star export" : issue.importedBuilder;
    console.error(
      `${issue.filePath}:${issue.line}:${issue.column} ${builder}\n` +
        "  convex/_lib/errorObservability.ts の observed builder、または convex/_lib/functions.ts の共通builderを使ってください。",
    );
  }
  process.exit(1);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
