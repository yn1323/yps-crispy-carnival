import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBaselineArchive, downloadBaseline, extractBaselineArchive } from "./hostedReportBaseline.mjs";

let directory: string;
let source: string;
let archivePath: string;
let destination: string;
const png = Buffer.from("89504e470d0a1a0a", "hex");
const checksumOf = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "baseline-test-"));
  source = path.join(directory, "source");
  archivePath = path.join(directory, "baseline.zip");
  destination = path.join(directory, "extracted");
  await mkdir(source);
  await writeFile(path.join(source, "screen.png"), png);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function downloadFixture(branch: "develop" | "main" = "develop") {
  const metadata = await createBaselineArchive({ source, archivePath });
  const archive = await readFile(archivePath);
  const manifest = {
    schemaVersion: 1,
    sourceRepository: "yn1323/yps-crispy-carnival",
    reportType: "vrt",
    sourceBranch: branch,
    sourceSha: "a".repeat(40),
    pullRequest: null,
    runId: 123,
    runAttempt: 2,
    reportPrefix: `vrt/branches/${branch}/123-2/`,
    baseline: { key: `baselines/${branch}/123-2.zip`, ...metadata },
  };
  return { archive, manifest };
}

describe("VRT比較元archive", () => {
  it("全画像を同じchecksumのZIPへ保存し、検証後に復元する", async () => {
    await mkdir(path.join(source, "mobile"));
    await writeFile(path.join(source, "mobile/second.png"), png);
    const metadata = await createBaselineArchive({ source, archivePath });
    const second = await createBaselineArchive({ source, archivePath: path.join(directory, "second.zip") });

    const extracted = await extractBaselineArchive({ archivePath, destination, ...metadata });

    expect(metadata).toEqual(second);
    expect(metadata.imageCount).toBe(2);
    expect(extracted).toEqual({ imageCount: 2 });
    expect(await readFile(path.join(destination, "screen.png"))).toEqual(png);
    expect(await readFile(path.join(destination, "mobile/second.png"))).toEqual(png);
    expect(await readFile(path.join(source, "screen.png"))).toEqual(png);
  });

  it("空の比較元や画像以外のファイルを拒否する", async () => {
    await rm(path.join(source, "screen.png"));
    await expect(createBaselineArchive({ source, archivePath })).rejects.toThrow("no files");
    await writeFile(path.join(source, "result.json"), "{}");
    await expect(createBaselineArchive({ source, archivePath })).rejects.toThrow("images only");
  });

  it("privacy検査に失敗した画像をarchiveにしない", async () => {
    await writeFile(
      path.join(source, "screen.png"),
      Buffer.concat([png, Buffer.from(["sk", "live", "1234567890abcdefghijklmnop"].join("_"))]),
    );
    await expect(createBaselineArchive({ source, archivePath })).rejects.toThrow("privacy validation failed");
    expect(await readdir(directory)).toEqual(["source"]);
  });

  it("symlinkと元画像内へのarchive書き込みを拒否する", async () => {
    await symlink(path.join(source, "screen.png"), path.join(source, "linked.png"));
    await expect(createBaselineArchive({ source, archivePath })).rejects.toThrow("symbolic links");
    await rm(path.join(source, "linked.png"));
    await expect(createBaselineArchive({ source, archivePath: path.join(source, "nested.zip") })).rejects.toThrow(
      "outside",
    );
  });

  it("checksumや件数不一致を展開前に拒否する", async () => {
    const metadata = await createBaselineArchive({ source, archivePath });
    await expect(
      extractBaselineArchive({ archivePath, destination, ...metadata, checksum: "0".repeat(64) }),
    ).rejects.toThrow("checksum does not match");
    await expect(extractBaselineArchive({ archivePath, destination, ...metadata, imageCount: 2 })).rejects.toThrow(
      "image count",
    );
    expect(await readdir(directory)).toEqual(["baseline.zip", "source"]);
  });

  it.each(["../outside.png", "state/manifest.png"])("archive内の危険なpath %sを拒否する", async (name) => {
    const archive = zipSync({ [name]: png });
    await writeFile(archivePath, archive);
    await expect(
      extractBaselineArchive({ archivePath, destination, checksum: checksumOf(archive), imageCount: 1 }),
    ).rejects.toThrow(/unsafe|reserved/);
    expect(await readdir(directory)).toEqual(["baseline.zip", "source"]);
  });

  it("checksumが一致してもZIP内の破損と過大な展開量を拒否する", async () => {
    const archive = Buffer.from(zipSync({ "screen.png": png }));
    const central = archive.indexOf(Buffer.from("504b0102", "hex"));
    archive.writeUInt32LE(0, central + 16);
    await writeFile(archivePath, archive);
    await expect(
      extractBaselineArchive({ archivePath, destination, checksum: checksumOf(archive), imageCount: 1 }),
    ).rejects.toThrow("corrupt data");
    archive.writeUInt32LE(201 * 1024 * 1024, central + 24);
    await writeFile(archivePath, archive);
    await expect(
      extractBaselineArchive({ archivePath, destination, checksum: checksumOf(archive), imageCount: 1 }),
    ).rejects.toThrow("bounded expanded size");
    await writeFile(archivePath, "corrupt");
    await expect(
      extractBaselineArchive({ archivePath, destination, checksum: checksumOf(Buffer.from("corrupt")), imageCount: 1 }),
    ).rejects.toThrow("ZIP is invalid");
  });
});

