#!/usr/bin/env tsx

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const PLAN_CATEGORIES = ["Proposed", "Active", "History"] as const;
const ARCHIVE_REASONS = new Set(["superseded", "abandoned", "rejected", "point-in-time-audit", "removed-feature"]);
const CURRENT_DOC_PREFIXES = ["doc/features/", "doc/specs/", "doc/rules/", "doc/manual/"];
const REPO_PATH_PREFIXES = [
  "src/",
  "convex/",
  "doc/",
  "e2e/",
  "scripts/",
  "public/",
  "apps/",
  "vite/",
  "convex-seeds/",
  ".github/",
  ".agents/",
  ".claude/",
  ".storybook/",
  ".scaffdog/",
];
const REPO_ROOT_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "biome.json",
  "cloudflare-env.d.ts",
  "package.json",
  "playwright.config.ts",
  "playwright.deployed.config.ts",
  "pnpm-workspace.yaml",
  "regconfig.json",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "vitest.vrt.config.ts",
  "wrangler.jsonc",
]);

type PlanCategory = (typeof PLAN_CATEGORIES)[number];

export type DocIssueCode =
  | "broken-markdown-link"
  | "missing-heading-anchor"
  | "missing-repo-path"
  | "missing-convex-api-reference"
  | "missing-convex-colon-reference"
  | "missing-convex-http-route-reference"
  | "missing-convex-cron-reference"
  | "missing-convex-migration-reference"
  | "missing-public-convex-inventory-export"
  | "stale-public-convex-inventory-export"
  | "incorrect-public-convex-inventory-count"
  | "unreachable-current-doc"
  | "missing-plan-category"
  | "missing-plan-index-entry"
  | "duplicate-plan-index-entry"
  | "missing-active-plan-status"
  | "missing-active-plan-condition"
  | "missing-archive-index-entry"
  | "missing-archive-reason"
  | "invalid-archive-reason"
  | "missing-archive-successor"
  | "invalid-archive-successor";

export type DocIssue = {
  code: DocIssueCode;
  filePath: string;
  line: number;
  message: string;
};

export type DocsWorkspace = {
  documents: Readonly<Record<string, string>>;
  existingPaths?: ReadonlySet<string>;
  convexReferences?: ConvexReferenceRegistry;
  convexOperationalReferences?: ConvexOperationalReferenceRegistry;
  publicConvexSurface?: ReadonlySet<string>;
};

export type ConvexReferenceRegistry = {
  dotted: ReadonlySet<string>;
  colon: ReadonlySet<string>;
};

export type ConvexOperationalReferenceRegistry = {
  httpRoutes: ReadonlySet<string>;
  cronNames: ReadonlySet<string>;
  migrationNames: ReadonlySet<string>;
};

export type MarkdownLink = {
  rawTarget: string;
  line: number;
};

export type RepoPathReference = {
  path: string;
  line: number;
};

export type ConvexReference = {
  kind: "dotted" | "colon";
  reference: string;
  line: number;
};

export type ConvexOperationalReference = {
  kind: "http-route" | "cron" | "migration";
  reference: string;
  line: number;
};

type ResolvedMarkdownTarget = {
  path: string;
  fragment?: string;
};

const normalizePath = (filePath: string) => filePath.split(path.sep).join("/");

const splitLinesOutsideFences = (source: string) => {
  const lines = source.split("\n");
  const visibleLines: string[] = [];
  let fenceCharacter: "`" | "~" | undefined;
  let fenceLength = 0;

  for (const line of lines) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);

    if (fence) {
      const marker = fence[1];
      const character = marker[0] as "`" | "~";

      if (!fenceCharacter) {
        fenceCharacter = character;
        fenceLength = marker.length;
      } else if (character === fenceCharacter && marker.length >= fenceLength) {
        fenceCharacter = undefined;
        fenceLength = 0;
      }

      visibleLines.push("");
      continue;
    }

    visibleLines.push(fenceCharacter ? "" : line);
  }

  return visibleLines;
};

const getLinkDestination = (rawTarget: string) => {
  const trimmed = rawTarget.trim();

  if (trimmed.startsWith("<")) {
    const closingIndex = trimmed.indexOf(">");
    return closingIndex === -1 ? trimmed : trimmed.slice(1, closingIndex);
  }

  return trimmed.match(/^\S+/)?.[0] ?? "";
};

const safelyDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const resolveMarkdownTarget = (sourcePath: string, rawTarget: string): ResolvedMarkdownTarget | undefined => {
  const destination = getLinkDestination(rawTarget);

  if (!destination || destination.startsWith("/")) return undefined;
  if (/^[a-z][a-z\d+.-]*:/i.test(destination)) return undefined;

  const fragmentIndex = destination.indexOf("#");
  const pathAndQuery = fragmentIndex === -1 ? destination : destination.slice(0, fragmentIndex);
  const rawFragment = fragmentIndex === -1 ? undefined : destination.slice(fragmentIndex + 1);
  const rawPath = pathAndQuery.split("?", 1)[0];
  const decodedPath = safelyDecode(rawPath);
  const resolvedPath = decodedPath
    ? path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), decodedPath))
    : sourcePath;

  return {
    path: resolvedPath,
    fragment: rawFragment ? safelyDecode(rawFragment) : undefined,
  };
};

const normalizeReferenceLabel = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase();

const findClosingDelimiter = (line: string, start: number, opening: string, closing: string) => {
  let depth = 0;

  for (let index = start; index < line.length; index++) {
    const character = line[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === opening) depth += 1;
    if (character !== closing) continue;
    depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
};

const extractInlineMarkdownLinks = (line: string, lineNumber: number) => {
  const links: MarkdownLink[] = [];
  let codeFenceLength = 0;

  for (let index = 0; index < line.length; index++) {
    if (line[index] === "`" && line[index - 1] !== "\\") {
      const marker = line.slice(index).match(/^`+/)?.[0] ?? "`";
      if (codeFenceLength === 0) {
        codeFenceLength = marker.length;
      } else if (marker.length === codeFenceLength) {
        codeFenceLength = 0;
      }
      index += marker.length - 1;
      continue;
    }
    if (codeFenceLength > 0 || line[index] !== "[" || line[index - 1] === "\\") continue;

    const labelEnd = findClosingDelimiter(line, index, "[", "]");
    if (labelEnd === -1 || line[labelEnd + 1] !== "(") continue;

    const destinationEnd = findClosingDelimiter(line, labelEnd + 1, "(", ")");
    if (destinationEnd === -1) continue;

    links.push({ rawTarget: line.slice(labelEnd + 2, destinationEnd), line: lineNumber });
    index = destinationEnd;
  }

  return links;
};

const maskInlineCode = (line: string) => line.replace(/(`+)(.*?)\1/g, (code) => " ".repeat(code.length));

export const extractMarkdownLinks = (source: string): MarkdownLink[] => {
  const links: MarkdownLink[] = [];
  const lines = splitLinesOutsideFences(source);
  const definitions = new Map<string, { rawTarget: string; line: number }>();
  const usedDefinitions = new Set<string>();

  for (const [index, line] of lines.entries()) {
    const definition = line.match(/^ {0,3}\[([^\]]+)\]:\s*(.+?)\s*$/);
    if (definition) {
      definitions.set(normalizeReferenceLabel(definition[1]), { rawTarget: definition[2], line: index + 1 });
      continue;
    }

    links.push(...extractInlineMarkdownLinks(line, index + 1));
  }

  // 後方で定義されるreference-style linkも解決するため、usageをもう一度走査する。
  for (const line of lines) {
    if (/^ {0,3}\[[^\]]+\]:/.test(line)) continue;
    const visibleLine = maskInlineCode(line);
    for (const match of visibleLine.matchAll(/!?\[([^\]]+)\](?:\[([^\]]*)\])?/g)) {
      if (visibleLine[match.index + match[0].length] === "(") continue;
      const referenceLabel = match[2] === undefined || match[2] === "" ? match[1] : match[2];
      const normalizedLabel = normalizeReferenceLabel(referenceLabel);
      if (definitions.has(normalizedLabel)) usedDefinitions.add(normalizedLabel);
    }
  }

  for (const label of usedDefinitions) {
    const definition = definitions.get(label);
    if (definition) links.push(definition);
  }

  return links;
};

const githubSlug = (heading: string) =>
  heading
    .replace(/<[^>]*>/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\p{M}\p{Extended_Pictographic}\s_-]/gu, "")
    .replace(/\s+/g, "-");

export const extractHeadingAnchors = (source: string) => {
  const anchors = new Set<string>();
  const generatedSlugs = new Set<string>();
  const lines = splitLinesOutsideFences(source);

  const addHeading = (heading: string) => {
    const baseSlug = githubSlug(heading);
    if (!baseSlug) return;

    let suffix = 0;
    let slug = baseSlug;
    while (generatedSlugs.has(slug)) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }
    generatedSlugs.add(slug);
    anchors.add(slug);
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const atxHeading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/);

    if (atxHeading) {
      addHeading(atxHeading[1]);
    } else if (index > 0 && /^ {0,3}(?:=+|-+)\s*$/.test(line) && lines[index - 1].trim()) {
      addHeading(lines[index - 1].trim());
    }

    for (const anchor of line.matchAll(/<(?:a|span)\s+(?:id|name)=["']([^"']+)["']/gi)) {
      anchors.add(anchor[1]);
    }
  }

  return anchors;
};

const pathExists = (workspace: DocsWorkspace, filePath: string) =>
  Object.hasOwn(workspace.documents, filePath) || workspace.existingPaths?.has(filePath) === true;

export const findMarkdownLinkIssues = (workspace: DocsWorkspace): DocIssue[] => {
  const issues: DocIssue[] = [];
  const anchorCache = new Map<string, Set<string>>();

  for (const [sourcePath, source] of Object.entries(workspace.documents)) {
    for (const link of extractMarkdownLinks(source)) {
      const target = resolveMarkdownTarget(sourcePath, link.rawTarget);
      if (!target) continue;

      if (!pathExists(workspace, target.path)) {
        issues.push({
          code: "broken-markdown-link",
          filePath: sourcePath,
          line: link.line,
          message: `リンク先が存在しません: ${link.rawTarget}`,
        });
        continue;
      }

      if (!target.fragment || !Object.hasOwn(workspace.documents, target.path)) continue;

      let anchors = anchorCache.get(target.path);
      if (!anchors) {
        anchors = extractHeadingAnchors(workspace.documents[target.path]);
        anchorCache.set(target.path, anchors);
      }

      if (!anchors.has(target.fragment)) {
        issues.push({
          code: "missing-heading-anchor",
          filePath: sourcePath,
          line: link.line,
          message: `見出しanchorが存在しません: ${link.rawTarget}`,
        });
      }
    }
  }

  return issues;
};

const isCurrentDoc = (filePath: string) =>
  filePath === "doc/INDEX.md" ||
  filePath === "doc/ARCHITECTURE.md" ||
  CURRENT_DOC_PREFIXES.some((prefix) => filePath.startsWith(prefix));

const normalizeRepoPathCandidate = (rawValue: string) => {
  let value = rawValue.trim();

  if (!value || /\s/.test(value)) return undefined;
  if (/[*?{}[\]<>$]/.test(value) || value.includes("...")) return undefined;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value) || value.startsWith("/")) return undefined;

  value = value.replace(/^\.\//, "");

  const fileWithSymbol = value.match(
    /^(.+\.(?:[cm]?[jt]sx?|mdx?|jsonc?|ya?ml|css|html|txt|toml))(?::(?:\d+|[A-Za-z_$][\w$.-]*))$/,
  );
  if (fileWithSymbol) {
    value = fileWithSymbol[1];
  } else if (value.includes(":")) {
    return undefined;
  }

  const isRepoPath = REPO_ROOT_FILES.has(value) || REPO_PATH_PREFIXES.some((prefix) => value.startsWith(prefix));
  if (!isRepoPath) return undefined;

  const normalized = path.posix.normalize(value).replace(/\/$/, "");
  if (normalized === ".." || normalized.startsWith("../")) return undefined;
  return normalized;
};

export const extractRepoPathReferences = (source: string): RepoPathReference[] => {
  const references: RepoPathReference[] = [];
  const lines = splitLinesOutsideFences(source);

  for (const [index, line] of lines.entries()) {
    const inlineCodePattern = /(?<!`)`([^`\n]+)`(?!`)/g;
    const candidates = [...line.matchAll(inlineCodePattern)]
      .map((match) => ({
        path: normalizeRepoPathCandidate(match[1]),
        start: match.index,
        end: match.index + match[0].length,
      }))
      .filter((candidate): candidate is { path: string; start: number; end: number } => candidate.path !== undefined);

    for (const [candidateIndex, candidate] of candidates.entries()) {
      const sentenceEnd = line.indexOf("。", candidate.end);
      let contextEnd = sentenceEnd === -1 ? line.length : sentenceEnd;
      const nextCandidate = candidates[candidateIndex + 1];

      if (nextCandidate) {
        const separator = line.slice(candidate.end, nextCandidate.start);
        if (!/^[\s、，・/]+$/.test(separator)) contextEnd = Math.min(contextEnd, nextCandidate.start);
      }

      const ignoreDirective = new RegExp(
        `docs-check:ignore-path\\s+${candidate.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|-->|$)`,
      );
      const context = line.slice(candidate.end, contextEnd);
      const isExplicitlyIgnored = ignoreDirective.test(line);
      const isNegatedCandidate = /(?:存在しない|作らない|追加しない|作成しない)/.test(context);
      if (isExplicitlyIgnored || isNegatedCandidate) continue;

      references.push({ path: candidate.path, line: index + 1 });
    }
  }

  return references;
};

