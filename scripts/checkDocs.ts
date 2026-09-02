#!/usr/bin/env tsx

import process from "node:process";
import { fileURLToPath } from "node:url";
import { runDocsCheck } from "./checkDocs/workspace";

export {
  buildConvexOperationalReferenceRegistry,
  buildConvexOperationalReferenceRegistryFromSources,
} from "./checkDocs/convexRegistry";
export {
  checkDocs,
  findArchiveIssues,
  findConvexOperationalReferenceIssues,
  findConvexReferenceIssues,
  findCurrentDocPathIssues,
  findMarkdownLinkIssues,
  findPlanIndexIssues,
  findPublicConvexInventoryIssues,
  findReachabilityIssues,
} from "./checkDocs/documentChecks";
export {
  extractConvexOperationalReferences,
  extractConvexReferences,
  extractHeadingAnchors,
  extractMarkdownLinks,
  extractRepoPathReferences,
} from "./checkDocs/markdown";
export type {
  ConvexOperationalReference,
  ConvexOperationalReferenceRegistry,
  ConvexReference,
  ConvexReferenceRegistry,
  DocIssue,
  DocIssueCode,
  DocsWorkspace,
  MarkdownLink,
  RepoPathReference,
} from "./checkDocs/types";

export { runDocsCheck };

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
