const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const fixSentenceBreaks = process.argv.includes("--fix-sentence-breaks");
const checkSentenceBreaks = process.argv.includes("--check-sentence-breaks");
const roots = process.argv
  .slice(2)
  .filter((arg) => arg !== "--fix-sentence-breaks" && arg !== "--check-sentence-breaks");
if (roots.length === 0) {
  console.error("Usage: node .codex/audit-user-visible-copy.cjs <path> [...]");
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

function hasJapanese(text) {
  return /[ぁ-んァ-ヶ一-龠々ー]/u.test(text);
}

function normalize(text) {
  return text.replace(/\r/g, "").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

function isModuleSpecifier(node) {
  if (!node.parent) return false;
  return (
    (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) &&
    node.parent.moduleSpecifier === node
  );
}

function nodeText(node, sourceFile) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isJsxText(node)) return node.getText(sourceFile);
  if (ts.isTemplateExpression(node)) return node.getText(sourceFile).slice(1, -1);
  return null;
}

const closingMarks = new Set(["」", "』", "）", "】", "〕", "〉", "》", "”", "’"]);

function addRuntimeSentenceBreaks(text) {
  let result = "";
  let cursor = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "。") continue;

    let boundary = index + 1;
    while (boundary < text.length && closingMarks.has(text[boundary])) boundary += 1;
    let next = boundary;
    while (next < text.length && (text[next] === " " || text[next] === "\t")) next += 1;

    if (next >= text.length || text[next] === "\n" || text[next] === "\r") continue;

    result += text.slice(cursor, boundary) + "\n";
    cursor = next;
    index = next - 1;
  }
  return result + text.slice(cursor);
}

function hasSentenceBreakViolation(text) {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "。") continue;

    let boundary = index + 1;
    while (boundary < text.length && closingMarks.has(text[boundary])) boundary += 1;
    let next = boundary;
    while (next < text.length && (text[next] === " " || text[next] === "\t")) next += 1;

    if (next >= text.length || text[next] === "\n" || text[next] === "\r") continue;
    if (
      text.slice(next, next + 2) === "\\n" ||
      text.startsWith("<br", next) ||
      /^<\/(?:p|li|div|td|h[1-6])>/u.test(text.slice(next))
    )
      continue;
    return true;
  }
  return false;
}

function sentenceBreakViolationSnippets(text) {
  const snippets = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "。") continue;

    let boundary = index + 1;
    while (boundary < text.length && closingMarks.has(text[boundary])) boundary += 1;
    let next = boundary;
    while (next < text.length && (text[next] === " " || text[next] === "\t")) next += 1;

    if (next >= text.length || text[next] === "\n" || text[next] === "\r") continue;
    if (
      text.slice(next, next + 2) === "\\n" ||
      text.startsWith("<br", next) ||
      /^<\/(?:p|li|div|td|h[1-6])>/u.test(text.slice(next))
    )
      continue;

    const start = Math.max(0, index - 70);
    const end = Math.min(text.length, next + 120);
    snippets.push(text.slice(start, end));
  }
  return snippets;
}

function addJsxSentenceBreaks(text) {
  let result = "";
  let cursor = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "。") continue;

    let boundary = index + 1;
    while (boundary < text.length && closingMarks.has(text[boundary])) boundary += 1;
    let next = boundary;
    while (next < text.length && /\s/u.test(text[next])) next += 1;
    if (next >= text.length) continue;

    const whitespace = text.slice(boundary, next);
    result += text.slice(cursor, boundary) + "<br />" + whitespace;
    cursor = next;
    index = next - 1;
  }
  return result + text.slice(cursor);
}

function buildSentenceBreakReplacement(node, sourceFile) {
  if (isModuleSpecifier(node)) return null;

  if (ts.isStringLiteral(node)) {
    const revised = addRuntimeSentenceBreaks(node.text);
    if (revised === node.text) return null;
    if (ts.isJsxAttribute(node.parent)) return `{${JSON.stringify(revised)}}`;

    return JSON.stringify(revised);
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    const revised = addRuntimeSentenceBreaks(node.text);
    if (revised === node.text) return null;
    return "`" + revised.replace(/`/g, "\\`") + "`";
  }

  if (ts.isJsxText(node)) {
    const raw = node.getText(sourceFile);
    const revised = addJsxSentenceBreaks(raw);
    return revised === raw ? null : revised;
  }

  return null;
}

const files = [];
for (const root of roots) collectFiles(root, files);
files.sort();

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const kind = /\.[cm]?tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);

  const replacements = [];

  function visit(node) {
    if (fixSentenceBreaks) {
      const replacement = buildSentenceBreakReplacement(node, sourceFile);
      if (replacement !== null) {
        replacements.push({ start: node.getStart(sourceFile), end: node.getEnd(), replacement });
      }
    }

    const text = nodeText(node, sourceFile);
    if (
      !fixSentenceBreaks &&
      text !== null &&
      hasJapanese(text) &&
      !isModuleSpecifier(node) &&
      (!checkSentenceBreaks || hasSentenceBreakViolation(text))
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const parent = node.parent ? ts.SyntaxKind[node.parent.kind] : "";
      const grandparent = node.parent?.parent ? ts.SyntaxKind[node.parent.parent.kind] : "";
      const lineText = sourceFile.text
        .slice(sourceFile.getPositionOfLineAndCharacter(position.line, 0), sourceFile.getLineEndOfPosition(node.getStart(sourceFile)))
        .trim();
      if (checkSentenceBreaks) {
        for (const snippet of sentenceBreakViolationSnippets(text)) {
          process.stdout.write(
            JSON.stringify({
              file,
              line: position.line + 1,
              kind: ts.SyntaxKind[node.kind],
              text: normalize(snippet),
            }) + "\n",
          );
        }
      } else {
        process.stdout.write(
          JSON.stringify({
            file,
            line: position.line + 1,
            column: position.character + 1,
            kind: ts.SyntaxKind[node.kind],
            parent,
            grandparent,
            text: normalize(text),
            sourceLine: normalize(lineText),
          }) + "\n",
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (fixSentenceBreaks && replacements.length > 0) {
    let revisedSource = source;
    for (const edit of replacements.sort((a, b) => b.start - a.start)) {
      revisedSource = revisedSource.slice(0, edit.start) + edit.replacement + revisedSource.slice(edit.end);
    }
    fs.writeFileSync(file, revisedSource);
    process.stdout.write(`${file}\t${replacements.length}\n`);
  }
}
