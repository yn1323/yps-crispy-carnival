import { fitExportText, getExportLayout } from "./layout";
import { getExportTitle } from "./script";
import type { ExportSchedule } from "./types";

const FONT_FAMILY = "Noto Sans JP";
let fontReady: Promise<void> | null = null;

const loadJapaneseFont = (renderer: typeof import("@react-pdf/renderer")) => {
  if (!fontReady) {
    fontReady = (async () => {
      const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}fonts/shift-export/NotoSansJP-Regular.ttf`);
      if (!response.ok) throw new Error("帳票用フォントを読み込めませんでした");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      }
      // Fetch first: a failed request must not stay in react-pdf's rejected font-load cache on retry.
      renderer.Font.register({ family: FONT_FAMILY, src: `data:font/ttf;base64,${btoa(binary)}` });
    })().catch((error: unknown) => {
      fontReady = null;
      throw error;
    });
  }
  return fontReady;
};

export const createShiftPdf = async (schedule: ExportSchedule): Promise<Blob> => {
  const renderer = await import("@react-pdf/renderer");
  await loadJapaneseFont(renderer);
  const { Document, Page, View, Text, pdf } = renderer;
  const layout = getExportLayout(schedule);
  const cellStyle = {
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#000000",
    justifyContent: "center" as const,
    // Keep the 0.5 pt border within the padding budget used by fitExportText.
    paddingHorizontal: layout.cellPaddingPt - 0.25,
    overflow: "hidden" as const,
    flexShrink: 0,
  };
  const dateCellWidth = layout.dateColumnWidthPt - layout.cellPaddingPt * 2;
  const titleText = getExportTitle(schedule);
  const title = fitExportText(titleText, layout.pageWidthPt - layout.marginPt * 2, 16);

  return pdf(
    <Document title={titleText} author="シフトリ" language="ja">
      {layout.pages.map((staffs, pageIndex) => (
        <Page
          key={staffs[0]?.staffId ?? "empty"}
          size="A4"
          orientation="landscape"
          wrap={false}
          style={{
            padding: layout.marginPt,
            minHeight: layout.pageHeightPt,
            maxHeight: layout.pageHeightPt,
            fontFamily: FONT_FAMILY,
            fontSize: layout.fontSizePt,
            color: "#000000",
          }}
        >
          {pageIndex === 0 && (
            <View style={{ height: layout.titleHeightPt, flexShrink: 0 }}>
              <Text style={{ fontSize: title.fontSizePt, maxLines: 1, marginBottom: 5 }}>{title.text}</Text>
              <Text style={{ maxLines: 1, fontSize: 9 }}>{schedule.statusLabel}</Text>
              {schedule.notificationLabel && (
                <Text style={{ fontSize: 8, maxLines: 1, marginTop: 2 }}>{schedule.notificationLabel}</Text>
              )}
            </View>
          )}
          <View style={{ borderLeftWidth: 0.5, borderTopWidth: 0.5, borderColor: "#000000" }}>
            <View style={{ flexDirection: "row", height: layout.headerHeightPt }} wrap={false}>
              <View style={{ ...cellStyle, width: layout.staffColumnWidthPt }}>
                <Text style={{ maxLines: 1 }}>スタッフ</Text>
              </View>
              {schedule.dates.map((date) => {
                const label = fitExportText(date.label, dateCellWidth, 7, layout.minFontSizePt);
                return (
                  <View key={date.date} style={{ ...cellStyle, width: layout.dateColumnWidthPt }}>
                    <Text
                      style={{
                        textAlign: "center",
                        maxLines: 1,
                        fontSize: label.fontSizePt,
                        color: date.dayOfWeek === 0 ? "#c62828" : date.dayOfWeek === 6 ? "#1565c0" : "#000000",
                      }}
                    >
                      {label.text}
                    </Text>
                  </View>
                );
              })}
            </View>
            {staffs.map((staff) => {
              const name = fitExportText(
                staff.staffName,
                layout.staffColumnWidthPt - layout.cellPaddingPt * 2,
                layout.fontSizePt,
              );
              return (
                <View key={staff.staffId} style={{ flexDirection: "row", height: layout.rowHeightPt }} wrap={false}>
                  <View style={{ ...cellStyle, width: layout.staffColumnWidthPt }}>
                    <Text style={{ maxLines: 1 }}>{name.text}</Text>
                  </View>
                  {schedule.dates.map((date, dateIndex) => (
                    <View
                      key={date.date}
                      style={{
                        ...cellStyle,
                        width: layout.dateColumnWidthPt,
                        backgroundColor: date.isClosed ? "#f0f0f0" : "#ffffff",
                      }}
                    >
                      {(date.isClosed ? ["-"] : staff.cells[dateIndex].lines).map((line, lineIndex) => {
                        const label = fitExportText(line, dateCellWidth, layout.fontSizePt, layout.minFontSizePt);
                        return (
                          <Text
                            key={`${lineIndex}-${line}`}
                            style={{
                              height: layout.lineHeightPt,
                              fontSize: label.fontSizePt,
                              lineHeight: layout.lineHeightPt / label.fontSizePt,
                              textAlign: "center",
                              maxLines: 1,
                            }}
                          >
                            {label.text}
                          </Text>
                        );
                      })}
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
          <Text
            style={{
              position: "absolute",
              bottom: layout.marginPt,
              left: layout.marginPt,
              right: layout.marginPt,
              fontSize: 8,
              textAlign: "center",
            }}
          >
            {pageIndex + 1} / {layout.pages.length}
          </Text>
        </Page>
      ))}
    </Document>,
  ).toBlob();
};
