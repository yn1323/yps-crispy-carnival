import path from "node:path";
import type {
  ConvexOperationalReference,
  ConvexReference,
  DocsWorkspace,
  MarkdownLink,
  RepoPathReference,
} from "./types";

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

export type ResolvedMarkdownTarget = {
  path: string;
  fragment?: string;
};

export const normalizePath = (filePath: string) => filePath.split(path.sep).join("/");

export const splitLinesOutsideFences = (source: string) => {
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

export const resolveMarkdownTarget = (sourcePath: string, rawTarget: string): ResolvedMarkdownTarget | undefined => {
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

export const pathExists = (workspace: DocsWorkspace, filePath: string) =>
  Object.hasOwn(workspace.documents, filePath) || workspace.existingPaths?.has(filePath) === true;

export const isCurrentDoc = (filePath: string) =>
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
