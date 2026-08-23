#!/usr/bin/env tsx

import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);
const READ_METHODS = ["collect", "filter", "take", "paginate"] as const;
const PUBLIC_BUILDERS = {
  action: "action",
  mutation: "mutation",
  observedAction: "action",
  observedMutation: "mutation",
  observedQuery: "query",
  query: "query",
} as const;

type FunctionKind = "query" | "mutation" | "action";
type TrustBoundary =
  | "authenticated"
  | "manager"
  | "staff-session"
  | "public-raw"
  | "anonymous-http"
  | "provider-service-http"
  | "unknown-custom-wrapper";
type RegistrationKind = "common-wrapper" | "raw-public";
type OutputFormat = "json" | "markdown";

type ImportedBinding = {
  importedName: string;
  modulePath: string;
};

export type ConvexPublicWrapperInventory = {
  modulePath: string;
  name: string;
  functionKind: FunctionKind;
  trustBoundary: TrustBoundary;
  factory: boolean;
};

export type ConvexPublicFunctionInventory = {
  modulePath: string;
  functionName: string;
  apiReference: string;
  builder: string;
  functionKind: FunctionKind;
  trustBoundary: TrustBoundary;
  registration: RegistrationKind;
  hasArgsValidator: boolean;
  hasReturnsValidator: boolean;
  hasSrcApiReference: boolean;
  hasConvexTestApiReference: boolean;
  readCandidates: Record<(typeof READ_METHODS)[number], number>;
  manualReviewCandidates: string[];
};

export type ConvexHttpRouteInventory = {
  modulePath: "convex/http.ts";
  registration: "exact" | "prefix";
  path: string;
  method: string;
  handlerModule: string | null;
  handlerExport: string;
  trustBoundary: "anonymous-http" | "provider-service-http";
};

export type ConvexPublicSurfaceInventory = {
  schemaVersion: 1;
  summary: {
    publicFunctions: number;
    httpRoutes: number;
    commonWrappers: number;
    byFunctionKind: Record<FunctionKind, number>;
    byTrustBoundary: Partial<Record<TrustBoundary, number>>;
    missingArgsValidators: number;
    missingReturnsValidators: number;
    withoutSrcApiReference: number;
    withoutConvexTestApiReference: number;
    readMethodCalls: Record<(typeof READ_METHODS)[number], number>;
    functionsWithManualReviewCandidates: number;
  };
  wrappers: ConvexPublicWrapperInventory[];
  functions: ConvexPublicFunctionInventory[];
  httpRoutes: ConvexHttpRouteInventory[];
};

const normalizePath = (filePath: string) => filePath.split(path.sep).join("/");

const isSourceFile = (filePath: string) => SOURCE_EXTENSIONS.has(path.extname(filePath));

const isTestFile = (filePath: string) => /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.[cm]?[jt]sx?$/.test(filePath);

const isGeneratedFile = (filePath: string) => normalizePath(filePath).split("/").includes("_generated");

const isConvexTestingFile = (filePath: string) => {
  const normalized = normalizePath(filePath);
  return normalized === "convex/testing.ts" || normalized.startsWith("convex/testing/");
};

const hasPrivateConvexSegment = (filePath: string) =>
  normalizePath(filePath)
    .split("/")
    .slice(1, -1)
    .some((segment) => segment.startsWith("_"));

export const shouldInspectConvexPublicFunctionFile = (filePath: string) => {
  const normalized = normalizePath(filePath);
  return (
    normalized.startsWith("convex/") &&
    normalized.endsWith(".ts") &&
    !isGeneratedFile(normalized) &&
    !isTestFile(normalized) &&
    !isConvexTestingFile(normalized) &&
    !hasPrivateConvexSegment(normalized)
  );
};

const collectFiles = async (rootDir: string, relativeDir: string, optional = false): Promise<string[]> => {
  let entries: Dirent[];
  try {
    entries = await readdir(path.join(rootDir, relativeDir), { withFileTypes: true });
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = normalizePath(path.posix.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
};

const parseSourceFile = (source: string, filePath: string) =>
  ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

const isExported = (node: ts.Node) =>
  ts.canHaveModifiers(node) &&
  ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;

const resolveRelativeModule = (fromFile: string, moduleSpecifier: string) => {
  if (!moduleSpecifier.startsWith(".")) return moduleSpecifier;
  const resolved = normalizePath(path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), moduleSpecifier)));
  return path.posix.extname(resolved) ? resolved : `${resolved}.ts`;
};

