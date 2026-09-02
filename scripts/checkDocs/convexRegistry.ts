import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { extractConvexReferences, isCurrentDoc } from "./markdown";
import type { ConvexOperationalReferenceRegistry, ConvexReferenceRegistry } from "./types";

export type ConvexApiTypes = {
  checker: ts.TypeChecker;
  sourceFile: ts.SourceFile;
  moduleTypeNodes: ReadonlyMap<string, ts.TypeNode>;
};

const getSymbolType = (apiTypes: Pick<ConvexApiTypes, "checker" | "sourceFile">, symbol: ts.Symbol) =>
  apiTypes.checker.getTypeOfSymbolAtLocation(
    symbol,
    symbol.valueDeclaration ?? symbol.declarations?.[0] ?? apiTypes.sourceFile,
  );

// `api`と`internal`は生成module全体を畳むmapped typeで解決が重いため、`fullApi`のmodule一覧から参照先moduleだけを解決する。
const collectConvexApiModuleTypeNodes = (sourceFile: ts.SourceFile) => {
  const moduleTypeNodes = new Map<string, ts.TypeNode>();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "fullApi") continue;

      const moduleMap =
        declaration.type && ts.isTypeReferenceNode(declaration.type) && declaration.type.typeArguments?.[0];
      if (!moduleMap || !ts.isTypeLiteralNode(moduleMap)) continue;

      for (const member of moduleMap.members) {
        if (!ts.isPropertySignature(member) || !member.type) continue;
        if (!ts.isStringLiteral(member.name) && !ts.isIdentifier(member.name)) continue;
        moduleTypeNodes.set(member.name.text, member.type);
      }
    }
  }

  return moduleTypeNodes;
};

export const loadConvexApiTypes = (rootDir: string): ConvexApiTypes => {
  const declarationPath = path.resolve(rootDir, "convex/_generated/api.d.ts");
  const program = ts.createProgram([declarationPath], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
  });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(declarationPath);
  if (!sourceFile) throw new Error("convex/_generated/api.d.tsを読み込めませんでした");

  const moduleTypeNodes = collectConvexApiModuleTypeNodes(sourceFile);
  if (moduleTypeNodes.size === 0)
    throw new Error("convex/_generated/api.d.tsのfullApiからmodule一覧を解決できませんでした");

  return { checker, sourceFile, moduleTypeNodes };
};

const CONVEX_FUNCTION_KIND_PROPERTIES = ["isQuery", "isMutation", "isAction"];
const CONVEX_API_ROOT_VISIBILITIES = { api: "public", internal: "internal" } as const;

const isRegisteredConvexFunction = (
  apiTypes: ConvexApiTypes,
  exportType: ts.Type,
  visibility: "public" | "internal",
) => {
  const properties = new Set(apiTypes.checker.getPropertiesOfType(exportType).map((property) => property.name));
  if (!properties.has("isConvexFunction")) return false;
  if (!CONVEX_FUNCTION_KIND_PROPERTIES.some((name) => properties.has(name))) return false;

  const visibilityProperty = apiTypes.checker.getPropertyOfType(exportType, "_visibility");
  if (!visibilityProperty) return false;

  const visibilityType = getSymbolType(apiTypes, visibilityProperty);
  return visibilityType.isStringLiteral() && visibilityType.value === visibility;
};

export const collectPublicConvexSurface = (apiTypes: ConvexApiTypes) => {
  const entries = new Set<string>();

  for (const [modulePath, moduleTypeNode] of apiTypes.moduleTypeNodes) {
    const moduleType = apiTypes.checker.getTypeAtLocation(moduleTypeNode);
    for (const exportSymbol of apiTypes.checker.getPropertiesOfType(moduleType)) {
      const exportType = getSymbolType(apiTypes, exportSymbol);
      if (isRegisteredConvexFunction(apiTypes, exportType, "public")) {
        entries.add(`${modulePath}#${exportSymbol.name}`);
      }
    }
  }

  return entries;
};

