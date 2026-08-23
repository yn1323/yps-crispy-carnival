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