export const findCurrentDocPathIssues = (workspace: DocsWorkspace): DocIssue[] => {
  const issues: DocIssue[] = [];

  for (const [filePath, source] of Object.entries(workspace.documents)) {
    if (!isCurrentDoc(filePath)) continue;

    const references = extractRepoPathReferences(source);
    for (const reference of references) {
      if (pathExists(workspace, reference.path)) continue;
      issues.push({
        code: "missing-repo-path",
        filePath,
        line: reference.line,
        message: `backtick内のrepo相対pathが存在しません: ${reference.path}`,
      });
    }
  }

  return issues;
};

export const extractConvexReferences = (source: string): ConvexReference[] => {
  const references: ConvexReference[] = [];

  for (const [index, line] of splitLinesOutsideFences(source).entries()) {
    for (const codeSpan of line.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
      const value = codeSpan[1];

      for (const match of value.matchAll(
        /(?:^|[\s、，(])((?:api|internal)(?:\.[A-Za-z_$][\w$]*){3,})(?=$|[\s、，/),。])/g,
      )) {
        references.push({ kind: "dotted", reference: match[1], line: index + 1 });
      }

      for (const match of value.matchAll(
        /(?:^|[\s、，(])([A-Za-z_$][\w$-]*(?:\/[A-Za-z_$][\w$-]*)+:[A-Za-z_$][\w$]*)(?=$|[\s、，/),。])/g,
      )) {
        references.push({ kind: "colon", reference: match[1], line: index + 1 });
      }
    }
  }

  return references;
};