const collectImportedBindings = (sourceFile: ts.SourceFile, filePath: string) => {
  const bindings = new Map<string, ImportedBinding>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    const modulePath = resolveRelativeModule(filePath, statement.moduleSpecifier.text);
    for (const specifier of namedBindings.elements) {
      if (specifier.isTypeOnly) continue;
      bindings.set(specifier.name.text, {
        importedName: (specifier.propertyName ?? specifier.name).text,
        modulePath,
      });
    }
  }
  return bindings;
};

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
};

const getCalledIdentifier = (expression: ts.Expression): string | null => {
  const unwrapped = unwrapExpression(expression);
  if (ts.isIdentifier(unwrapped)) return unwrapped.text;
  if (ts.isCallExpression(unwrapped)) return getCalledIdentifier(unwrapped.expression);
  return null;
};

const findCustomBuilderKind = (node: ts.Node): FunctionKind | null => {
  let result: FunctionKind | null = null;
  const visit = (current: ts.Node) => {
    if (result) return;
    if (ts.isCallExpression(current)) {
      const called = getCalledIdentifier(current.expression);
      if (called === "customQuery") result = "query";
      if (called === "customMutation") result = "mutation";
      if (called === "customAction") result = "action";
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return result;
};

const trustBoundaryForWrapper = (name: string): TrustBoundary => {
  if (name.startsWith("authenticated")) return "authenticated";
  if (name.startsWith("manager") || name.startsWith("organization")) return "manager";
  if (name.startsWith("staffSession")) return "staff-session";
  return "unknown-custom-wrapper";
};

const collectWrappersFromSource = (source: string, filePath: string): ConvexPublicWrapperInventory[] => {
  const sourceFile = parseSourceFile(source, filePath);
  const wrappers: ConvexPublicWrapperInventory[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const functionKind = findCustomBuilderKind(declaration.initializer);
        if (!functionKind) continue;
        wrappers.push({
          modulePath: filePath,
          name: declaration.name.text,
          functionKind,
          trustBoundary: trustBoundaryForWrapper(declaration.name.text),
          factory: false,
        });
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name && statement.body) {
      const functionKind = findCustomBuilderKind(statement.body);
      if (!functionKind) continue;
      wrappers.push({
        modulePath: filePath,
        name: statement.name.text,
        functionKind,
        trustBoundary: trustBoundaryForWrapper(statement.name.text),
        factory: true,
      });
    }
  }

  return wrappers;
};

const collectPublicWrappers = async (rootDir: string, convexFiles: string[]) => {
  const wrapperFiles = convexFiles.filter(
    (filePath) =>
      filePath.startsWith("convex/_lib/") &&
      filePath.endsWith(".ts") &&
      !isGeneratedFile(filePath) &&
      !isTestFile(filePath),
  );
  const wrappers: ConvexPublicWrapperInventory[] = [];
  for (const filePath of wrapperFiles) {
    const source = await readFile(path.join(rootDir, filePath), "utf8");
    wrappers.push(...collectWrappersFromSource(source, filePath));
  }
  return wrappers.sort((a, b) => a.modulePath.localeCompare(b.modulePath) || a.name.localeCompare(b.name));
};

const wrapperKey = (modulePath: string, name: string) => `${modulePath}#${name}`;

const getDefinitionArgument = (initializer: ts.Expression): ts.Expression | null => {
  const expression = unwrapExpression(initializer);
  if (!ts.isCallExpression(expression)) return null;
  return expression.arguments[0] ?? null;
};

const objectHasProperty = (expression: ts.Expression | null, propertyName: string) => {
  if (!expression) return false;
  const unwrapped = unwrapExpression(expression);
  if (!ts.isObjectLiteralExpression(unwrapped)) return false;
  return unwrapped.properties.some((property) => {
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property) &&
      !ts.isMethodDeclaration(property)
    ) {
      return false;
    }
    return property.name && ts.isIdentifier(property.name) && property.name.text === propertyName;
  });
};

