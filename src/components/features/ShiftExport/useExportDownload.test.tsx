// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExportFixture } from "./fixtures";
import { buildExportSchedule } from "./script";
import { useExportDownload } from "./useExportDownload";

const exporters = vi.hoisted(() => ({ pdf: vi.fn(), excel: vi.fn() }));
vi.mock("./pdf", () => ({ createShiftPdf: exporters.pdf }));
vi.mock("./excel", () => ({ createShiftExcel: exporters.excel }));

beforeEach(() => {
  vi.clearAllMocks();
  exporters.pdf.mockResolvedValue(new Blob(["pdf"]));
  exporters.excel.mockResolvedValue(new Blob(["xlsx"]));
  URL.createObjectURL = vi.fn().mockReturnValue("blob:export-file");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("useExportDownload", () => {
  it("生成を直列化し、保存リンクを残し、再生成と終了時にURLを破棄する", async () => {
    const schedule = buildExportSchedule(createExportFixture());
    const { result, unmount } = renderHook(() => useExportDownload(schedule));
    await act(async () => {
      await Promise.all([result.current.generate("pdf"), result.current.generate("xlsx")]);
    });
    expect(exporters.pdf).toHaveBeenCalledExactlyOnceWith(schedule);
    expect(exporters.excel).not.toHaveBeenCalled();
    expect(result.current.download).toMatchObject({ url: "blob:export-file", format: "pdf" });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.generate("xlsx");
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(result.current.download?.fileName).toMatch(/\.xlsx$/);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
  it.each(["unmount", "change"] as const)("生成中の %s 後に完了してもファイルを公開しない", async (action) => {
    let resolve!: (blob: Blob) => void;
    exporters.pdf.mockImplementation(
      () =>
        new Promise<Blob>((done) => {
          resolve = done;
        }),
    );
    const { result, rerender, unmount } = renderHook(({ schedule }) => useExportDownload(schedule), {
      initialProps: { schedule: buildExportSchedule(createExportFixture()) },
    });
    let running!: ReturnType<typeof result.current.generate>;
    await act(async () => {
      running = result.current.generate("pdf");
      await vi.dynamicImportSettled();
    });
    if (action === "unmount") unmount();
    else rerender({ schedule: buildExportSchedule(createExportFixture({ shopName: "変更後" })) });
    await act(async () => {
      resolve(new Blob(["old data"]));
      await running;
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    if (action === "change") expect(result.current.download).toBeNull();
  });
  it("失敗後に再試行でき、例外の内部情報を表示しない", async () => {
    exporters.pdf.mockRejectedValueOnce(new Error("private staff details"));
    const schedule = buildExportSchedule(createExportFixture());
    const { result } = renderHook(() => useExportDownload(schedule));
    await act(async () => {
      await result.current.generate("pdf");
    });
    expect(result.current.error).toBe("ファイルを作成できませんでした。もう一度お試しください。");
    expect(result.current.isGenerating).toBe(false);
    await act(async () => {
      await result.current.generate("pdf");
    });
    expect(result.current.error).toBeNull();
    expect(result.current.download?.format).toBe("pdf");
  });
});