const HTTP_ROUTE_REFERENCE_PATTERN = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD) (\/[^\s?#]*)$/;
const CRON_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;
const MIGRATION_NAME_PATTERN = /^m\d{3}(?:_[a-z0-9_]+)?$/;

const hasCronContext = (line: string, start: number, end: number) => {
  const before = line.slice(0, start);
  const after = line.slice(end);
  return /cron(?:名)?\s*$/i.test(before) || /^\s*cron(?:名)?(?=$|[\s）)、，がはをので])/i.test(after);
};

export const extractConvexOperationalReferences = (source: string): ConvexOperationalReference[] => {
  const references: ConvexOperationalReference[] = [];

  for (const [index, line] of splitLinesOutsideFences(source).entries()) {
    for (const codeSpan of line.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
      const value = codeSpan[1].trim();
      const start = codeSpan.index ?? 0;
      const end = start + codeSpan[0].length;

      if (HTTP_ROUTE_REFERENCE_PATTERN.test(value)) {
        references.push({ kind: "http-route", reference: value, line: index + 1 });
      } else if (MIGRATION_NAME_PATTERN.test(value)) {
        references.push({ kind: "migration", reference: value, line: index + 1 });
      } else if (CRON_NAME_PATTERN.test(value) && hasCronContext(line, start, end)) {
        references.push({ kind: "cron", reference: value, line: index + 1 });
      }
    }
  }

  return references;
};

export const findConvexReferenceIssues = (workspace: DocsWorkspace): DocIssue[] => {
  if (!workspace.convexReferences) return [];

  const issues: DocIssue[] = [];
  for (const [filePath, source] of Object.entries(workspace.documents)) {
    if (!isCurrentDoc(filePath)) continue;

    for (const reference of extractConvexReferences(source)) {
      const validReferences =
        reference.kind === "dotted" ? workspace.convexReferences.dotted : workspace.convexReferences.colon;
      if (validReferences.has(reference.reference)) continue;

      issues.push({
        code: reference.kind === "dotted" ? "missing-convex-api-reference" : "missing-convex-colon-reference",
        filePath,
        line: reference.line,
        message:
          reference.kind === "dotted"
            ? `完全修飾されたConvex APIが存在しません: ${reference.reference}`
            : `Convex moduleのexportが存在しません: ${reference.reference}`,
      });
    }
  }

  return issues;
};

export const findConvexOperationalReferenceIssues = (workspace: DocsWorkspace): DocIssue[] => {
  if (!workspace.convexOperationalReferences) return [];

  const issues: DocIssue[] = [];
  for (const [filePath, source] of Object.entries(workspace.documents)) {
    if (!isCurrentDoc(filePath)) continue;

    for (const reference of extractConvexOperationalReferences(source)) {
      const validReferences =
        reference.kind === "http-route"
          ? workspace.convexOperationalReferences.httpRoutes
          : reference.kind === "cron"
            ? workspace.convexOperationalReferences.cronNames
            : workspace.convexOperationalReferences.migrationNames;
      if (validReferences.has(reference.reference)) continue;

      const issue =
        reference.kind === "http-route"
          ? {
              code: "missing-convex-http-route-reference" as const,
              message: `Convex HTTP routeが存在しません: ${reference.reference}`,
            }
          : reference.kind === "cron"
            ? {
                code: "missing-convex-cron-reference" as const,
                message: `Convex cronが存在しません: ${reference.reference}`,
              }
            : {
                code: "missing-convex-migration-reference" as const,
                message: `登録済みConvex migrationが存在しません: ${reference.reference}`,
              };

      issues.push({ ...issue, filePath, line: reference.line });
    }
  }

  return issues;
};

const getMarkdownGraph = (documents: Readonly<Record<string, string>>) => {
  const graph = new Map<string, Set<string>>();

  for (const [sourcePath, source] of Object.entries(documents)) {
    const targets = new Set<string>();

    for (const link of extractMarkdownLinks(source)) {
      const target = resolveMarkdownTarget(sourcePath, link.rawTarget);
      if (target && Object.hasOwn(documents, target.path) && target.path.endsWith(".md")) {
        targets.add(target.path);
      }
    }

    graph.set(sourcePath, targets);
  }

  return graph;
};

export const findReachabilityIssues = (documents: Readonly<Record<string, string>>): DocIssue[] => {
  const rootIndex = "doc/INDEX.md";
  if (!Object.hasOwn(documents, rootIndex)) {
    return [
      {
        code: "unreachable-current-doc",
        filePath: rootIndex,
        line: 1,
        message: "ドキュメントのルートINDEXが存在しません",
      },
    ];
  }

  const graph = getMarkdownGraph(documents);
  const distances = new Map<string, number>([[rootIndex, 0]]);
  const queue = [rootIndex];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const currentDistance = distances.get(current) ?? 0;
    if (currentDistance >= 2) continue;

    for (const target of graph.get(current) ?? []) {
      if (distances.has(target)) continue;
      distances.set(target, currentDistance + 1);
      queue.push(target);
    }
  }

  return Object.keys(documents)
    .filter(
      (filePath) =>
        filePath.startsWith("doc/") &&
        filePath.endsWith(".md") &&
        (!filePath.startsWith("doc/archive/") || filePath === "doc/archive/INDEX.md"),
    )
    .filter((filePath) => !distances.has(filePath))
    .map((filePath) => ({
      code: "unreachable-current-doc" as const,
      filePath,
      line: 1,
      message: "doc/INDEX.mdから2遷移以内で到達できません",
    }));
};

