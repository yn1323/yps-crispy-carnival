import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { classifyWebMeasurementRoute } from ".";

type SourceSurface = "closed" | "measured_public" | "public_unmeasured" | "mixed";

type RouterNavigation = {
  column: number;
  kind: "call:navigate" | "call:router.navigate" | "jsx:Link" | "jsx:RouterLink";
  line: number;
  owner: string;
  target: string | null;
  targetExpression: string;
};

type BoundarySource = {
  path: string;
  source: string;
  surface: SourceSurface;
};

const MEASURED_PUBLIC_SOURCE_PREFIXES = [
  "src/components/features/ArticleSite/",
  "src/components/features/ContactForm/",
  "src/components/features/Demo/",
  "src/components/features/FaqSite/",
  "src/components/features/FeatureSection/",
  "src/components/features/HowToSite/",
  "src/components/features/LandingPage/",
  "src/components/templates/PublicFooter/",
  "src/components/templates/PublicPageLayout/",
  "src/pages/articles/",
  "src/pages/contact/",
  "src/pages/demo-flow/",
  "src/pages/demo-shift-board/",
  "src/pages/faq/",
  "src/pages/features/",
  "src/pages/home/",
  "src/pages/howto/",
  "src/routes/articles.",
  "src/routes/articles/",
  "src/routes/contact.tsx",
  "src/routes/demo.flow.tsx",
  "src/routes/demo.shiftboard.tsx",
  "src/routes/faq.tsx",
  "src/routes/features.tsx",
  "src/routes/howto.tsx",
  "src/routes/index.tsx",
] as const;

const PUBLIC_UNMEASURED_SOURCE_PREFIXES = [
  "src/components/features/CommercialTransactions/",
  "src/pages/account-deletion-accepted/",
  "src/pages/cache-reset/",
  "src/pages/commercial-transactions/",
  "src/pages/not-found/",
  "src/pages/privacy/",
  "src/pages/terms/",
  "src/routes/$.tsx",
  "src/routes/account-deletion-accepted.tsx",
  "src/routes/cache-reset.tsx",
  "src/routes/commercial-transactions.tsx",
  "src/routes/privacy",
  "src/routes/terms",
] as const;

const MIXED_SOURCE_FILES = new Set(["src/components/templates/Header/index.tsx", "src/routes/__root.tsx"]);

