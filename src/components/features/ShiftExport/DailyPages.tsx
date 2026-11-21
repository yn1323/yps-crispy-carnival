import { minutesToTime } from "@/src/domains/shift/time";
import {
  BREAK_LABEL,
  type ExportDailyLayout,
  fitDailyBreakLabel,
  fitDailySegmentLabel,
  getDailyCountLabels,
  getDailySegmentFill,
  getExportDailyLayout,
  getExportDailyPages,
} from "./dailyLayout";
import { fitExportText } from "./layout";
import type { ExportDaily, ExportDailySegment } from "./types";

type Props = {
  daily: ExportDaily;
  /** 連絡事項のページを足した、全体のページ数。 */
  totalPageCount: number;
};

const formatRange = ({ start, end }: { start: number; end: number }) => `${minutesToTime(start)}-${minutesToTime(end)}`;

const describeSegment = (segment: ExportDailySegment) =>
  `${segment.kind === "break" ? "休憩" : segment.label || "勤務"} ${formatRange(segment)}`;

function Segment({ segment, layout }: { segment: ExportDailySegment; layout: ExportDailyLayout }) {
  const leftPt = layout.toChartPt(segment.start);
  const widthPt = layout.toChartPt(segment.end) - leftPt;
  const style = {
    left: `${leftPt}pt`,
    width: `${widthPt}pt`,
    top: `${layout.segmentInsetPt}pt`,
    bottom: `${layout.segmentInsetPt}pt`,
  };
  if (segment.kind === "break") {
    const label = fitDailyBreakLabel(widthPt, layout);
    return (
      <span
        className="shift-export-daily-segment shift-export-daily-break"
        role="img"
        aria-label={describeSegment(segment)}
        title={describeSegment(segment)}
        style={style}
      >
        {label && (
          <span
            className="shift-export-daily-break-label"
            style={{
              width: `${label.boxWidthPt}pt`,
              height: `${label.boxHeightPt}pt`,
              fontSize: `${label.fontSizePt}pt`,
            }}
          >
            {BREAK_LABEL}
          </span>
        )}
      </span>
    );
  }
  const label = fitDailySegmentLabel(segment.label, widthPt, layout);
  return (
    <span
      className="shift-export-daily-segment"
      role="img"
      aria-label={describeSegment(segment)}
      title={describeSegment(segment)}
      style={{ ...style, background: getDailySegmentFill(segment.color), fontSize: `${label?.fontSizePt ?? 0}pt` }}
    >
      {label?.text}
    </span>
  );
}

/** 日別のバーのプレビュー。PDFと同じ座標で描く。 */
export function ShiftExportDailyPages({ daily, totalPageCount }: Props) {
  const layout = getExportDailyLayout(daily);
  const pages = getExportDailyPages(daily, layout);
  const chartStyle = { backgroundSize: `${layout.hourWidthPt}pt 100%` };
  const columns = (
    <colgroup>
      <col style={{ width: `${layout.nameColumnWidthPt}pt` }} />
      <col style={{ width: `${layout.timeColumnWidthPt}pt` }} />
      <col style={{ width: `${layout.chartWidthPt}pt` }} />
    </colgroup>
  );
  return pages.map(({ sheet, rows, title }, pageIndex) => (
    <section
      className="shift-export-page"
      aria-label={`${pageIndex + 1}ページ目`}
      key={`${sheet.date}:${title}`}
      style={{
        width: `${layout.pageWidthPt}pt`,
        height: `${layout.pageHeightPt}pt`,
        padding: `${layout.marginPt}pt`,
        fontSize: `${layout.fontSizePt}pt`,
      }}
    >
      <div className="shift-export-daily-title" style={{ height: `${layout.titleHeightPt}pt` }}>
        <h1 className="shift-export-title">{title}</h1>
        <p className="shift-export-daily-workers" style={{ width: `${layout.workerLabelWidthPt}pt` }}>
          {sheet.workerLabel}
        </p>
      </div>
      <table className="shift-export-table shift-export-daily" aria-label="勤務">
        {columns}
        <thead>
          <tr style={{ height: `${layout.axisHeightPt}pt` }}>
            <th scope="col">スタッフ</th>
            <th scope="col">時間</th>
            <th
              scope="col"
              className="shift-export-daily-chart shift-export-daily-grid"
              style={chartStyle}
              aria-label="時刻"
            >
              {layout.hours.map(
                (hour) =>
                  hour.label && (
                    <span
                      key={hour.minute}
                      className="shift-export-daily-hour"
                      style={{ left: `${hour.leftPt + layout.cellPaddingPt}pt` }}
                    >
                      {hour.label}
                    </span>
                  ),
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) =>
            row ? (
              <tr key={row.staffId} style={{ height: `${layout.rowHeightPt}pt` }}>
                <th scope="row" title={row.staffName}>
                  {
                    fitExportText(row.staffName, layout.nameColumnWidthPt - layout.cellPaddingPt * 2, layout.fontSizePt)
                      .text
                  }
                </th>
                <td>{row.timeLabel}</td>
                <td className="shift-export-daily-chart shift-export-daily-grid" style={chartStyle}>
                  {row.segments.map((segment) => (
                    <Segment key={`${segment.kind}:${segment.start}`} segment={segment} layout={layout} />
                  ))}
                </td>
              </tr>
            ) : (
              // 急な交代を手で書き込むための空行。
              <tr key={`blank:${rowIndex}`} style={{ height: `${layout.rowHeightPt}pt` }}>
                <th scope="row" />
                <td />
                <td className="shift-export-daily-chart shift-export-daily-grid" style={chartStyle} />
              </tr>
            ),
          )}
        </tbody>
      </table>
      <table
        className="shift-export-table shift-export-daily shift-export-daily-counts"
        aria-label="時間ごとの人数"
        style={{ marginTop: `${layout.countGapPt}pt` }}
      >
        <colgroup>
          <col style={{ width: `${layout.nameColumnWidthPt + layout.timeColumnWidthPt}pt` }} />
          <col style={{ width: `${layout.chartWidthPt}pt` }} />
        </colgroup>
        <tbody>
          {sheet.counts.map((count) => {
            const labels = getDailyCountLabels(count);
            return (
              <tr key={count.key} style={{ height: `${layout.countRowHeightPt}pt` }}>
                <th scope="row" title={count.label}>
                  {
                    fitExportText(
                      count.label,
                      layout.nameColumnWidthPt + layout.timeColumnWidthPt - layout.cellPaddingPt * 2,
                      layout.fontSizePt,
                    ).text
                  }
                </th>
                <td className="shift-export-daily-chart">
                  {count.segments.map((segment, index) => {
                    if (!labels[index]) return null;
                    const leftPt = layout.toChartPt(segment.start);
                    return (
                      <span
                        key={segment.start}
                        className="shift-export-daily-count"
                        title={`${formatRange(segment)} ${labels[index]}人`}
                        style={{ left: `${leftPt}pt`, width: `${layout.toChartPt(segment.end) - leftPt}pt` }}
                      >
                        {labels[index]}
                      </span>
                    );
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="shift-export-page-number">
        {pageIndex + 1} / {totalPageCount}
      </p>
    </section>
  ));
}
