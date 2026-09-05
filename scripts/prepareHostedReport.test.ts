import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareHostedReport } from "./prepareHostedReport.mjs";

let directory: string;
let source: string;
let destination: string;
const png = Buffer.from("89504e470d0a1a0a", "hex");
const require = createRequire(import.meta.url);
const suitRequire = createRequire(require.resolve("reg-suit/package.json"));
const coreRequire = createRequire(suitRequire.resolve("reg-suit-core/package.json"));
const generateVrtReport = coreRequire("reg-cli/dist/report.js").default as (options: Record<string, unknown>) => void;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "prepare-report-"));
  source = path.join(directory, "source");
  destination = path.join(directory, "public");
  await mkdir(source);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function put(name: string, data: string | Uint8Array) {
  await mkdir(path.dirname(path.join(source, name)), { recursive: true });
  await writeFile(path.join(source, name), data);
}
async function paths(root: string): Promise<string[]> {
  return (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
}
function vrtHtml(result: { failedItems: string[]; newItems: string[]; deletedItems: string[]; passedItems: string[] }) {
  // Use the installed reg-cli generator so its embedded HTML contract cannot drift from this fixture.
  generateVrtReport({
    ...result,
    actualItems: [...result.failedItems, ...result.newItems, ...result.passedItems],
    expectedItems: [...result.failedItems, ...result.deletedItems, ...result.passedItems],
    diffItems: result.failedItems,
    actualDir: path.join(source, "actual"),
    expectedDir: path.join(source, "expected"),
    diffDir: path.join(source, "diff"),
    report: path.join(source, "index.html"),
    json: path.join(source, "out.json"),
    urlPrefix: "",
  });
}
async function vrt() {
  vrtHtml({
    failedItems: ["changed.png"],
    newItems: ["added.png"],
    deletedItems: ["deleted.png"],
    passedItems: ["unchanged.png"],
  });
  await put("assets/app.js", "void 0;");
  for (const file of [
    "actual/changed.png",
    "expected/changed.png",
    "diff/changed.png",
    "actual/added.png",
    "expected/deleted.png",
    "actual/unchanged.png",
    "expected/unchanged.png",
  ])
    await put(file, png);
}
function reportHtml(report: unknown, extra: Record<string, Uint8Array> = {}) {
  const archive = zipSync({ "report.json": strToU8(JSON.stringify(report)), ...extra });
  return `<html><script id="playwrightReportBase64" type="application/zip">data:application/zip;base64,${Buffer.from(archive).toString("base64")}</script></html>`;
}

describe("公開用レポートの準備", () => {
  it("変更・追加・削除画像と表示資産だけをコピーし、完全版を残す", async () => {
    await vrt();
    const originalPaths = await paths(source);
    const originalResult = await readFile(path.join(source, "out.json"));
    const originalHtml = await readFile(path.join(source, "index.html"), "utf8");

    const result = await prepareHostedReport({ reportType: "vrt", source, destination });

    expect(await paths(destination)).toEqual([
      "actual/added.png",
      "actual/changed.png",
      "assets/app.js",
      "diff/changed.png",
      "expected/changed.png",
      "expected/deleted.png",
      "index.html",
      "out.json",
    ]);
    expect(result.fileCount).toBe(8);
    expect(result.bytes).toBeGreaterThan(0);
    expect(await paths(source)).toEqual(originalPaths);
    expect(await readFile(path.join(source, "out.json"))).toEqual(originalResult);
    expect(await readFile(path.join(destination, "out.json"))).toEqual(originalResult);
    expect(await readFile(path.join(source, "index.html"), "utf8")).toBe(originalHtml);
    const publicHtml = await readFile(path.join(destination, "index.html"), "utf8");
    const originalEmbedded = JSON.parse(originalHtml.match(/window\['__reg__'\] = (\{[^\n]*\});/)?.[1] ?? "null");
    const publicEmbedded = JSON.parse(publicHtml.match(/window\['__reg__'\] = (\{[^\n]*\});/)?.[1] ?? "null");
    expect(originalEmbedded).not.toBeNull();
    expect(publicEmbedded).toEqual({ ...originalEmbedded, passedItems: [], hasPassed: false });
    expect(publicHtml).toContain("変更なし1件の画像は公開を省略。完全版はGitHub ActionsのArtifactから確認");
  });

  it("差分ゼロでもHTMLと結果データを公開する", async () => {
    vrtHtml({ failedItems: [], newItems: [], deletedItems: [], passedItems: ["unchanged.png"] });
    await put("actual/unchanged.png", png);

    await prepareHostedReport({ reportType: "vrt", source, destination });

    expect(await paths(destination)).toEqual(["index.html", "out.json"]);
  });

  it("HTMLと結果の変更なし一覧が異なる場合や未知のHTML形式では公開しない", async () => {
    await vrt();
    const html = await readFile(path.join(source, "index.html"), "utf8");
    await put("index.html", html.replace('"raw":"unchanged.png"', '"raw":"other.png"'));
    await expect(prepareHostedReport({ reportType: "vrt", source, destination })).rejects.toThrow(
      "do not match out.json",
    );
    await put("index.html", "<html><body>unknown report</body></html>");
    await expect(prepareHostedReport({ reportType: "vrt", source, destination })).rejects.toThrow(
      "one embedded result object",
    );
    expect(await readdir(directory)).toEqual(["source"]);
  });

  it("動画attachmentの本体と参照、未参照dataを除外し、画像とtrace表示資産を残す", async () => {
    const screenshot = `data/${"a".repeat(40)}.png`;
    const video = `data/${"b".repeat(40)}.webm`;
    const otherVideo = `data/${"c".repeat(40)}.dat`;
    const original = reportHtml({
      files: [
        {
          results: [
            {
              steps: [{ attachments: [0, 1, 2, 3], steps: [{ attachments: [1] }] }],
              attachments: [
                { name: "screenshot", contentType: "image/png", path: screenshot },
                { name: "video", contentType: "video/webm", path: video },
                { name: "recording", contentType: "video/webm", path: otherVideo },
                { name: "stdout", contentType: "text/plain", body: "passed" },
              ],
            },
          ],
        },
      ],
    });
    await put("index.html", original);
    await put(screenshot, png);
    await put(video, Buffer.from("1a45dfa3", "hex"));
    await put(otherVideo, Buffer.from("1a45dfa3", "hex"));
    await put(`data/${"d".repeat(40)}.png`, png);
    await put("trace/index.html", "<html>trace viewer</html>");

    await prepareHostedReport({ reportType: "playwright", source, destination });

    expect(await paths(destination)).toEqual([screenshot, "index.html", "trace/index.html"]);
    const html = await readFile(path.join(destination, "index.html"), "utf8");
    const encoded = html.match(/base64,([^<]+)/)?.[1];
    expect(encoded).toBeDefined();
    const zip = unzipSync(Buffer.from(encoded ?? "", "base64"));
    expect(JSON.parse(Buffer.from(zip["report.json"]).toString())).toEqual({
      files: [
        {
          results: [
            {
              steps: [{ attachments: [0, 1], steps: [{ attachments: [] }] }],
              attachments: [
                { name: "screenshot", contentType: "image/png", path: screenshot },
                { name: "stdout", contentType: "text/plain", body: "passed" },
              ],
            },
          ],
        },
      ],
    });
    expect(await readFile(path.join(source, "index.html"), "utf8")).toBe(original);
    expect(await readFile(path.join(source, video))).toEqual(Buffer.from("1a45dfa3", "hex"));
  });

  it("選別で消える元データもprivacy検査を通過しなければ公開しない", async () => {
    await vrt();
    await put(
      "actual/unchanged.png",
      Buffer.concat([png, Buffer.from(["sk", "live", "1234567890abcdefghijklmnop"].join("_"))]),
    );

    await expect(prepareHostedReport({ reportType: "vrt", source, destination })).rejects.toThrow(
      "privacy validation failed",
    );
    expect(await readdir(directory)).toEqual(["source"]);
  });

  it.each([".report-meta.json", "state/manifest.json", ".snapshot-meta.json"])(
    "管理用入力%sを公開しない",
    async (name) => {
      await vrt();
      await put(name, "{}");
      await expect(prepareHostedReport({ reportType: "vrt", source, destination })).rejects.toThrow(
        "reserved management metadata",
      );
    },
  );

  it("未使用ファイルであってもsymlinkを拒否する", async () => {
    await vrt();
    await symlink(path.join(source, "actual/unchanged.png"), path.join(source, "link.png"));
    await expect(prepareHostedReport({ reportType: "vrt", source, destination })).rejects.toThrow("symbolic links");
  });

  it("欠落した差分画像を公開成功として扱わない", async () => {
    await vrt();
    await rm(path.join(source, "diff/changed.png"));
    await expect(prepareHostedReport({ reportType: "vrt", source, destination })).rejects.toThrow("missing image");
  });

  it("結果データのpath traversalを拒否する", async () => {
    await vrt();
    await put("out.json", JSON.stringify({ failedItems: ["../outside.png"] }));
    await expect(prepareHostedReport({ reportType: "vrt", source, destination })).rejects.toThrow(
      "unsafe relative path",
    );
  });

  it("コピー先で元データや既存データを上書きしない", async () => {
    await vrt();
    await expect(prepareHostedReport({ reportType: "vrt", source, destination: source })).rejects.toThrow("separate");
    await mkdir(destination);
    await writeFile(path.join(destination, "keep.txt"), "keep");
    await expect(prepareHostedReport({ reportType: "vrt", source, destination })).rejects.toThrow("EEXIST");
    expect(await readFile(path.join(destination, "keep.txt"), "utf8")).toBe("keep");
  });

  it("欠落したPlaywright attachmentを拒否する", async () => {
    await put(
      "index.html",
      reportHtml({ attachments: [{ path: `data/${"a".repeat(40)}.png`, contentType: "image/png" }] }),
    );
    await expect(prepareHostedReport({ reportType: "playwright", source, destination })).rejects.toThrow(
      "missing attachment",
    );
  });

  it("Playwright ZIP内のsymlinkを拒否する", async () => {
    const archive = Buffer.from(zipSync({ "report.json": strToU8("{}") }));
    const central = archive.indexOf(Buffer.from("504b0102", "hex"));
    archive.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
    await put("index.html", `<html>data:application/zip;base64,${archive.toString("base64")}</html>`);
    await expect(prepareHostedReport({ reportType: "playwright", source, destination })).rejects.toThrow("linked");
  });
});
