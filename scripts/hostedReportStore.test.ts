import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createR2ReportStore, R2ConfigurationError, readR2Configuration } from "./hostedReportStore.mjs";

const configuration = {
  REPORT_R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
  REPORT_R2_PUBLIC_BUCKET: "test-reports",
  REPORT_PUBLIC_BASE_URL: "https://pub-test.r2.dev",
  REPORT_R2_ACCESS_KEY_ID: "test-key",
  REPORT_R2_SECRET_ACCESS_KEY: "test-secret",
};

function mockStore(send: ReturnType<typeof vi.fn>) {
  return createR2ReportStore(configuration, { client: { send } as unknown as Pick<S3Client, "send"> });
}

describe("R2接続と全件操作", () => {
  it("欠落・bucket入りendpoint・公開URL混同を値を出さずに拒否する", () => {
    for (const env of [
      { ...configuration, REPORT_R2_ACCESS_KEY_ID: "" },
      { ...configuration, REPORT_R2_ENDPOINT: `${configuration.REPORT_R2_ENDPOINT}/test-reports` },
      { ...configuration, REPORT_R2_ENDPOINT: configuration.REPORT_PUBLIC_BASE_URL },
      { ...configuration, REPORT_PUBLIC_BASE_URL: "https://secret@example.com" },
    ])
      expect(() => readR2Configuration(env)).toThrow(R2ConfigurationError);
  });

  it("全pageを読み込み、ページングが進まない応答は失敗にする", async () => {
    const modified = new Date("2026-09-05T00:00:00Z");
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Contents: [{ Key: "vrt/pr-1/1-1/index.html", Size: 1, LastModified: modified }],
        IsTruncated: true,
        NextContinuationToken: "page2",
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: "vrt/pr-2/1-1/index.html", Size: 2, LastModified: modified }],
        IsTruncated: false,
      });
    expect(await mockStore(send).list("vrt/")).toEqual([
      { key: "vrt/pr-1/1-1/index.html", bytes: 1, lastModified: modified },
      { key: "vrt/pr-2/1-1/index.html", bytes: 2, lastModified: modified },
    ]);
    expect(send.mock.calls[1][0].input.ContinuationToken).toBe("page2");
    await expect(
      mockStore(vi.fn().mockResolvedValue({ IsTruncated: true, NextContinuationToken: "same" })).list("vrt/"),
    ).rejects.toThrow("did not advance");
  });

  it("削除を1000件ずつ処理し、部分失敗を検知する", async () => {
    const keys = Array.from({ length: 1_001 }, (_, index) => `vrt/pr-1/1-1/${index}.png`);
    const send = vi.fn().mockResolvedValue({});
    expect(await mockStore(send).delete(keys)).toBe(1_001);
    expect(send.mock.calls.map(([command]) => command.input.Delete.Objects.length)).toEqual([1_000, 1]);
    await expect(
      mockStore(vi.fn().mockResolvedValue({ Errors: [{ Code: "InternalError" }] })).delete(keys),
    ).rejects.toThrow("partially failed");
    await expect(mockStore(send).delete(["../other"])).rejects.toThrow("Invalid report object path");
  });

  it("アクセス拒否を設定エラーとして通知し、providerの秘密値を含む応答を隠す", async () => {
    const send = vi
      .fn()
      .mockRejectedValue({ name: "AccessDenied", message: "test-secret", $metadata: { httpStatusCode: 403 } });
    const error = await mockStore(send)
      .list("state/")
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(R2ConfigurationError);
    expect(String(error)).not.toContain("test-secret");
    await expect(
      mockStore(vi.fn().mockResolvedValue({ Errors: [{ Code: "AccessDenied" }] })).delete(["vrt/pr-1/1-1/index.html"]),
    ).rejects.toBeInstanceOf(R2ConfigurationError);
  });

  it("公開objectへ保存形式・非キャッシュ・条件付きwriteと転送checksumを付ける", async () => {
    const send = vi.fn().mockResolvedValue({ ETag: '"new-state"' });
    await mockStore(send).put("state/vrt/pr-1.json", Buffer.from("{}"), {
      contentType: "application/json",
      ifMatch: '"old-state"',
    });
    const input = send.mock.calls[0][0].input;
    expect({
      contentType: input.ContentType,
      cacheControl: input.CacheControl,
      ifMatch: input.IfMatch,
      checksum: input.ContentMD5,
    }).toEqual({
      contentType: "application/json",
      cacheControl: "no-store",
      ifMatch: '"old-state"',
      checksum: "mZFLkyvTelC5g8XnyQrpOw==",
    });
  });
});