const isValidDottedConvexReference = (apiTypes: ConvexApiTypes, reference: string) => {
  const [rootName, ...segments] = reference.split(".");
  if (rootName !== "api" && rootName !== "internal") return false;

  const exportName = segments.at(-1);
  const modulePath = segments.slice(0, -1).join("/");
  if (!exportName || !modulePath) return false;

  const moduleTypeNode = apiTypes.moduleTypeNodes.get(modulePath);
  if (!moduleTypeNode) return false;

  const moduleType = apiTypes.checker.getTypeAtLocation(moduleTypeNode);
  const exportSymbol = apiTypes.checker.getPropertyOfType(moduleType, exportName);
  if (!exportSymbol) return false;

  return isRegisteredConvexFunction(
    apiTypes,
    getSymbolType(apiTypes, exportSymbol),
    CONVEX_API_ROOT_VISIBILITIES[rootName],
  );
};

const getExportedNames = (sourceFile: ts.SourceFile) => {
  const names = new Set<string>();
  const isExported = (node: ts.Node) =>
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
      continue;
    }

    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
      statement.name &&
      isExported(statement)
    ) {
      names.add(statement.name.text);
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) names.add(element.name.text);
    }
  }

  return names;
};

const createTypeScriptSourceFile = (filePath: string, source: string) =>
  ts.createSourceFile(filePath, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

const getStaticString = (expression: ts.Expression) =>
  ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression) ? expression.text : undefined;

const isMethodCall = (node: ts.CallExpression, receiverName: string, methodName: string) =>
  ts.isPropertyAccessExpression(node.expression) &&
  ts.isIdentifier(node.expression.expression) &&
  node.expression.expression.text === receiverName &&
  node.expression.name.text === methodName;

const visitCallExpressions = (sourceFile: ts.SourceFile, visitor: (node: ts.CallExpression) => void) => {
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) visitor(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
};

const getObjectLiteralStringProperty = (object: ts.ObjectLiteralExpression, propertyName: string) => {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name;
    const nameText = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
    if (nameText === propertyName) return getStaticString(property.initializer);
  }
  return undefined;
};

const extractHttpRouteInventory = (source: string) => {
  const sourceFile = createTypeScriptSourceFile("convex/http.ts", source);
  const httpRoutes = new Set<string>();

  visitCallExpressions(sourceFile, (node) => {
    if (!isMethodCall(node, "http", "route")) return;
    const registration = node.arguments[0];
    if (!registration || !ts.isObjectLiteralExpression(registration)) {
      throw new Error("convex/http.tsのhttp.routeはobject literalで登録してください");
    }

    const method = getObjectLiteralStringProperty(registration, "method");
    const routePath = getObjectLiteralStringProperty(registration, "path");
    if (!method || !routePath) {
      throw new Error("convex/http.tsのhttp.routeはliteralのmethodとpathを必要とします");
    }

    httpRoutes.add(`${method} ${routePath}`);
  });

  return httpRoutes;
};

const extractCronInventory = (source: string) => {
  const sourceFile = createTypeScriptSourceFile("convex/crons.ts", source);
  const cronNames = new Set<string>();

  visitCallExpressions(sourceFile, (node) => {
    const isCronRegistration = isMethodCall(node, "crons", "cron") || isMethodCall(node, "crons", "interval");
    if (!isCronRegistration) return;

    const name = node.arguments[0] ? getStaticString(node.arguments[0]) : undefined;
    if (!name) throw new Error("convex/crons.tsのcron名はliteralで登録してください");
    cronNames.add(name);
  });

  return cronNames;
};

const getPropertyAccessSegments = (expression: ts.Expression) => {
  const segments: string[] = [];
  let current = expression;

  while (ts.isPropertyAccessExpression(current)) {
    segments.unshift(current.name.text);
    current = current.expression;
  }
  if (!ts.isIdentifier(current)) return undefined;
  segments.unshift(current.text);
  return segments;
};

const getMigrationName = (expression: ts.Expression) => {
  const segments = getPropertyAccessSegments(expression);
  if (
    segments?.length !== 4 ||
    segments[0] !== "internal" ||
    segments[1] !== "migrations" ||
    segments[3] !== "migration" ||
    !/^m\d{3}_[a-z0-9_]+$/.test(segments[2])
  ) {
    return undefined;
  }
  return segments[2];
};

