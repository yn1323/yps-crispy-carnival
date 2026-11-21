import { readFile } from "node:fs/promises";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDailyExportFixture, createExportFixture } from "./fixtures";
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
    schedule.rows = Array.from({ length: 20 }, (_, index) => ({
      ...schedule.rows[0],
      staffId: `staff-${index}`,
      staffName: `合成スタッフ${String(index + 1).padStart(3, "0")}`,
    }));
    schedule.rows[0] = {
      ...schedule.rows[0],
      cells: schedule.rows[0].cells.map((cell, index) =>
        index === 2 ? { lines: ["○", "長い勤務パターンの正式名称"] } : cell,
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
      expect(pages[0]).toContain("2026/08/01~08/31 シフトリ駅前店");
      expect(pages.join("")).not.toMatch(/下書き|確定済み|通知/);
      expect(pages[0]).toContain("○");
      expect(pages[0]).toContain("長い…");
      expect(pages[1]).not.toContain("2026/08/01~08/31 シフトリ駅前店");
      expect(pages.join("").match(/合成スタッフ\d{3}/g)).toEqual(schedule.rows.map((row) => row.staffName));
    } finally {
      await document.loadingTask.destroy();
    }
  });

  it("分割PDFは前半の全ページから後半へ進み、日付・割当・通しページ番号を一致させる", async () => {
    const fixture = createExportFixture();
    fixture.staffs = Array.from({ length: 20 }, (_, index) => ({
      id: `staff-${index}`,
      name: `合成スタッフ${String(index + 1).padStart(3, "0")}`,
      isRemoved: false,
    }));
    fixture.assignments = [
      { staffId: "staff-0", date: "2026-08-16", startTime: "10:00", endTime: "15:00", optionId: null },
      { staffId: "staff-0", date: "2026-08-17", startTime: "18:00", endTime: "23:00", optionId: null },
    ];
    const schedule = buildExportSchedule(fixture, true);
    const blob = await createShiftPdf(schedule);
    const document = await getDocument({
      data: new Uint8Array(await blob.arrayBuffer()),
      useSystemFonts: false,
      standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
    }).promise;
    try {
      expect(document.numPages).toBe(4);
      const pages: string[] = [];
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items = content.items.filter((item) => "str" in item);
        const expectedDates = number <= 2 ? schedule.dates.slice(0, 16) : schedule.dates.slice(16);
        expect(items.filter(({ str }) => /^\d+\([日月火水木金土]\)$/.test(str)).map(({ str }) => str)).toEqual(
          expectedDates.map(({ label }) => label),
        );
        const text = items.map(({ str }) => str).join("");
        expect(text).toContain(`${number} / 4`);
        for (const item of items) {
          expect(item.transform[4]).toBeGreaterThanOrEqual(23);
          expect(item.transform[4] + item.width).toBeLessThanOrEqual(viewport.width - 23);
        }
        pages.push(text);
      }
      expect(pages[0]).toContain("2026/08/01~08/16 シフトリ駅前店");
      expect(pages[2]).toContain("2026/08/17~08/31 シフトリ駅前店");
      expect(pages[0]).toContain("10:0015:00");
      expect(pages[0]).not.toContain("18:0023:00");
      expect(pages[2]).toContain("18:0023:00");
      expect(pages[2]).not.toContain("10:0015:00");
      for (const periodText of [pages.slice(0, 2).join(""), pages.slice(2).join("")]) {
        expect(periodText.match(/合成スタッフ\d{3}/g)).toEqual(fixture.staffs.map(({ name }) => name));
      }
    } finally {
      await document.loadingTask.destroy();
    }
  });

  it("200人・全員非出勤の日付選択でも途中のスタッフ行を落とさない", async () => {
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

  it("連絡事項を出力するとシフト表の後ろに新しいページで一覧を置き、ページ番号を通しにする", async () => {
    const fixture = createExportFixture({
      dateNotes: [{ staffId: "staff-2", date: "2026-08-01", note: "17時以降なら入れます" }],
    });
    const blob = await createShiftPdf(buildExportSchedule(fixture, false, true));
    const document = await getDocument({
      data: new Uint8Array(await blob.arrayBuffer()),
      useSystemFonts: false,
      standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
    }).promise;
    try {
      expect(document.numPages).toBe(2);
      const texts: string[] = [];
      for (let number = 1; number <= document.numPages; number++) {
        const content = await (await document.getPage(number)).getTextContent();
        texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(""));
      }
      expect(texts[0]).not.toContain("17時以降なら入れます");
      expect(texts[0]).toContain("1 / 2");
      expect(texts[1]).toContain("2026/08/01~08/31 シフトリ駅前店 連絡事項");
      expect(texts[1]).toContain("17時以降なら入れます");
      expect(texts[1]).toContain("2 / 2");
    } finally {
      await document.loadingTask.destroy();
    }
  });

  it("日別は勤務のある日を1日1ページのA4横にし、バーの文字と人数を収め、連絡事項を最後に置く", async () => {
    const fixture = createDailyExportFixture({
      dateNotes: [{ staffId: "staff-1", date: "2026-08-01", note: "17時以降なら入れます" }],
    });
    const blob = await createShiftPdf(buildExportSchedule(fixture, false, true, "daily"));
    const document = await getDocument({
      data: new Uint8Array(await blob.arrayBuffer()),
      useSystemFonts: false,
      standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
    }).promise;
    try {
      expect(document.numPages).toBe(3);
      const pages: string[][] = [];
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        expect(viewport.width).toBeCloseTo(841.89, 1);
        expect(viewport.height).toBeCloseTo(595.28, 1);
        const items = (await page.getTextContent()).items.filter((item) => "str" in item);
        for (const item of items) {
          expect(item.transform[4]).toBeGreaterThanOrEqual(23);
          expect(item.transform[4] + item.width).toBeLessThanOrEqual(viewport.width - 23);
          expect(item.transform[5]).toBeGreaterThanOrEqual(23);
          expect(item.transform[5]).toBeLessThanOrEqual(viewport.height - 23);
        }
        pages.push(items.map((item) => item.str).filter((text) => text.trim() !== ""));
      }
      const [first, second, notes] = pages.map((items) => items.join("|"));
      expect(first).toContain("2026/08/01(土) シフトリ駅前店");
      expect(first).toContain("出勤 5人");
      expect(
        pages[0].filter((text) => /^.+ .+$/.test(text) && !text.includes("/") && !text.startsWith("出勤")),
      ).toEqual(["佐藤 一郎", "鈴木 太郎", "高橋 美咲", "田中 花子", "伊藤 健"]);
      expect(pages[0].filter((text) => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(text))).toEqual([
        "09:00-17:00",
        "10:00-15:00",
        "11:00-20:00",
        "17:00-22:00",
        "17:00-22:00",
      ]);
      // バーの中のポジション名（ホール3本、キッチン5本）と、人数の行の見出し（1つずつ）。
      expect(pages[0].filter((text) => text === "ホール")).toHaveLength(4);
      expect(pages[0].filter((text) => text === "キッチン")).toHaveLength(6);
      // 休憩の区間（佐藤の12時台、高橋の16時から30分）には「休」と書く。
      expect(pages[0].filter((text) => text === "休")).toHaveLength(2);
      // 時刻の数字（9〜21）と、人数の数字（ホール5区間、キッチン7区間）。
      expect(pages[0].filter((text) => /^\d{1,2}$/.test(text))).toEqual([
        ...["9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21"],
        ...["1", "2", "1", "0", "1"],
        ...["1", "0", "1", "2", "1", "2", "1"],
      ]);
      expect(first).toContain("1 / 3");
      expect(first).not.toContain("山本 さくら");
      expect(second).toContain("2026/08/03(月) シフトリ駅前店");
      expect(second).toContain("出勤 1人");
      expect(second).toContain("山本 さくら");
      expect(second).toContain("2 / 3");
      expect(notes).toContain("連絡事項");
      expect(notes).toContain("17時以降なら入れます");
      expect(notes).toContain("3 / 3");
    } finally {
      await document.loadingTask.destroy();
    }
  });

  it("日別は勤務のバーを、ポジションの色を薄めた色で塗り、文字を黒にする", async () => {
    const blob = await createShiftPdf(buildExportSchedule(createDailyExportFixture(), false, false, "daily"));
    const document = await getDocument({
      data: new Uint8Array(await blob.arrayBuffer()),
      useSystemFonts: false,
      standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
    }).promise;
    try {
      const operators = await (await document.getPage(1)).getOperatorList();
      const fills = new Set(
        operators.fnArray.flatMap((fn, index) =>
          fn === OPS.setFillRGBColor ? [String(operators.argsArray[index]?.[0]).toLowerCase()] : [],
        ),
      );
      // ホール（#60a5fa）とキッチン（#fb923c）を薄めた色、1時間ごとの縦線の灰色、休憩と「休」の白、文字の黒だけを塗りに使う。
      expect([...fills].sort()).toEqual(["#000000", "#bfdbfd", "#c8c8c8", "#fdd3b1", "#ffffff"]);
    } finally {
      await document.loadingTask.destroy();
    }
  });
});
