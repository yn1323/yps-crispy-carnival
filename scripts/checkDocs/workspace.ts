import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  buildConvexOperationalReferenceRegistry,
  buildConvexReferenceRegistry,
  collectPublicConvexSurface,
  loadConvexApiTypes,
} from "./convexRegistry";
import { checkDocs } from "./documentChecks";
import {
  extractMarkdownLinks,
  extractRepoPathReferences,
  isCurrentDoc,
  normalizePath,
  resolveMarkdownTarget,
} from "./markdown";

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