const getHandlerNode = (definition: ts.Expression | null): ts.Node | null => {
  if (!definition) return null;
  const unwrapped = unwrapExpression(definition);
  if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped) || ts.isFunctionDeclaration(unwrapped)) {
    return unwrapped;
  }
  if (!ts.isObjectLiteralExpression(unwrapped)) return null;

  for (const property of unwrapped.properties) {
    if (!property.name || !ts.isIdentifier(property.name) || property.name.text !== "handler") continue;
    if (ts.isPropertyAssignment(property)) return property.initializer;
    if (ts.isMethodDeclaration(property)) return property;
  }
  return null;
};

const countReadCandidates = (handler: ts.Node | null) => {
  const counts: Record<(typeof READ_METHODS)[number], number> = {
    collect: 0,
    filter: 0,
    take: 0,
    paginate: 0,
  };
  if (!handler) return counts;

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const expression = unwrapExpression(node.expression);
      if (ts.isPropertyAccessExpression(expression)) {
        const method = expression.name.text as (typeof READ_METHODS)[number];
        if (READ_METHODS.includes(method)) counts[method] += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(handler);
  return counts;
};

const accessPath = (expression: ts.Expression): string[] | null => {
  const unwrapped = unwrapExpression(expression);
  if (ts.isIdentifier(unwrapped)) return [unwrapped.text];
  if (ts.isPropertyAccessExpression(unwrapped)) {
    const parent = accessPath(unwrapped.expression);
    return parent ? [...parent, unwrapped.name.text] : null;
  }
  if (ts.isElementAccessExpression(unwrapped) && unwrapped.argumentExpression) {
    const parent = accessPath(unwrapped.expression);
    const argument = unwrapExpression(unwrapped.argumentExpression);
    if (!parent || (!ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument))) return null;
    return [...parent, argument.text];
  }
  return null;
};

const collectApiReferencesFromSource = (source: string, filePath: string) => {
  const sourceFile = parseSourceFile(source, filePath);
  const references = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const parts = accessPath(node);
      if (parts && parts[0] === "api" && parts.length >= 3) references.add(parts.join("."));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
};

const collectApiReferences = async (rootDir: string, filePaths: string[]) => {
  const references = new Set<string>();
  for (const filePath of filePaths.sort((a, b) => a.localeCompare(b))) {
    const source = await readFile(path.join(rootDir, filePath), "utf8");
    for (const reference of collectApiReferencesFromSource(source, filePath)) references.add(reference);
  }
  return references;
};

const apiReferenceFor = (filePath: string, functionName: string) => {
  const modulePath = filePath
    .replace(/^convex\//, "")
    .replace(/\.ts$/, "")
    .split("/")
    .join(".");
  return `api.${modulePath}.${functionName}`;
};

type ResolvedBuilder = {
  builder: string;
  functionKind: FunctionKind;
  trustBoundary: TrustBoundary;
  registration: RegistrationKind;
};

const resolveBuilder = (
  localBuilderName: string,
  imports: Map<string, ImportedBinding>,
  wrappers: Map<string, ConvexPublicWrapperInventory>,
): ResolvedBuilder | null => {
  const imported = imports.get(localBuilderName);
  if (imported) {
    const wrapper = wrappers.get(wrapperKey(imported.modulePath, imported.importedName));
    if (wrapper) {
      return {
        builder: imported.importedName,
        functionKind: wrapper.functionKind,
        trustBoundary: wrapper.trustBoundary,
        registration: "common-wrapper",
      };
    }
    const publicKind = PUBLIC_BUILDERS[imported.importedName as keyof typeof PUBLIC_BUILDERS];
    if (publicKind) {
      return {
        builder: imported.importedName,
        functionKind: publicKind,
        trustBoundary: "public-raw",
        registration: "raw-public",
      };
    }
    return null;
  }

  const publicKind = PUBLIC_BUILDERS[localBuilderName as keyof typeof PUBLIC_BUILDERS];
  return publicKind
    ? {
        builder: localBuilderName,
        functionKind: publicKind,
        trustBoundary: "public-raw",
        registration: "raw-public",
      }
    : null;
};

const buildManualReviewCandidates = (
  functionInventory: Omit<ConvexPublicFunctionInventory, "manualReviewCandidates">,
) => {
  const candidates: string[] = [];
  if (!functionInventory.hasArgsValidator) candidates.push("missing-args-validator");
  if (!functionInventory.hasReturnsValidator) candidates.push("missing-returns-validator");
  if (!functionInventory.hasSrcApiReference) candidates.push("no-src-api-reference");
  if (!functionInventory.hasConvexTestApiReference) candidates.push("no-convex-test-api-reference");
  if (functionInventory.registration === "raw-public") candidates.push("raw-public-boundary");
  if (functionInventory.readCandidates.collect > 0) candidates.push("collect-in-handler");
  return candidates.sort((a, b) => a.localeCompare(b));
};

const collectPublicFunctionsFromSource = (
  source: string,
  filePath: string,
  wrappers: Map<string, ConvexPublicWrapperInventory>,
  srcReferences: Set<string>,
  testReferences: Set<string>,
) => {
  const sourceFile = parseSourceFile(source, filePath);
  const imports = collectImportedBindings(sourceFile, filePath);
  const functions: ConvexPublicFunctionInventory[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const localBuilderName = getCalledIdentifier(declaration.initializer);
      if (!localBuilderName) continue;
      const builder = resolveBuilder(localBuilderName, imports, wrappers);
      if (!builder) continue;

      const definition = getDefinitionArgument(declaration.initializer);
      const apiReference = apiReferenceFor(filePath, declaration.name.text);
      const withoutCandidates: Omit<ConvexPublicFunctionInventory, "manualReviewCandidates"> = {
        modulePath: filePath,
        functionName: declaration.name.text,
        apiReference,
        ...builder,
        hasArgsValidator: objectHasProperty(definition, "args"),
        hasReturnsValidator: objectHasProperty(definition, "returns"),
        hasSrcApiReference: srcReferences.has(apiReference),
        hasConvexTestApiReference: testReferences.has(apiReference),
        readCandidates: countReadCandidates(getHandlerNode(definition)),
      };
      functions.push({
        ...withoutCandidates,
        manualReviewCandidates: buildManualReviewCandidates(withoutCandidates),
      });
    }
  }

  return functions;
};