// mixed sourceまたは静的にtargetを確定できない既存箇所だけを、owner単位・件数込みで例外化する。
// 新しいcallsiteやtarget変更は同じfile内でも別keyになり、レビューなしでは通らない。
const NAVIGATION_CALLSITE_ALLOWLIST = [
  // AppPrimaryNavigationのtargetはAppNavigationPathに限定され、全候補がclosed surfaceである。
  "src/components/features/AuthenticatedApp/AppPrimaryNavigation/index.tsx :: DesktopNavigationLink :: jsx:RouterLink :: dynamic:target.to",
  "src/components/features/AuthenticatedApp/AppPrimaryNavigation/index.tsx :: MobileNavigationLink :: jsx:RouterLink :: dynamic:target.to",
  // AuthModeLinkのtoはAuthRoutePathに限定され、全候補がclosed surfaceである。
  "src/components/features/AuthPage/AuthFormControls.tsx :: AuthModeLink :: jsx:RouterLink :: dynamic:to",
  // UserDetailの各destination helperはスタッフ・店舗詳細、settings、dashboardのclosed routeだけを返す。
  "src/components/features/UserDetail/index.tsx :: onPersonRemoved :: call:navigate :: dynamic:{ ...destination, replace: true }",
  "src/components/features/UserDetail/index.tsx :: handleBack :: call:navigate :: dynamic:{ ...destination, replace: true }",
  "src/components/features/UserDetail/index.tsx :: onOpenShop :: call:navigate :: dynamic:destination",
  // app/legacyの条件分岐はいずれも認証済みのclosed routeだけを返す。
  'src/components/features/ManagerSettings/useManagerIssueController.ts :: useManagerIssueController :: call:navigate :: dynamic:organizationId ? { to: "/app/manage/managers", search: { org: organizationId }, replace: true } : { to: "/settings/managers", search: { shop: shopId ?? "" }, replace: true }',
  'src/components/features/ManagerSettings/useManagerSettingsController.ts :: execute :: call:navigate :: dynamic:organizationId ? { to: "/app/home", search: {}, replace: true } : { to: "/dashboard", search: clearRequestedShopSearch(), replace: true }',
  'src/components/features/ManagerSettings/useManagerSettingsController.ts :: onBack :: call:navigate :: dynamic:organizationId ? { to: "/app/manage", search: { org: organizationId }, replace: true } : { to: "/settings", search: { shop: shopId ?? "" }, replace: true }',
  'src/components/features/UserDetail/index.tsx :: onPersonRemoved :: call:navigate :: dynamic:appOrganizationId ? { to: "/app/home", search: {}, replace: true } : { to: "/dashboard", search: clearRequestedShopSearch(), replace: true }',
  // UserMenuのaccountDestinationは/accountまたは/app/accountに限定される。
  "src/components/features/UserMenu/index.tsx :: UserMenu :: jsx:RouterLink :: dynamic:accountDestination",
  // public HeaderはMeasurementBoundaryLink、user HeaderだけがこのRouterLink branchを使う。
  "src/components/templates/Header/index.tsx :: HeaderBrand :: jsx:RouterLink :: dynamic:to",
  // focused flowのbackTargetはAppShellRouteDataで許可したclosed app routeだけを返す。
  "src/components/templates/FocusedFlowHeader/index.tsx :: FocusedFlowHeader :: jsx:RouterLink :: dynamic:backTarget.to",
  // backDestinationは同じclosed surfaceのdashboardまたはsettingsを返す。
  "src/pages/user-detail/index.tsx :: UserDetailPage :: jsx:RouterLink :: dynamic:backDestination.to",
  // 店舗別スタッフ詳細のbackDestinationはclosedなスタッフ詳細routeを返す。
  "src/pages/user-shop-detail/index.tsx :: handleBack :: call:navigate :: dynamic:{ ...backDestination, replace: true }",
  // toを省略した各navigateは現在のclosed routeを保ち、searchだけを正規化・更新する。
  "src/routes/_auth/account.tsx :: AccountSecurityRoute :: call:navigate :: dynamic:{ replace: true, search: () => buildCanonicalAccountSecuritySearch(validatedSearch), }",
  "src/routes/_auth/account.tsx :: handleStartFlow :: call:navigate :: dynamic:{ search: () => ({ flow: nextFlow, oauth: undefined, shop: undefined }) }",
  "src/routes/_auth.tsx :: handleOrganizationSelect :: call:navigate :: dynamic:{ to: target.to, search: target.search }",
  "src/routes/_auth/account.tsx :: handleBackToOverview :: call:navigate :: dynamic:{ replace: true, search: clearAccountSecurityFlowSearch }",
  "src/routes/_auth/account.tsx :: handleGoogleOAuthReturn :: call:navigate :: dynamic:{ replace: true, search: clearAccountSecurityOAuthSearch, }",
  // app account内のnavigateは現在のclosed routeを保ち、flow/oauth searchだけを更新する。
  "src/routes/_auth/app_.account.tsx :: AppAccountRoute :: call:navigate :: dynamic:{ replace: true, search: () => buildCanonicalAccountSecuritySearch(validatedSearch), }",
  "src/routes/_auth/app_.account.tsx :: handleStartFlow :: call:navigate :: dynamic:{ search: () => ({ flow: nextFlow, oauth: undefined }) }",
  "src/routes/_auth/app_.account.tsx :: handleBackToOverview :: call:navigate :: dynamic:{ replace: true, search: clearAccountSecurityFlowSearch }",
  "src/routes/_auth/app_.account.tsx :: handleGoogleOAuthReturn :: call:navigate :: dynamic:{ replace: true, search: clearAccountSecurityOAuthSearch }",
  "src/routes/_auth/dashboard.tsx :: DashboardRoute :: call:navigate :: dynamic:{ replace: true, search: (previous) => updateUserListSearch(previous, { count, focus: undefined }), }",
  "src/routes/_auth/settings.tsx :: SettingsRoute :: call:navigate :: dynamic:{ replace: true, search: (previous) => updateSettingsTabSearch(previous, nextTab), }",
  "src/routes/_auth/settings.tsx :: SettingsRoute :: call:navigate :: dynamic:{ replace: true, search: (previous) => updateUserListSearch(previous, { count, focus: undefined }), }",
] as const;

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    if (!/\.[jt]sx?$/.test(entry.name) || /\.(?:stories|test)\.[jt]sx?$/.test(entry.name)) return [];
    return [path];
  });
}

