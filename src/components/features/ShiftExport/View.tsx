import { Box, Flex, Text } from "@chakra-ui/react";
import { LuDownload } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { fitExportText, getExportLayout } from "./layout";
import type { ExportSchedule } from "./types";
import type { useExportDownload } from "./useExportDownload";
import "./styles.css";

type Props = { schedule: ExportSchedule; download: ReturnType<typeof useExportDownload> };

export function ShiftExportView({ schedule, download }: Props) {
  const layout = getExportLayout(schedule);
  return (
    <Box minH="100dvh" bg="gray.100">
      <Box as="header" p={4} bg="white" borderBottomWidth="1px">
        <Flex gap={3} flexWrap="wrap" align="center">
          <Button
            colorPalette="teal"
            onClick={() => void download.generate("pdf")}
            disabled={download.isGenerating}
            loading={download.isGenerating && download.generatingFormat === "pdf"}
          >
            <LuDownload />
            PDFダウンロード
          </Button>
          <Button
            variant="outline"
            onClick={() => void download.generate("xlsx")}
            disabled={download.isGenerating}
            loading={download.isGenerating && download.generatingFormat === "xlsx"}
          >
            <LuDownload />
            Excelダウンロード
          </Button>
          <Text fontSize="sm" color="fg.muted">
            保存済みのシフト表を出力します。Excelでの編集内容はシフトリには反映されません。
          </Text>
        </Flex>
        {download.error && (
          <Text role="alert" mt={3} color="fg.error">
            {download.error}
          </Text>
        )}
        {download.download && (
          <Text role="status" mt={3} fontSize="sm">
            ダウンロードが始まらない場合は、
            <a
              className="shift-export-download-link"
              href={download.download.url}
              download={download.download.fileName}
            >
              作成した{download.download.format === "pdf" ? "PDF" : "Excel"}を保存
            </a>
            してください。
          </Text>
        )}
      </Box>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll the fixed-width preview. */}
      <section className="shift-export-preview" aria-label="シフト表プレビュー" tabIndex={0}>
        {layout.pages.map((rows, pageIndex) => (
          <section
            className="shift-export-page"
            aria-label={`${pageIndex + 1}ページ目`}
            key={rows[0]?.staffId ?? pageIndex}
            style={{
              width: `${layout.pageWidthPt}pt`,
              height: `${layout.pageHeightPt}pt`,
              padding: `${layout.marginPt}pt`,
              fontSize: `${layout.fontSizePt}pt`,
            }}
          >
            {pageIndex === 0 && (
              <div style={{ height: `${layout.titleHeightPt}pt` }}>
                <h1 className="shift-export-title">{schedule.shopName} シフト表</h1>
                <p>
                  {schedule.periodStart.replaceAll("-", "/")} 〜 {schedule.periodEnd.replaceAll("-", "/")}　
                  {schedule.statusLabel}
                  {schedule.notificationLabel ? ` ／ ${schedule.notificationLabel}` : ""}
                </p>
              </div>
            )}
            <table className="shift-export-table" aria-label="シフト表">
              <colgroup>
                <col style={{ width: `${layout.staffColumnWidthPt}pt` }} />
                {schedule.dates.map(({ date }) => (
                  <col key={date} style={{ width: `${layout.dateColumnWidthPt}pt` }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ height: `${layout.headerHeightPt}pt` }}>
                  <th scope="col">スタッフ</th>
                  {schedule.dates.map((date) => (
                    <th
                      scope="col"
                      key={date.date}
                      style={{
                        color: date.dayOfWeek === 0 ? "#c62828" : date.dayOfWeek === 6 ? "#1565c0" : "#111111",
                        fontSize: `${fitExportText(date.label, layout.dateColumnWidthPt - layout.cellPaddingPt * 2, 7, layout.minFontSizePt).fontSizePt}pt`,
                      }}
                    >
                      {date.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.staffId} style={{ height: `${layout.rowHeightPt}pt` }}>
                    <th scope="row" title={row.staffName}>
                      {
                        fitExportText(
                          row.staffName,
                          layout.staffColumnWidthPt - layout.cellPaddingPt * 2,
                          layout.fontSizePt,
                        ).text
                      }
                    </th>
                    {row.cells.map((cell, index) => (
                      <td
                        key={schedule.dates[index].date}
                        className={schedule.dates[index].isClosed ? "shift-export-closed" : undefined}
                        title={cell.lines.join("\n")}
                      >
                        {cell.lines.map((line, lineIndex) => {
                          const fitted = fitExportText(
                            line,
                            layout.dateColumnWidthPt - layout.cellPaddingPt * 2,
                            layout.fontSizePt,
                            layout.minFontSizePt,
                          );
                          return (
                            <div
                              key={`${lineIndex}:${line}`}
                              style={{ fontSize: `${fitted.fontSizePt}pt`, lineHeight: `${layout.lineHeightPt}pt` }}
                            >
                              {fitted.text}
                            </div>
                          );
                        })}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="shift-export-page-number">
              {pageIndex + 1} / {layout.pages.length}
            </p>
          </section>
        ))}
      </section>
    </Box>
  );
}