const readStaticStringProperty = (object: ts.ObjectLiteralExpression, propertyName: string) => {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || !property.name) continue;
    const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null;
    if (name !== propertyName) continue;
    const value = unwrapExpression(property.initializer);
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  }
  return null;
};

const readHandlerIdentifier = (object: ts.ObjectLiteralExpression) => {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || !property.name) continue;
    const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null;
    if (name !== "handler") continue;
    const value = unwrapExpression(property.initializer);
    return ts.isIdentifier(value) ? value.text : null;
  }
  return null;
};

const httpTrustBoundary = (routePath: string, handlerModule: string | null) => {
  const providerPattern = /(?:webhook|analyticsDashboard)/i;
  return providerPattern.test(routePath) || (handlerModule !== null && providerPattern.test(handlerModule))
    ? ("provider-service-http" as const)
    : ("anonymous-http" as const);
};

const collectHttpRoutesFromSource = (source: string): ConvexHttpRouteInventory[] => {
  const filePath = "convex/http.ts";
  const sourceFile = parseSourceFile(source, filePath);
  const imports = collectImportedBindings(sourceFile, filePath);
  const routes: ConvexHttpRouteInventory[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression;
      if (ts.isIdentifier(receiver) && receiver.text === "http" && node.expression.name.text === "route") {
        const definition = node.arguments[0];
        if (definition && ts.isObjectLiteralExpression(definition)) {
          const exactPath = readStaticStringProperty(definition, "path");
          const prefixPath = readStaticStringProperty(definition, "pathPrefix");
          const method = readStaticStringProperty(definition, "method");
          const handlerIdentifier = readHandlerIdentifier(definition);
          if ((exactPath || prefixPath) && method && handlerIdentifier) {
            const imported = imports.get(handlerIdentifier);
            const handlerModule = imported?.modulePath ?? null;
            routes.push({
              modulePath: filePath,
              registration: exactPath ? "exact" : "prefix",
              path: exactPath ?? (prefixPath as string),
              method,
              handlerModule,
              handlerExport: imported?.importedName ?? handlerIdentifier,
              trustBoundary: httpTrustBoundary(exactPath ?? (prefixPath as string), handlerModule),
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return routes.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.method.localeCompare(b.method) ||
      a.handlerExport.localeCompare(b.handlerExport),
  );
};

const increment = <Key extends string>(record: Partial<Record<Key, number>>, key: Key) => {
  record[key] = (record[key] ?? 0) + 1;
};

const summarizeInventory = (
  wrappers: ConvexPublicWrapperInventory[],
  functions: ConvexPublicFunctionInventory[],
  httpRoutes: ConvexHttpRouteInventory[],
): ConvexPublicSurfaceInventory["summary"] => {
  const byFunctionKind: Record<FunctionKind, number> = { query: 0, mutation: 0, action: 0 };
  const byTrustBoundary: Partial<Record<TrustBoundary, number>> = {};
  const readMethodCalls: Record<(typeof READ_METHODS)[number], number> = {
    collect: 0,
    filter: 0,
    take: 0,
    paginate: 0,
  };

  for (const item of functions) {
    byFunctionKind[item.functionKind] += 1;
    increment(byTrustBoundary, item.trustBoundary);
    for (const method of READ_METHODS) readMethodCalls[method] += item.readCandidates[method];
  }
  for (const route of httpRoutes) increment(byTrustBoundary, route.trustBoundary);

  return {
    publicFunctions: functions.length,
    httpRoutes: httpRoutes.length,
    commonWrappers: wrappers.length,
    byFunctionKind,
    byTrustBoundary: Object.fromEntries(
      Object.entries(byTrustBoundary).sort(([left], [right]) => left.localeCompare(right)),
    ) as Partial<Record<TrustBoundary, number>>,
    missingArgsValidators: functions.filter((item) => !item.hasArgsValidator).length,
    missingReturnsValidators: functions.filter((item) => !item.hasReturnsValidator).length,
    withoutSrcApiReference: functions.filter((item) => !item.hasSrcApiReference).length,
    withoutConvexTestApiReference: functions.filter((item) => !item.hasConvexTestApiReference).length,
    readMethodCalls,
    functionsWithManualReviewCandidates: functions.filter((item) => item.manualReviewCandidates.length > 0).length,
  };
};

export const inspectConvexPublicSurface = async (rootDir = process.cwd()): Promise<ConvexPublicSurfaceInventory> => {
  const absoluteRoot = path.resolve(rootDir);
  const convexFiles = await collectFiles(absoluteRoot, "convex");
  const srcFiles = (await collectFiles(absoluteRoot, "src", true)).filter(isSourceFile);
  const convexTestFiles = convexFiles.filter((filePath) => isSourceFile(filePath) && isTestFile(filePath));
  const [wrappers, srcReferences, testReferences] = await Promise.all([
    collectPublicWrappers(absoluteRoot, convexFiles),
    collectApiReferences(absoluteRoot, srcFiles),
    collectApiReferences(absoluteRoot, convexTestFiles),
  ]);
  const wrapperMap = new Map(wrappers.map((wrapper) => [wrapperKey(wrapper.modulePath, wrapper.name), wrapper]));
  const functions: ConvexPublicFunctionInventory[] = [];

  for (const filePath of convexFiles.filter(shouldInspectConvexPublicFunctionFile)) {
    const source = await readFile(path.join(absoluteRoot, filePath), "utf8");
    functions.push(...collectPublicFunctionsFromSource(source, filePath, wrapperMap, srcReferences, testReferences));
  }
  functions.sort((a, b) => a.modulePath.localeCompare(b.modulePath) || a.functionName.localeCompare(b.functionName));

  const httpSource = await readFile(path.join(absoluteRoot, "convex/http.ts"), "utf8");
  const httpRoutes = collectHttpRoutesFromSource(httpSource);

  return {
    schemaVersion: 1,
    summary: summarizeInventory(wrappers, functions, httpRoutes),
    wrappers,
    functions,
    httpRoutes,
  };
};

const markdownValue = (value: string) => `\`${value.replaceAll("|", "\\|").replaceAll("`", "\\`")}\``;
const yesNo = (value: boolean) => (value ? "yes" : "no");

export const formatConvexPublicSurfaceMarkdown = (inventory: ConvexPublicSurfaceInventory) => {
  const lines: string[] = [
    "# Convex public surface inventory",
    "",
    "This output is a deterministic static inventory. Manual-review candidates are not vulnerability or performance findings.",
    "",
    "## Summary",
    "",
    "| Metric | Count |",
    "|---|---:|",
    `| Public functions | ${inventory.summary.publicFunctions} |`,
    `| HTTP routes | ${inventory.summary.httpRoutes} |`,
    `| Common wrappers | ${inventory.summary.commonWrappers} |`,
    `| Missing args validators | ${inventory.summary.missingArgsValidators} |`,
    `| Missing returns validators | ${inventory.summary.missingReturnsValidators} |`,
    `| Without direct src api reference | ${inventory.summary.withoutSrcApiReference} |`,
    `| Without direct Convex test api reference | ${inventory.summary.withoutConvexTestApiReference} |`,
    `| Functions with manual-review candidates | ${inventory.summary.functionsWithManualReviewCandidates} |`,
    "",
    "### Function kinds",
    "",
    "| Kind | Count |",
    "|---|---:|",
    ...Object.entries(inventory.summary.byFunctionKind).map(([kind, count]) => `| ${kind} | ${count} |`),
    "",
    "### Trust boundaries",
    "",
    "| Boundary | Count |",
    "|---|---:|",
    ...Object.entries(inventory.summary.byTrustBoundary).map(([boundary, count]) => `| ${boundary} | ${count} |`),
    "",
    "### Handler read-method calls",
    "",
    "| Method | Count |",
    "|---|---:|",
    ...Object.entries(inventory.summary.readMethodCalls).map(([method, count]) => `| ${method} | ${count} |`),
    "",
    "## Common wrappers",
    "",
    "| Module | Name | Kind | Trust boundary | Factory |",
    "|---|---|---|---|---|",
    ...inventory.wrappers.map(
      (wrapper) =>
        `| ${markdownValue(wrapper.modulePath)} | ${markdownValue(wrapper.name)} | ${wrapper.functionKind} | ${wrapper.trustBoundary} | ${yesNo(wrapper.factory)} |`,
    ),
    "",
    "## Public functions",
    "",
    "| Module | Export | Kind | Builder | Trust boundary | Args | Returns | src ref | Test ref | Reads c/f/t/p | Manual review |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...inventory.functions.map((item) => {
      const reads = READ_METHODS.map((method) => item.readCandidates[method]).join("/");
      const candidates = item.manualReviewCandidates.length > 0 ? item.manualReviewCandidates.join(", ") : "-";
      return `| ${markdownValue(item.modulePath)} | ${markdownValue(item.functionName)} | ${item.functionKind} | ${markdownValue(item.builder)} | ${item.trustBoundary} | ${yesNo(item.hasArgsValidator)} | ${yesNo(item.hasReturnsValidator)} | ${yesNo(item.hasSrcApiReference)} | ${yesNo(item.hasConvexTestApiReference)} | ${reads} | ${candidates} |`;
    }),
    "",
    "Read columns are collect/filter/take/paginate call counts inside the inline handler AST.",
    "",
    "## HTTP routes",
    "",
    "| Path | Method | Registration | Handler module | Handler export | Trust boundary |",
    "|---|---|---|---|---|---|",
    ...inventory.httpRoutes.map(
      (route) =>
        `| ${markdownValue(route.path)} | ${route.method} | ${route.registration} | ${route.handlerModule ? markdownValue(route.handlerModule) : "-"} | ${markdownValue(route.handlerExport)} | ${route.trustBoundary} |`,
    ),
    "",
  ];
  return lines.join("\n");
};

export const formatConvexPublicSurface = (inventory: ConvexPublicSurfaceInventory, format: OutputFormat) =>
  format === "json" ? `${JSON.stringify(inventory, null, 2)}\n` : formatConvexPublicSurfaceMarkdown(inventory);

const parseCliArgs = (args: string[]) => {
  let rootDir = process.cwd();
  let format: OutputFormat = "markdown";

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--root") {
      const value = args[index + 1];
      if (!value) throw new Error("--root requires a directory path");
      rootDir = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--root=")) {
      rootDir = argument.slice("--root=".length);
      continue;
    }
    if (argument === "--format") {
      const value = args[index + 1];
      if (value !== "json" && value !== "markdown") throw new Error("--format must be json or markdown");
      format = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--format=")) {
      const value = argument.slice("--format=".length);
      if (value !== "json" && value !== "markdown") throw new Error("--format must be json or markdown");
      format = value;
      continue;
    }
    if (argument === "--help") {
      return { help: true as const, rootDir, format };
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { help: false as const, rootDir, format };
};

const main = async () => {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: tsx scripts/inspectConvexPublicSurface.ts [--root <directory>] [--format markdown|json]");
    return;
  }
  const inventory = await inspectConvexPublicSurface(options.rootDir);
  process.stdout.write(formatConvexPublicSurface(inventory, options.format));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