function classifySource(path: string): SourceSurface {
  if (MIXED_SOURCE_FILES.has(path)) return "mixed";
  if (MEASURED_PUBLIC_SOURCE_PREFIXES.some((prefix) => path.startsWith(prefix))) return "measured_public";
  if (PUBLIC_UNMEASURED_SOURCE_PREFIXES.some((prefix) => path.startsWith(prefix))) return "public_unmeasured";
  return "closed";
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function collectConstants(sourceFile: ts.SourceFile): Map<string, ts.Expression | null> {
  const constants = new Map<string, ts.Expression | null>();

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      constants.set(node.name.text, constants.has(node.name.text) ? null : node.initializer);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return constants;
}

function resolveStaticString(
  expression: ts.Expression,
  constants: ReadonlyMap<string, ts.Expression | null>,
  resolving = new Set<string>(),
): string | null {
  const current = unwrapExpression(expression);
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) return current.text;

  if (ts.isIdentifier(current)) {
    const initializer = constants.get(current.text);
    if (!initializer || resolving.has(current.text)) return null;
    const nextResolving = new Set(resolving);
    nextResolving.add(current.text);
    return resolveStaticString(initializer, constants, nextResolving);
  }

  if (ts.isTemplateExpression(current)) {
    let value = current.head.text;
    for (const span of current.templateSpans) {
      const resolved = resolveStaticString(span.expression, constants, resolving);
      if (resolved === null) return null;
      value += resolved + span.literal.text;
    }
    return value;
  }

  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveStaticString(current.left, constants, resolving);
    const right = resolveStaticString(current.right, constants, resolving);
    return left === null || right === null ? null : left + right;
  }

  if (ts.isConditionalExpression(current)) {
    const whenTrue = resolveStaticString(current.whenTrue, constants, resolving);
    const whenFalse = resolveStaticString(current.whenFalse, constants, resolving);
    return whenTrue !== null && whenTrue === whenFalse ? whenTrue : null;
  }

  return null;
}

function getOwner(node: ts.Node): string {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (ts.isMethodDeclaration(current) && current.name) return current.name.getText();
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text;
    if (ts.isPropertyAssignment(current)) return current.name.getText();
  }
  return "<module>";
}

function createNavigation(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  kind: RouterNavigation["kind"],
  target: string | null,
  targetExpression: string,
): RouterNavigation {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    column: position.character + 1,
    kind,
    line: position.line + 1,
    owner: getOwner(node),
    target,
    targetExpression,
  };
}

