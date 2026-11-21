import {
  BREAK_LABEL,
  fitDailyBreakLabel,
  fitDailySegmentLabel,
  getDailyCountLabels,
  getDailyHatchLines,
  getDailySegmentFill,
  getExportDailyLayout,
  getExportDailyPages,
} from "./dailyLayout";
import { fitExportText } from "./layout";
import type { ExportDaily } from "./types";

const BLACK = "#000000";
const GRID = "#c8c8c8";
const HATCH = "#777777";
const COUNT_BORDER = "#666666";
const BORDER_PT = 0.5;

/** 日別のバーのページ。プレビュー（DailyPages.tsx）と同じ座標で描く。 */
export const createDailyPdfPages = (
  renderer: typeof import("@react-pdf/renderer"),
  daily: ExportDaily,
  totalPageCount: number,
  fontFamily: string,
) => {
  const { Page, View, Text, Svg, Line } = renderer;
  const layout = getExportDailyLayout(daily);
  const labelColumnWidthPt = layout.nameColumnWidthPt + layout.timeColumnWidthPt;
  const cellStyle = {
    borderRightWidth: BORDER_PT,
    borderBottomWidth: BORDER_PT,
    borderColor: BLACK,
    justifyContent: "center" as const,
    paddingHorizontal: layout.cellPaddingPt - BORDER_PT / 2,
    overflow: "hidden" as const,
    flexShrink: 0,
  };
  const chartCellStyle = { ...cellStyle, paddingHorizontal: 0, width: layout.chartWidthPt };
  const tableStyle = { borderLeftWidth: BORDER_PT, borderTopWidth: BORDER_PT, borderColor: BLACK };
  const segmentHeightPt = layout.rowHeightPt - layout.segmentInsetPt * 2 - BORDER_PT;
  const countHeightPt = layout.countRowHeightPt - 2 - BORDER_PT;

  return getExportDailyPages(daily, layout).map(({ sheet, rows, title }, pageIndex) => {
    const fittedTitle = fitExportText(title, layout.pageWidthPt - layout.marginPt * 2 - layout.workerLabelWidthPt, 16);
    return (
      <Page
        key={`${sheet.date}:${title}`}
        size="A4"
        orientation="landscape"
        wrap={false}
        style={{
          padding: layout.marginPt,
          minHeight: layout.pageHeightPt,
          maxHeight: layout.pageHeightPt,
          fontFamily,
          fontSize: layout.fontSizePt,
          color: BLACK,
        }}
      >
        <View style={{ height: layout.titleHeightPt, flexShrink: 0, flexDirection: "row", alignItems: "flex-start" }}>
          <Text style={{ flexGrow: 1, fontSize: fittedTitle.fontSizePt, maxLines: 1, marginBottom: 5 }}>
            {fittedTitle.text}
          </Text>
          <Text
            style={{ width: layout.workerLabelWidthPt, fontSize: 10, textAlign: "right", marginTop: 4, maxLines: 1 }}
          >
            {sheet.workerLabel}
          </Text>
        </View>
        <View style={tableStyle}>
          {/* 1時間ごとの縦線。行ごとに描かず、表の全体に1回だけ重ねる。 */}
          <View
            style={{
              position: "absolute",
              left: labelColumnWidthPt,
              top: 0,
              width: layout.chartWidthPt,
              height: layout.axisHeightPt + rows.length * layout.rowHeightPt,
            }}
          >
            {layout.hours.slice(1).map((hour) => (
              <View
                key={hour.minute}
                style={{
                  position: "absolute",
                  left: hour.leftPt,
                  top: 0,
                  bottom: 0,
                  width: BORDER_PT,
                  backgroundColor: GRID,
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", height: layout.axisHeightPt }} wrap={false}>
            <View style={{ ...cellStyle, width: layout.nameColumnWidthPt }}>
              <Text style={{ maxLines: 1 }}>スタッフ</Text>
            </View>
            <View style={{ ...cellStyle, width: layout.timeColumnWidthPt }}>
              <Text style={{ maxLines: 1, textAlign: "center" }}>時間</Text>
            </View>
            <View style={chartCellStyle}>
              {layout.hours.map(
                (hour) =>
                  hour.label && (
                    <View
                      key={hour.minute}
                      style={{
                        position: "absolute",
                        left: hour.leftPt + layout.cellPaddingPt,
                        top: 0,
                        bottom: 0,
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: layout.segmentFontSizePt }}>{hour.label}</Text>
                    </View>
                  ),
              )}
            </View>
          </View>
          {rows.map((row, rowIndex) => (
            <View
              key={row?.staffId ?? `blank:${rowIndex}`}
              style={{ flexDirection: "row", height: layout.rowHeightPt }}
              wrap={false}
            >
              <View style={{ ...cellStyle, width: layout.nameColumnWidthPt }}>
                {row && (
                  <Text style={{ maxLines: 1 }}>
                    {
                      fitExportText(
                        row.staffName,
                        layout.nameColumnWidthPt - layout.cellPaddingPt * 2,
                        layout.fontSizePt,
                      ).text
                    }
                  </Text>
                )}
              </View>
              <View style={{ ...cellStyle, width: layout.timeColumnWidthPt }}>
                {row && <Text style={{ maxLines: 1, textAlign: "center" }}>{row.timeLabel}</Text>}
              </View>
              <View style={chartCellStyle}>
                {row?.segments.map((segment) => {
                  const leftPt = layout.toChartPt(segment.start);
                  const widthPt = layout.toChartPt(segment.end) - leftPt;
                  const boxStyle = {
                    position: "absolute" as const,
                    left: leftPt,
                    top: layout.segmentInsetPt,
                    width: widthPt,
                    height: segmentHeightPt,
                    borderWidth: BORDER_PT,
                    borderColor: BLACK,
                    overflow: "hidden" as const,
                  };
                  if (segment.kind === "break") {
                    const innerWidthPt = Math.max(0, widthPt - BORDER_PT * 2);
                    const innerHeightPt = segmentHeightPt - BORDER_PT * 2;
                    const breakLabel = fitDailyBreakLabel(widthPt, layout);
                    return (
                      <View key={`break:${segment.start}`} style={{ ...boxStyle, backgroundColor: "#ffffff" }}>
                        <Svg width={innerWidthPt} height={innerHeightPt}>
                          {getDailyHatchLines(innerWidthPt, innerHeightPt).map((line) => (
                            <Line key={`${line.x1}:${line.y1}`} {...line} stroke={HATCH} strokeWidth={0.4} />
                          ))}
                        </Svg>
                        {breakLabel && (
                          <View
                            style={{
                              position: "absolute",
                              left: (innerWidthPt - breakLabel.boxWidthPt) / 2,
                              top: (innerHeightPt - breakLabel.boxHeightPt) / 2,
                              width: breakLabel.boxWidthPt,
                              height: breakLabel.boxHeightPt,
                              backgroundColor: "#ffffff",
                              justifyContent: "center",
                            }}
                          >
                            <Text style={{ fontSize: breakLabel.fontSizePt, lineHeight: 1.2, textAlign: "center" }}>
                              {BREAK_LABEL}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  }
                  const label = fitDailySegmentLabel(segment.label, widthPt, layout);
                  return (
                    <View
                      key={`work:${segment.start}`}
                      style={{
                        ...boxStyle,
                        backgroundColor: getDailySegmentFill(segment.color),
                        justifyContent: "center",
                        paddingHorizontal: 2 - BORDER_PT,
                      }}
                    >
                      {label && <Text style={{ fontSize: label.fontSizePt, maxLines: 1 }}>{label.text}</Text>}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
        <View style={{ ...tableStyle, marginTop: layout.countGapPt }}>
          {sheet.counts.map((count) => {
            const labels = getDailyCountLabels(count);
            return (
              <View key={count.key} style={{ flexDirection: "row", height: layout.countRowHeightPt }} wrap={false}>
                <View style={{ ...cellStyle, width: labelColumnWidthPt }}>
                  <Text style={{ maxLines: 1 }}>
                    {fitExportText(count.label, labelColumnWidthPt - layout.cellPaddingPt * 2, layout.fontSizePt).text}
                  </Text>
                </View>
                <View style={chartCellStyle}>
                  {count.segments.map((segment, index) => {
                    if (!labels[index]) return null;
                    const leftPt = layout.toChartPt(segment.start);
                    const widthPt = layout.toChartPt(segment.end) - leftPt;
                    return (
                      <View
                        key={segment.start}
                        style={{
                          position: "absolute",
                          left: leftPt,
                          top: 1,
                          width: widthPt,
                          height: countHeightPt,
                          borderWidth: BORDER_PT,
                          borderColor: COUNT_BORDER,
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: widthPt < 8 ? layout.minFontSizePt : layout.segmentFontSizePt,
                            // 行の高さを決めないと、枠より高い行として文字ごと落とされる。
                            lineHeight: 1.2,
                            textAlign: "center",
                            maxLines: 1,
                          }}
                        >
                          {labels[index]}
                        </Text>
                      </View>
                    );
                  })}
                </View>
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
          {pageIndex + 1} / {totalPageCount}
        </Text>
      </Page>
    );
  });
};