const getPlanIndexEntries = (source: string) => {
  const entries = new Map<
    string,
    Array<{ category: PlanCategory; line: number; status: string; nextCondition: string }>
  >();
  const foundCategories = new Set<PlanCategory>();
  let category: PlanCategory | undefined;

  for (const [index, line] of splitLinesOutsideFences(source).entries()) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      category = PLAN_CATEGORIES.find((candidate) => candidate === h2[1]);
      if (category) foundCategories.add(category);
      continue;
    }

    if (!category) continue;
    const tableCells = line
      .match(/^\|(.*)\|\s*$/)?.[1]
      .split("|")
      .map((cell) => cell.trim());
    const firstCell = tableCells?.[0];
    if (!firstCell || /^[-: ]+$/.test(firstCell) || firstCell === "計画") continue;

    for (const link of extractMarkdownLinks(firstCell)) {
      const target = resolveMarkdownTarget("doc/plans/INDEX.md", link.rawTarget);
      if (!target || !/^doc\/plans\/[^/]+\.md$/.test(target.path) || target.path.endsWith("/INDEX.md")) continue;
      const current = entries.get(target.path) ?? [];
      current.push({
        category,
        line: index + 1,
        status: tableCells?.[1] ?? "",
        nextCondition: tableCells?.[2] ?? "",
      });
      entries.set(target.path, current);
    }
  }

  return { entries, foundCategories };
};