function getJsxNavigation(
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  constants: ReadonlyMap<string, ts.Expression | null>,
): RouterNavigation | null {
  const tagName = node.tagName.getText(sourceFile);
  if (tagName !== "Link" && tagName !== "RouterLink") return null;

  const attribute = node.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(sourceFile) === "to",
  );
  if (!attribute) return null;

  if (attribute.initializer && ts.isStringLiteral(attribute.initializer)) {
    return createNavigation(sourceFile, node, `jsx:${tagName}`, attribute.initializer.text, attribute.initializer.text);
  }

  const expression =
    attribute.initializer && ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : null;
  return createNavigation(
    sourceFile,
    node,
    `jsx:${tagName}`,
    expression ? resolveStaticString(expression, constants) : null,
    expression?.getText(sourceFile) ?? "<missing>",
  );
}

type ObjectTargetResolution = { state: "absent" } | { state: "dynamic" } | { state: "resolved"; target: string };

function resolveObjectTarget(
  expression: ts.Expression,
  constants: ReadonlyMap<string, ts.Expression | null>,
  resolving = new Set<string>(),
): ObjectTargetResolution {
  const current = unwrapExpression(expression);

  if (ts.isIdentifier(current)) {
    const initializer = constants.get(current.text);
    if (!initializer || resolving.has(current.text)) return { state: "dynamic" };
    const nextResolving = new Set(resolving);
    nextResolving.add(current.text);
    return resolveObjectTarget(initializer, constants, nextResolving);
  }

  if (ts.isConditionalExpression(current)) {
    const whenTrue = resolveObjectTarget(current.whenTrue, constants, resolving);
    const whenFalse = resolveObjectTarget(current.whenFalse, constants, resolving);
    if (whenTrue.state !== whenFalse.state) return { state: "dynamic" };
    if (whenTrue.state === "resolved" && whenFalse.state === "resolved") {
      return whenTrue.target === whenFalse.target ? whenTrue : { state: "dynamic" };
    }
    return whenTrue;
  }

  if (!ts.isObjectLiteralExpression(current)) return { state: "dynamic" };

  let resolution: ObjectTargetResolution = { state: "absent" };
  for (const property of current.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spreadResolution = resolveObjectTarget(property.expression, constants, resolving);
      if (spreadResolution.state !== "absent") resolution = spreadResolution;
      continue;
    }

    if (ts.isPropertyAssignment(property) && property.name.getText() === "to") {
      const target = resolveStaticString(property.initializer, constants);
      resolution = target === null ? { state: "dynamic" } : { state: "resolved", target };
      continue;
    }

    if (ts.isShorthandPropertyAssignment(property) && property.name.text === "to") {
      const target = resolveStaticString(property.name, constants);
      resolution = target === null ? { state: "dynamic" } : { state: "resolved", target };
    }
  }

  return resolution;
}

function normalizeExpressionText(expression: ts.Node, sourceFile: ts.SourceFile): string {
  return expression.getText(sourceFile).replace(/\s+/g, " ");
}

function getCallNavigation(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  constants: ReadonlyMap<string, ts.Expression | null>,
): RouterNavigation | null {
  let kind: RouterNavigation["kind"] | null = null;
  if (ts.isIdentifier(node.expression) && node.expression.text === "navigate") {
    kind = "call:navigate";
  } else if (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "router" &&
    node.expression.name.text === "navigate"
  ) {
    kind = "call:router.navigate";
  }
  if (!kind) return null;

  const input = node.arguments[0];
  if (!input) return createNavigation(sourceFile, node, kind, null, "<missing argument>");

  const resolution = resolveObjectTarget(input, constants);
  const target = resolution.state === "resolved" ? resolution.target : null;
  return createNavigation(sourceFile, node, kind, target, normalizeExpressionText(input, sourceFile));
}

function extractRouterNavigations(path: string, source: string): RouterNavigation[] {
  const scriptKind = path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.ESNext, true, scriptKind);
  const constants = collectConstants(sourceFile);
  const navigations: RouterNavigation[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const navigation = getJsxNavigation(sourceFile, node, constants);
      if (navigation) navigations.push(navigation);
    } else if (ts.isCallExpression(node)) {
      const navigation = getCallNavigation(sourceFile, node, constants);
      if (navigation) navigations.push(navigation);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return navigations;
}

