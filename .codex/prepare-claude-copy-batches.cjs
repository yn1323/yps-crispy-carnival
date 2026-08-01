const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const outputDir = process.argv[2];
if (!outputDir) {
  console.error("Usage: node .codex/prepare-claude-copy-batches.cjs OUTPUT_DIR");
  process.exit(2);
}

const excludedSegments = new Set([
  "node_modules",
  "_generated",
  "_test",
  "_scenario",
  "migrations",
  "devtools",
  "test-content",
]);

function isExcluded(filePath) {
  const segments = filePath.split(path.sep);
  return (
    segments.some((segment) => excludedSegments.has(segment)) ||
    /(?:^|\/)testing(?:\.test)?\.[cm]?[jt]sx?$/.test(filePath) ||
    /\.(?:test|stories)\.[cm]?[jt]sx?$/.test(filePath) ||
    /__snapshots__/.test(filePath)
  );
}

function collectFiles(target, files) {
  const stats = fs.statSync(target);
  if (stats.isFile()) {
    if (/\.[cm]?[jt]sx?$/.test(target) && !isExcluded(target)) files.push(target);
    return;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    if (isExcluded(child)) continue;
    if (entry.isDirectory()) collectFiles(child, files);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(child);
  }
}

function groupFor(filePath) {
  if (filePath.startsWith("convex/notification/")) return "convex-notifications";
  if (filePath.startsWith("convex/organizationBilling/") || filePath.startsWith("convex/organizationStripe/")) {
    return "convex-billing";
  }
  if (
    filePath.startsWith("convex/organization/") ||
    filePath.startsWith("convex/organizationInvitation/") ||
    filePath.startsWith("convex/setup/")
  ) {
    return "convex-organizations";
  }
  if (filePath.startsWith("convex/")) return "convex-staff-shifts-other";

  if (
    filePath.includes("/AuthPage/") ||
    filePath.includes("/AuthenticatedApp/") ||
    filePath.includes("/AccountDeletion/") ||
    filePath.includes("/LineCallback/") ||
    filePath.includes("/ContactForm/") ||
    filePath.includes("/LandingPage/") ||
    filePath.includes("/FeatureSection/") ||
    filePath.includes("/FeatureRequestDialog/") ||
    filePath.startsWith("src/pages/") ||
    filePath.startsWith("src/routes/")
  ) {
    return "frontend-public-auth";
  }
  if (filePath.includes("/Dashboard/")) return "frontend-dashboard";
  if (
    filePath.includes("/OrganizationSettings/") ||
    filePath.includes("/UserDetail/") ||
    filePath.includes("/UserShopDetail/") ||
    filePath.includes("/ShopSwitcher/")
  ) {
    return "frontend-organizations";
  }
  if (
    filePath.includes("/ShiftBoard/") ||
    filePath.includes("/CreateRecruitmentForm/") ||
    filePath.includes("/StaffSubmit/") ||
    filePath.includes("/StaffShiftReissue/") ||
    filePath.includes("/StaffRegistration/") ||
    filePath.includes("/ShopForm/")
  ) {
    return "frontend-shifts-staff";
  }
  if (filePath.includes("/Demo/")) return "frontend-demo";
  return "frontend-shared-other";
}

function hasJapanese(text) {
  return /[ぁ-んァ-ヶ一-龠々ー]/u.test(text);
}

function sanitize(text) {
  return text
    .replace(/\r/g, "")
    .replace(/\\n/g, "\n")
    .replace(/https?:\/\/[^\s"'<>]+/gu, "{{URL}}")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "{{メールアドレス}}")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n[ \t]+/gu, "\n")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

function isProse(text) {
  const plain = text.replace(/\{\{[^}]+\}\}/gu, "値").replace(/<[^>]+>/gu, "").trim();
  if (!hasJapanese(plain)) return false;
  if (/[。！？]/u.test(plain)) return true;
  if (plain.length < 20) return false;
  return /(?:です|ます|ません|ください|できます|できません|しました|なります|ありません|います|しましょう|必要|確認中|受付中|完了|失敗)(?:[」』）】]?|$)/u.test(
    plain,
  );
}

function isModuleSpecifier(node) {
  return (
    node.parent &&
    (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) &&
    node.parent.moduleSpecifier === node
  );
}

function templateText(node) {
  let text = node.head.text;
  for (let index = 0; index < node.templateSpans.length; index += 1) {
    text += `{{値${index + 1}}}` + node.templateSpans[index].literal.text;
  }
  return text;
}

function htmlTextSegments(text) {
  const segments = [];
  for (const match of text.matchAll(/>([^<>]+)</gu)) {
    const value = sanitize(match[1]);
    if (isProse(value)) segments.push(value);
  }
  return segments;
}

function candidateTexts(node, sourceFile) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (isModuleSpecifier(node)) return [];
    return [sanitize(node.text)];
  }
  if (ts.isJsxText(node)) {
    const text = node.getText(sourceFile).replace(/\s+/gu, " ");
    return [sanitize(text)];
  }
  if (ts.isTemplateExpression(node)) {
    const text = templateText(node);
    if (/<(?:html|body|table|p|td|span|a)\b/iu.test(text)) return htmlTextSegments(text);
    return [sanitize(text)];
  }
  return [];
}

const files = [];
collectFiles("src", files);
collectFiles("convex", files);
files.sort();

const groups = new Map();
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const kind = /\.[cm]?tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const groupName = groupFor(file);
  if (!groups.has(groupName)) groups.set(groupName, new Map());
  const group = groups.get(groupName);

  function visit(node) {
    for (const text of candidateTexts(node, sourceFile)) {
      if (!isProse(text)) continue;
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const existing = group.get(text) ?? { text, occurrences: [] };
      existing.occurrences.push({ file, line: position.line + 1, kind: ts.SyntaxKind[node.kind] });
      group.set(text, existing);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

fs.mkdirSync(outputDir, { recursive: true });
const summary = [];
const payloads = new Map();
for (const [groupName, candidates] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const prefix = groupName
    .split("-")
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const items = [...candidates.values()].map((candidate, index) => ({
    id: `${prefix}${String(index + 1).padStart(3, "0")}`,
    ...candidate,
  }));
  const payload = { items: items.map(({ id, text }) => ({ id, text })) };
  payloads.set(groupName, payload);
  fs.writeFileSync(path.join(outputDir, `${groupName}.payload.json`), JSON.stringify(payload, null, 2) + "\n");
  fs.writeFileSync(path.join(outputDir, `${groupName}.map.json`), JSON.stringify({ items }, null, 2) + "\n");
  summary.push({ group: groupName, count: items.length });
}

const reviewSets = {
  "review-frontend-public-auth-demo": ["frontend-public-auth", "frontend-demo"],
  "review-frontend-dashboard-shifts": ["frontend-dashboard", "frontend-shifts-staff"],
  "review-frontend-organizations": ["frontend-organizations"],
  "review-frontend-shared-other": ["frontend-shared-other"],
  "review-convex-organizations": ["convex-organizations"],
  "review-convex-billing-notifications-other": [
    "convex-billing",
    "convex-notifications",
    "convex-staff-shifts-other",
  ],
};

for (const [setName, groupNames] of Object.entries(reviewSets)) {
  const items = groupNames.flatMap((groupName) => payloads.get(groupName)?.items ?? []);
  fs.writeFileSync(path.join(outputDir, `${setName}.payload.json`), JSON.stringify({ items }, null, 2) + "\n");
}

fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