describe("公開URLからの比較元取得", () => {
  it.each(["develop", "main"] as const)("%sの確定manifestと対応archiveだけを取得する", async (branch) => {
    const { archive, manifest } = await downloadFixture(branch);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(new Response(archive));

    expect(await downloadBaseline({ baseUrl: "https://pub-example.r2.dev", branch, destination, fetchImpl })).toEqual({
      imageCount: 1,
    });
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      `https://pub-example.r2.dev/state/vrt/branches/${branch}.json`,
      `https://pub-example.r2.dev/baselines/${branch}/123-2.zip`,
    ]);
    expect(fetchImpl.mock.calls.map(([, options]) => options?.redirect)).toEqual(["error", "error"]);
    expect(await readFile(path.join(destination, "screen.png"))).toEqual(png);
  });

  it("429と一時5xxだけを上限付き再試行して回復する", async () => {
    const { archive, manifest } = await downloadFixture();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(new Response(null, { status: 503, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response(archive));

    expect(
      await downloadBaseline({ baseUrl: "https://pub-example.r2.dev", branch: "develop", destination, fetchImpl }),
    ).toEqual({ imageCount: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("上限まで取得できなければ空baselineを作らない", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(null, { status: 503, headers: { "retry-after": "0" } }));
    await expect(
      downloadBaseline({ baseUrl: "https://pub-example.r2.dev", branch: "develop", destination, fetchImpl }),
    ).rejects.toThrow("bounded retries");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(await readdir(directory)).toEqual(["source"]);
  });

  it("通信timeout後に再試行して取得できれば比較元を復元する", async () => {
    const { archive, manifest } = await downloadFixture();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException("request timed out", "TimeoutError"))
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(new Response(archive));
    expect(
      await downloadBaseline({ baseUrl: "https://pub-example.r2.dev", branch: "develop", destination, fetchImpl }),
    ).toEqual({ imageCount: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("公開URLに資格情報やpathを含む設定では接続しない", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      downloadBaseline({ baseUrl: "https://pub-example.r2.dev/bucket", branch: "develop", destination, fetchImpl }),
    ).rejects.toThrow("HTTPS origin");
    expect(fetchImpl).toHaveBeenCalledTimes(0);
  });

  it.each([403, 404])("HTTP %sを再試行せず、baseline欠落を失敗として扱う", async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    await expect(
      downloadBaseline({ baseUrl: "https://pub-example.r2.dev", branch: "develop", destination, fetchImpl }),
    ).rejects.toThrow(`HTTP ${status}`);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(["https://external.example/baseline.zip", "baselines/main/123-2.zip", "baselines/develop/999-2.zip"])(
    "manifestの対象外key %sから取得しない",
    async (key) => {
      const { manifest } = await downloadFixture();
      manifest.baseline.key = key;
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(manifest));
      await expect(
        downloadBaseline({ baseUrl: "https://pub-example.r2.dev", branch: "develop", destination, fetchImpl }),
      ).rejects.toThrow("does not match");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("取得済みarchiveのサイズ不一致を拒否する", async () => {
    const { archive, manifest } = await downloadFixture();
    manifest.baseline.bytes += 1;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(new Response(archive));
    await expect(
      downloadBaseline({ baseUrl: "https://pub-example.r2.dev", branch: "develop", destination, fetchImpl }),
    ).rejects.toThrow("size does not match");
  });
});