function callsiteKey(path: string, navigation: RouterNavigation): string {
  const target = navigation.target === null ? `dynamic:${navigation.targetExpression}` : `target:${navigation.target}`;
  return `${path} :: ${navigation.owner} :: ${navigation.kind} :: ${target}`;
}

function findBoundaryViolations(sources: readonly BoundarySource[], allowlist: readonly string[]): string[] {
  const remainingAllowances = new Map<string, number>();
  for (const allowance of allowlist) {
    remainingAllowances.set(allowance, (remainingAllowances.get(allowance) ?? 0) + 1);
  }

  const violations: string[] = [];
  for (const source of sources) {
    for (const navigation of extractRouterNavigations(source.path, source.source)) {
      const key = callsiteKey(source.path, navigation);
      const target = navigation.target;
      // TanStack Routerの"."はpathnameを保ったsearch更新であり、document surfaceを移動しない。
      if (target === ".") continue;
      if (source.surface === "mixed" || target === null || !target.startsWith("/")) {
        const remaining = remainingAllowances.get(key) ?? 0;
        if (remaining > 0) {
          remainingAllowances.set(key, remaining - 1);
        } else {
          violations.push(`${key} @ ${navigation.line}:${navigation.column} (callsite allowlist required)`);
        }
        continue;
      }

      const targetSurface = classifyWebMeasurementRoute(target).surface;
      if (source.surface !== targetSurface) {
        violations.push(
          `${source.path}:${navigation.line}:${navigation.column} (${source.surface}) -> ${navigation.target} (${targetSurface})`,
        );
      }
    }
  }

  for (const [allowance, remaining] of remainingAllowances) {
    for (let index = 0; index < remaining; index += 1) violations.push(`${allowance} (stale callsite allowlist)`);
  }

  return violations;
}

