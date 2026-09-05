import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createExportFixture } from "./fixtures";
import { createShiftPdf } from "./pdf";
import { buildExportSchedule } from "./script";

describe("PDFの実ファイル", () => {
  beforeAll(async () => {
    const font = new Uint8Array(await readFile("public/fonts/shift-export/NotoSansJP-Regular.ttf"));
    const originalFetch = globalThis.fetch;
    let fontRequests = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      if (url !== "/fonts/shift-export/NotoSansJP-Regular.ttf") return originalFetch(url, options);
      if (fontRequests++ === 0) throw new Error("network unavailable");
      return new Response(font, { headers: { "content-type": "font/ttf" } });
    });
  });

  afterAll(() => vi.restoreAllMocks());

  it("ローカルフォントの取得失敗後に同じ出力操作を再試行できる", async () => {
    const fixture = createExportFixture();
    fixture.recruitment.periodEnd = "2026-08-01";
    const schedule = buildExportSchedule(fixture);
    await expect(createShiftPdf(schedule)).rejects.toThrow("network unavailable");
    const blob = await createShiftPdf(schedule);
    expect(blob.type).toBe("application/pdf");
    expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
  });

  it("31日をA4横2ページに配置し、日本語・曜日・全スタッフを各行1回だけ出力する", async () => {
    const schedule = buildExportSchedule(createExportFixture());
    schedule.statusLabel = "確定済み";
    schedule.notificationLabel = "前回の通知処理は送信完了";
    schedule.rows = Array.from({ length: 20 }, (_, index) => ({
      ...schedule.rows[0],
      staffId: `staff-${index}`,
      staffName: `合成スタッフ${String(index + 1).padStart(3, "0")}`,
    }));
    schedule.rows[0] = {
      ...schedule.rows[0],
      cells: schedule.rows[0].cells.map((cell, index) =>
        index === 2 ? { lines: ["○", "長い勤務区分の正式名称"] } : cell,
      ),
    };
    const blob = await createShiftPdf(schedule);
    const document = await getDocument({
      data: new Uint8Array(await blob.arrayBuffer()),
      useSystemFonts: false,
      standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
    }).promise;
    try {
      expect(document.numPages).toBe(2);
      const pages: string[] = [];
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        expect(viewport.width).toBeCloseTo(841.89, 1);
        expect(viewport.height).toBeCloseTo(595.28, 1);
        const content = await page.getTextContent();
        const items = content.items.filter((item) => "str" in item);
        const text = items.map((item) => item.str).join("");
        expect(text).toContain("スタッフ");
        expect(text).toContain("1(土)");
        expect(text).toContain("31(月)");
        expect(text).toContain(`${number} / 2`);
        for (const item of items) {
          expect(item.transform[4]).toBeGreaterThanOrEqual(23);
          expect(item.transform[4] + item.width).toBeLessThanOrEqual(viewport.width - 23);
        }
        pages.push(text);
      }
      expect(pages[0]).toContain("シフトリ駅前店 シフト表");
      expect(pages[0]).toContain("2026/08/01 〜 2026/08/31");
      expect(pages[0]).toContain(schedule.statusLabel);
      expect(pages[0]).toContain(schedule.notificationLabel);
      expect(pages[0]).toContain("○");
      expect(pages[0]).toContain("長い…");
      expect(pages[1]).not.toContain("シフトリ駅前店 シフト表");
      expect(pages.join("").match(/合成スタッフ\d{3}/g)).toEqual(schedule.rows.map((row) => row.staffName));
    } finally {
      await document.loadingTask.destroy();
    }
  });

  it("200人・全員非出勤の日付方式でも途中のスタッフ行を落とさない", async () => {
    const fixture = createExportFixture();
    fixture.recruitment.periodEnd = "2026-08-01";
    fixture.recruitment.submissionPattern = { kind: "dateOnly" };
    fixture.assignments = [];
    fixture.staffs = Array.from({ length: 200 }, (_, index) => ({
      id: `staff-${index}`,
      name: `スタッフ${String(index + 1).padStart(3, "0")}`,
      isRemoved: false,
    }));
    const schedule = buildExportSchedule(fixture);
    const blob = await createShiftPdf(schedule);
    const document = await getDocument({
      data: new Uint8Array(await blob.arrayBuffer()),
      useSystemFonts: false,
      standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
    }).promise;
    try {
      expect(document.numPages).toBe(10);
      const names: string[] = [];
      let absentCells = 0;
      for (let number = 1; number <= document.numPages; number++) {
        const content = await (await document.getPage(number)).getTextContent();
        const texts = content.items.filter((item) => "str" in item).map((item) => item.str);
        names.push(...Array.from(texts.join("").matchAll(/スタッフ\d{3}/g), (match) => match[0]));
        absentCells += texts.filter((text) => text === "-").length;
      }
      expect(names).toEqual(fixture.staffs.map((staff) => staff.name));
      expect(absentCells).toBe(200);
    } finally {
      await document.loadingTask.destroy();
    }
  });
});