export const findPlanIndexIssues = (documents: Readonly<Record<string, string>>): DocIssue[] => {
  const indexPath = "doc/plans/INDEX.md";
  const indexSource = documents[indexPath];
  const planPaths = Object.keys(documents)
    .filter((filePath) => /^doc\/plans\/[^/]+\.md$/.test(filePath) && filePath !== indexPath)
    .sort();

  if (indexSource === undefined) {
    return planPaths.map((planPath) => ({
      code: "missing-plan-index-entry" as const,
      filePath: planPath,
      line: 1,
      message: "doc/plans/INDEX.mdが存在しません",
    }));
  }

  const { entries, foundCategories } = getPlanIndexEntries(indexSource);
  const issues: DocIssue[] = [];

  for (const category of PLAN_CATEGORIES) {
    if (foundCategories.has(category)) continue;
    issues.push({
      code: "missing-plan-category",
      filePath: indexPath,
      line: 1,
      message: `${category}セクションがありません`,
    });
  }

  for (const planPath of planPaths) {
    const planEntries = entries.get(planPath) ?? [];

    if (planEntries.length === 0) {
      issues.push({
        code: "missing-plan-index-entry",
        filePath: planPath,
        line: 1,
        message: "Plans INDEXの分類表に掲載されていません",
      });
    } else if (planEntries.length > 1) {
      issues.push({
        code: "duplicate-plan-index-entry",
        filePath: indexPath,
        line: planEntries[1].line,
        message: `${planPath}が分類表へ${planEntries.length}回掲載されています`,
      });
    }
  }

  for (const [planPath, planEntries] of entries) {
    for (const entry of planEntries) {
      if (entry.category !== "Active") continue;

      if (!entry.status || /^[-―—–]+$/.test(entry.status)) {
        issues.push({
          code: "missing-active-plan-status",
          filePath: indexPath,
          line: entry.line,
          message: `${planPath}のActive状態がありません`,
        });
      }

      if (!entry.nextCondition || /^[-―—–]+$/.test(entry.nextCondition)) {
        issues.push({
          code: "missing-active-plan-condition",
          filePath: indexPath,
          line: entry.line,
          message: `${planPath}の未完了条件がありません`,
        });
      }
    }
  }

  return issues;
};