const extractMigrationInventory = (source: string) => {
  const sourceFile = createTypeScriptSourceFile("convex/migrations/index.ts", source);
  const fullNames = new Set<string>();

  visitCallExpressions(sourceFile, (node) => {
    if (!isMethodCall(node, "migrations", "runner")) return;
    const registration = node.arguments[0];
    if (!registration) throw new Error("convex/migrations/index.tsのrunnerにmigration登録がありません");

    const entries = ts.isArrayLiteralExpression(registration) ? registration.elements : [registration];
    for (const entry of entries) {
      if (!ts.isExpression(entry)) {
        throw new Error("convex/migrations/index.tsのmigrationは静的なfunction referenceで登録してください");
      }
      const name = getMigrationName(entry);
      if (!name) {
        throw new Error("convex/migrations/index.tsのmigrationは静的なfunction referenceで登録してください");
      }
      fullNames.add(name);
    }
  });

  const migrationNames = new Set<string>();
  const aliases = new Map<string, string>();
  for (const fullName of [...fullNames].sort()) {
    const alias = fullName.slice(0, 4);
    const existing = aliases.get(alias);
    if (existing && existing !== fullName) {
      throw new Error(`convex/migrations/index.tsでmigration番号${alias}が重複しています: ${existing}, ${fullName}`);
    }
    aliases.set(alias, fullName);
    migrationNames.add(alias);
    migrationNames.add(fullName);
  }

  return migrationNames;
};

export const buildConvexOperationalReferenceRegistryFromSources = (sources: {
  http: string;
  crons: string;
  migrations: string;
}): ConvexOperationalReferenceRegistry => ({
  httpRoutes: extractHttpRouteInventory(sources.http),
  cronNames: extractCronInventory(sources.crons),
  migrationNames: extractMigrationInventory(sources.migrations),
});

export const buildConvexOperationalReferenceRegistry = async (
  rootDir: string,
): Promise<ConvexOperationalReferenceRegistry> => {
  const [http, crons, migrations] = await Promise.all([
    readFile(path.resolve(rootDir, "convex/http.ts"), "utf8"),
    readFile(path.resolve(rootDir, "convex/crons.ts"), "utf8"),
    readFile(path.resolve(rootDir, "convex/migrations/index.ts"), "utf8"),
  ]);
  return buildConvexOperationalReferenceRegistryFromSources({ http, crons, migrations });
};

const isValidColonConvexReference = async (
  rootDir: string,
  reference: string,
  exportCache: Map<string, ReadonlySet<string>>,
) => {
  const separatorIndex = reference.lastIndexOf(":");
  if (separatorIndex === -1) return false;

  const modulePath = reference.slice(0, separatorIndex);
  const exportName = reference.slice(separatorIndex + 1);
  const convexRoot = path.resolve(rootDir, "convex");
  const sourcePath = path.resolve(convexRoot, `${modulePath}.ts`);
  if (!sourcePath.startsWith(`${convexRoot}${path.sep}`)) return false;

  let exportedNames = exportCache.get(sourcePath);
  if (!exportedNames) {
    let source: string;
    try {
      source = await readFile(sourcePath, "utf8");
    } catch {
      return false;
    }
    const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
    exportedNames = getExportedNames(sourceFile);
    exportCache.set(sourcePath, exportedNames);
  }

  return exportedNames.has(exportName);
};

export const buildConvexReferenceRegistry = async (
  rootDir: string,
  documents: Readonly<Record<string, string>>,
  loadedApiTypes?: ConvexApiTypes,
): Promise<ConvexReferenceRegistry> => {
  const references = Object.entries(documents)
    .filter(([filePath]) => isCurrentDoc(filePath))
    .flatMap(([, source]) => extractConvexReferences(source));
  const dottedReferences = [
    ...new Set(references.filter(({ kind }) => kind === "dotted").map(({ reference }) => reference)),
  ];
  const colonReferences = [
    ...new Set(references.filter(({ kind }) => kind === "colon").map(({ reference }) => reference)),
  ];
  const validDottedReferences = new Set<string>();
  const validColonReferences = new Set<string>();

  if (dottedReferences.length > 0) {
    const apiTypes = loadedApiTypes ?? loadConvexApiTypes(rootDir);
    for (const reference of dottedReferences) {
      if (isValidDottedConvexReference(apiTypes, reference)) validDottedReferences.add(reference);
    }
  }

  const exportCache = new Map<string, ReadonlySet<string>>();
  for (const reference of colonReferences) {
    if (await isValidColonConvexReference(rootDir, reference, exportCache)) validColonReferences.add(reference);
  }

  return { dotted: validDottedReferences, colon: validColonReferences };
};