describe("Web計測document境界のAST抽出", () => {
  it("Linkと命令的navigateのliteralおよび同一file constを解決する", () => {
    const source = `
      const CLOSED = "/dashboard" as const;
      const to = "/";
      const ARTICLE = "/articles/" + "example";
      function Example() {
        return <><RouterLink to={CLOSED} /><Link to="/settings" /></>;
      }
      navigate({ to });
      router.navigate({ to: ARTICLE });
    `;

    expect(extractRouterNavigations("fixture.tsx", source).map(({ kind, target }) => ({ kind, target }))).toEqual([
      { kind: "jsx:RouterLink", target: "/dashboard" },
      { kind: "jsx:Link", target: "/settings" },
      { kind: "call:navigate", target: "/" },
      { kind: "call:router.navigate", target: "/articles/example" },
    ]);
  });

  it("navigate(options)とobject spreadを漏らさず、解決不能な引数全体をdynamicとして残す", () => {
    const source = `
      const CLOSED_OPTIONS = { to: "/dashboard", replace: true } as const;
      const PUBLIC_OPTIONS = { to: "/faq" } as const;
      navigate(CLOSED_OPTIONS);
      router.navigate({ ...PUBLIC_OPTIONS, replace: true });
      navigate(getDestination());
      navigate({ ...unknownDestination, replace: true });
      navigate({ replace: true });
      navigate();
    `;

    expect(
      extractRouterNavigations("fixture.ts", source).map(({ kind, target, targetExpression }) => ({
        kind,
        target,
        targetExpression,
      })),
    ).toEqual([
      { kind: "call:navigate", target: "/dashboard", targetExpression: "CLOSED_OPTIONS" },
      {
        kind: "call:router.navigate",
        target: "/faq",
        targetExpression: "{ ...PUBLIC_OPTIONS, replace: true }",
      },
      { kind: "call:navigate", target: null, targetExpression: "getDestination()" },
      {
        kind: "call:navigate",
        target: null,
        targetExpression: "{ ...unknownDestination, replace: true }",
      },
      { kind: "call:navigate", target: null, targetExpression: "{ replace: true }" },
      { kind: "call:navigate", target: null, targetExpression: "<missing argument>" },
    ]);
  });

  it("MeasurementBoundaryLinkとordinary anchorはrouter navigationとして扱わない", () => {
    const source = `
      <MeasurementBoundaryLink href="/dashboard" />;
      <a href="/dashboard">dashboard</a>;
      <Link href="/dashboard">dashboard</Link>;
    `;

    expect(extractRouterNavigations("fixture.tsx", source)).toEqual([]);
  });

  it("cross-surface navigationと未承認mixed callsiteを検出する", () => {
    const sources: BoundarySource[] = [
      {
        path: "fixture/public.tsx",
        source: 'const target = "/dashboard"; <RouterLink to={target} />;',
        surface: "measured_public",
      },
      {
        path: "fixture/closed.ts",
        source: 'navigate({ to: "/contact" });',
        surface: "closed",
      },
      {
        path: "fixture/mixed.tsx",
        source: '<RouterLink to="/signup" />;',
        surface: "mixed",
      },
    ];

    expect(findBoundaryViolations(sources, [])).toEqual([
      "fixture/public.tsx:1:30 (measured_public) -> /dashboard (closed)",
      "fixture/closed.ts:1:1 (closed) -> /contact (measured_public)",
      "fixture/mixed.tsx :: <module> :: jsx:RouterLink :: target:/signup @ 1:1 (callsite allowlist required)",
    ]);
  });

  it("mixed callsiteは同じowner・種類・targetの許可を一度だけ消費する", () => {
    const path = "fixture/mixed.tsx";
    const source = 'function Header() { navigate({ to: "/dashboard" }); }';
    const navigation = extractRouterNavigations(path, source)[0];
    expect(navigation).toBeDefined();
    if (!navigation) return;
    const allowance = callsiteKey(path, navigation);

    expect(findBoundaryViolations([{ path, source, surface: "mixed" }], [allowance])).toEqual([]);
    expect(findBoundaryViolations([{ path, source: `${source}\n${source}`, surface: "mixed" }], [allowance])).toEqual([
      "fixture/mixed.tsx :: Header :: call:navigate :: target:/dashboard @ 2:21 (callsite allowlist required)",
    ]);
  });
});

describe("Web計測document境界", () => {
  it("Router navigationで計測surfaceを越えない", () => {
    const sources = collectSourceFiles(join(process.cwd(), "src")).map((absolutePath): BoundarySource => {
      const sourcePath = relative(process.cwd(), absolutePath);
      return {
        path: sourcePath,
        source: readFileSync(absolutePath, "utf8"),
        surface: classifySource(sourcePath),
      };
    });

    expect(findBoundaryViolations(sources, NAVIGATION_CALLSITE_ALLOWLIST)).toEqual([]);
  });

  it("既知の双方向境界はordinary anchorを明示する", () => {
    const contracts = [
      [
        "src/components/templates/Header/index.tsx",
        'HeaderBrand to="/" ariaLabel="シフトリのトップページへ" showTagline reloadDocument',
      ],
      ["src/components/templates/Header/index.tsx", '<MeasurementBoundaryLink href="/login"'],
      ["src/components/templates/Header/index.tsx", '<MeasurementBoundaryLink href="/signup"'],
      ["src/components/features/Demo/ShiftoriDemoFlow/index.tsx", '<MeasurementBoundaryLink href="/signup"'],
      ["src/components/features/AccountDeletion/AccountDeletionDialog.tsx", '<MeasurementBoundaryLink href="/contact"'],
      [
        "src/components/features/Dashboard/DashboardContent/DashboardSectionUnavailable.tsx",
        '<MeasurementBoundaryLink href="/contact"',
      ],
    ] as const;

    for (const [path, expectedSource] of contracts) {
      expect(readFileSync(join(process.cwd(), path), "utf8"), path).toContain(expectedSource);
    }
  });
});