const getArchiveReason = (source: string) =>
  splitLinesOutsideFences(source)
    .map((line, index) => ({ match: line.match(/^>\s*理由:\s*`?([^`\s]+)`?\s*$/), line: index + 1 }))
    .find(({ match }) => match);

const getArchiveSuccessor = (source: string) =>
  splitLinesOutsideFences(source)
    .map((line, index) => ({ match: line.match(/^>\s*後継:\s*(.+?)\s*$/), line: index + 1 }))
    .find(({ match }) => match);

const isValidArchiveSuccessor = (
  documents: Readonly<Record<string, string>>,
  archivePath: string,
  successor: RegExpMatchArray,
) => {
  const content = successor[1].trim();
  const noSuccessor = content.match(/^なし(?:（([^）]+)）|\(([^)]+)\))$/);
  if ((noSuccessor?.[1] ?? noSuccessor?.[2])?.trim()) return true;

  return extractMarkdownLinks(content).some((link) => {
    const target = resolveMarkdownTarget(archivePath, link.rawTarget);
    return target !== undefined && isCurrentDoc(target.path) && Object.hasOwn(documents, target.path);
  });
};

export const findArchiveIssues = (documents: Readonly<Record<string, string>>): DocIssue[] => {
  const indexPath = "doc/archive/INDEX.md";
  const indexSource = documents[indexPath];
  const archivePaths = Object.keys(documents)
    .filter((filePath) => filePath.startsWith("doc/archive/") && filePath.endsWith(".md") && filePath !== indexPath)
    .sort();
  const indexedPaths = new Set<string>();
  const issues: DocIssue[] = [];

  if (indexSource !== undefined) {
    for (const link of extractMarkdownLinks(indexSource)) {
      const target = resolveMarkdownTarget(indexPath, link.rawTarget);
      if (target?.path.startsWith("doc/archive/") && target.path !== indexPath) indexedPaths.add(target.path);
    }
  }

  for (const archivePath of archivePaths) {
    const source = documents[archivePath];

    if (!indexedPaths.has(archivePath)) {
      issues.push({
        code: "missing-archive-index-entry",
        filePath: archivePath,
        line: 1,
        message: "Archive INDEXに掲載されていません",
      });
    }

    const reason = getArchiveReason(source);
    if (!reason?.match) {
      issues.push({
        code: "missing-archive-reason",
        filePath: archivePath,
        line: 1,
        message: "Archive理由がありません",
      });
    } else if (!ARCHIVE_REASONS.has(reason.match[1])) {
      issues.push({
        code: "invalid-archive-reason",
        filePath: archivePath,
        line: reason.line,
        message: `Archive理由が定義済みの値ではありません: ${reason.match[1]}`,
      });
    }

    const successor = getArchiveSuccessor(source);
    if (!successor?.match) {
      issues.push({
        code: "missing-archive-successor",
        filePath: archivePath,
        line: 1,
        message: "後継文書または後継なしの案内がありません",
      });
    } else if (!isValidArchiveSuccessor(documents, archivePath, successor.match)) {
      issues.push({
        code: "invalid-archive-successor",
        filePath: archivePath,
        line: successor.line,
        message: "後継は実在する現行文書へのリンク、または理由付きの後継なしで指定してください",
      });
    }
  }

  return issues;
};

const FULL_REGRESSION_CONTRACTS_PATH = "doc/specs/full-regression-contracts.md";
const PUBLIC_CONVEX_INVENTORY_HEADING = "## Public Convex surface inventory";

const formatPublicConvexSurfaceEntry = (entry: string) => {
  const separatorIndex = entry.lastIndexOf("#");
  if (separatorIndex < 0) return entry;
  return `${entry.slice(0, separatorIndex)}.${entry.slice(separatorIndex + 1)}`;
};

export const findPublicConvexInventoryIssues = (
  workspace: Pick<DocsWorkspace, "documents" | "publicConvexSurface">,
): DocIssue[] => {
  const source = workspace.documents[FULL_REGRESSION_CONTRACTS_PATH];
  const publicConvexSurface = workspace.publicConvexSurface;
  if (source === undefined || publicConvexSurface === undefined) return [];

  const lines = source.split("\n");
  const headingIndex = lines.findIndex((line) => line.trim() === PUBLIC_CONVEX_INVENTORY_HEADING);
  const sectionStart = headingIndex >= 0 ? headingIndex + 1 : 0;
  const nextHeadingOffset = lines.slice(sectionStart).findIndex((line) => line.startsWith("## "));
  const sectionEnd = nextHeadingOffset >= 0 ? sectionStart + nextHeadingOffset : lines.length;
  const documentedEntries = new Set<string>();
  const documentedEntryLines = new Map<string, number>();
  let statedCount: number | undefined;
  let countLine = Math.max(headingIndex + 1, 1);

  for (let index = sectionStart; index < sectionEnd; index += 1) {
    const line = lines[index];
    const countMatch = line.match(/public query、mutation、actionは(\d+)個/);
    if (countMatch) {
      statedCount = Number(countMatch[1]);
      countLine = index + 1;
    }

    if (!line.trimStart().startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 2) continue;
    const moduleMatch = cells[0].match(/^`([^`]+)`$/);
    if (!moduleMatch) continue;

    for (const exportMatch of cells[1].matchAll(/`([^`]+)`/g)) {
      const entry = `${moduleMatch[1]}#${exportMatch[1]}`;
      documentedEntries.add(entry);
      documentedEntryLines.set(entry, index + 1);
    }
  }

  const issues: DocIssue[] = [];
  const missingEntries = [...publicConvexSurface].filter((entry) => !documentedEntries.has(entry)).sort();
  const staleEntries = [...documentedEntries].filter((entry) => !publicConvexSurface.has(entry)).sort();

  for (const entry of missingEntries) {
    issues.push({
      code: "missing-public-convex-inventory-export",
      filePath: FULL_REGRESSION_CONTRACTS_PATH,
      line: Math.max(headingIndex + 1, 1),
      message: `Public Convex surface inventoryに公開exportがありません: ${formatPublicConvexSurfaceEntry(entry)}`,
    });
  }

  for (const entry of staleEntries) {
    issues.push({
      code: "stale-public-convex-inventory-export",
      filePath: FULL_REGRESSION_CONTRACTS_PATH,
      line: documentedEntryLines.get(entry) ?? Math.max(headingIndex + 1, 1),
      message: `Public Convex surface inventoryに存在しない公開exportがあります: ${formatPublicConvexSurfaceEntry(entry)}`,
    });
  }

  if (statedCount !== publicConvexSurface.size) {
    issues.push({
      code: "incorrect-public-convex-inventory-count",
      filePath: FULL_REGRESSION_CONTRACTS_PATH,
      line: countLine,
      message:
        statedCount === undefined
          ? `Public Convex surface inventoryの件数がありません（実際は${publicConvexSurface.size}個）`
          : `Public Convex surface inventoryの件数が一致しません: 文書=${statedCount}、実際=${publicConvexSurface.size}`,
    });
  }

  return issues;
};

