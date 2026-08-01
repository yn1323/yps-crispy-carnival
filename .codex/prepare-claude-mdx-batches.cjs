const fs = require("node:fs");
const path = require("node:path");

const outputDir = process.argv[2];
if (!outputDir) {
  console.error("Usage: node .codex/prepare-claude-mdx-batches.cjs OUTPUT_DIR");
  process.exit(2);
}

const articleRoot = "src/components/features/ArticleSite/content/articles";
const articleFiles = fs
  .readdirSync(articleRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(articleRoot, entry.name, "index.mdx"))
  .filter((file) => fs.existsSync(file))
  .sort();

const collectionFiles = [
  "src/components/features/ArticleSite/content/pages/articles.mdx",
  ...fs
    .readdirSync("src/components/features/ArticleSite/content/categories", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join("src/components/features/ArticleSite/content/categories", entry.name, "index.mdx"))
    .filter((file) => fs.existsSync(file))
    .sort(),
];

const legalFiles = [
  "src/components/features/Terms/content/manager.mdx",
  "src/components/features/Terms/content/staff.mdx",
  "src/components/features/PrivacyPolicy/content/manager.mdx",
  "src/components/features/PrivacyPolicy/content/staff.mdx",
];

function writeBatch(name, files, prefix) {
  const map = [];
  const documents = files.map((file, index) => {
    const id = `${prefix}${String(index + 1).padStart(2, "0")}`;
    map.push({ id, file });
    return `<<<DOCUMENT ${id}>>>\n${fs.readFileSync(file, "utf8").trim()}\n<<<END DOCUMENT ${id}>>>`;
  });
  fs.writeFileSync(path.join(outputDir, `${name}.payload.mdx`), documents.join("\n\n") + "\n");
  fs.writeFileSync(path.join(outputDir, `${name}.map.json`), JSON.stringify({ documents: map }, null, 2) + "\n");
  return { group: name, documents: files.length, bytes: Buffer.byteLength(documents.join("\n\n")) };
}

fs.mkdirSync(outputDir, { recursive: true });
const summary = [];
for (let start = 0; start < articleFiles.length; start += 4) {
  const batchNumber = start / 4 + 1;
  summary.push(writeBatch(`articles-${batchNumber}`, articleFiles.slice(start, start + 4), `A${batchNumber}`));
}
summary.push(writeBatch("article-collections", collectionFiles, "AC"));
summary.push(writeBatch("legal", legalFiles, "L"));

process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
