import {
  extractConvexOperationalReferences,
  extractConvexReferences,
  extractHeadingAnchors,
  extractMarkdownLinks,
  extractRepoPathReferences,
  isCurrentDoc,
  pathExists,
  resolveMarkdownTarget,
  splitLinesOutsideFences,
} from "./markdown";
import type { DocIssue, DocsWorkspace } from "./types";

const PLAN_CATEGORIES = ["Proposed", "Active", "History"] as const;
const ARCHIVE_REASONS = new Set(["superseded", "abandoned", "rejected", "point-in-time-audit", "removed-feature"]);

type PlanCategory = (typeof PLAN_CATEGORIES)[number];

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