const sortIssues = (issues: DocIssue[]) =>
  issues.sort(
    (a, b) =>
      a.filePath.localeCompare(b.filePath) ||
      a.line - b.line ||
      a.code.localeCompare(b.code) ||
      a.message.localeCompare(b.message),
  );

export const checkDocs = (workspace: DocsWorkspace) =>
  sortIssues([
    ...findMarkdownLinkIssues(workspace),
    ...findCurrentDocPathIssues(workspace),
    ...findConvexReferenceIssues(workspace),
    ...findConvexOperationalReferenceIssues(workspace),
    ...findPublicConvexInventoryIssues(workspace),
    ...findReachabilityIssues(workspace.documents),
    ...findPlanIndexIssues(workspace.documents),
    ...findArchiveIssues(workspace.documents),
  ]);

const collectMarkdownFiles = async (rootDir: string, relativeDir: string): Promise<string[]> => {
  const entries = await readdir(path.join(rootDir, relativeDir), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = normalizePath(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(rootDir, relativePath)));
    } else if (entry.isFile() && relativePath.endsWith(".md")) {
      files.push(relativePath);
    }
  }

  return files.sort();
};

const isExistingRepoPath = async (rootDir: string, relativePath: string) => {
  const absoluteRoot = path.resolve(rootDir);
  const absolutePath = path.resolve(rootDir, relativePath);
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) return false;

  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
};

const collectPathsToCheck = (documents: Readonly<Record<string, string>>) => {
  const paths = new Set(Object.keys(documents));

  for (const [filePath, source] of Object.entries(documents)) {
    for (const link of extractMarkdownLinks(source)) {
      const target = resolveMarkdownTarget(filePath, link.rawTarget);
      if (target) paths.add(target.path);
    }

    if (isCurrentDoc(filePath)) {
      const references = extractRepoPathReferences(source);
      for (const reference of references) paths.add(reference.path);
    }
  }

  return paths;
};

type ConvexApiTypes = {
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

const loadConvexApiTypes = (rootDir: string): ConvexApiTypes => {
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

const collectPublicConvexSurface = (apiTypes: ConvexApiTypes) => {
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

const buildConvexReferenceRegistry = async (
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

export const runDocsCheck = async (rootDir = process.cwd()) => {
  const markdownFiles = ["README.md", ...(await collectMarkdownFiles(rootDir, "doc"))];
  const documents: Record<string, string> = {};

  for (const filePath of markdownFiles) {
    documents[filePath] = await readFile(path.join(rootDir, filePath), "utf8");
  }

  const existingPaths = new Set<string>();
  for (const filePath of collectPathsToCheck(documents)) {
    if (await isExistingRepoPath(rootDir, filePath)) existingPaths.add(filePath);
  }
  const apiTypes = loadConvexApiTypes(rootDir);
  const convexReferences = await buildConvexReferenceRegistry(rootDir, documents, apiTypes);
  const convexOperationalReferences = await buildConvexOperationalReferenceRegistry(rootDir);
  const publicConvexSurface = collectPublicConvexSurface(apiTypes);

  return {
    checkedMarkdownFiles: markdownFiles.length,
    issues: checkDocs({
      documents,
      existingPaths,
      convexReferences,
      convexOperationalReferences,
      publicConvexSurface,
    }),
  };
};

const main = async () => {
  const result = await runDocsCheck();

  if (result.issues.length === 0) {
    console.log(`Documentation check passed (${result.checkedMarkdownFiles} Markdown files: README.md and doc/).`);
    return;
  }

  console.error(
    `Documentation check found ${result.issues.length} issue(s) in ${result.checkedMarkdownFiles} Markdown files (README.md and doc/):`,
  );
  for (const issue of result.issues) {
    console.error(`${issue.filePath}:${issue.line} [${issue.code}] ${issue.message}`);
  }
  process.exitCode = 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
