import { Box, Checkbox, Flex, Text } from "@chakra-ui/react";
import { LuCalendarX, LuDownload } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ShiftExportDailyPages } from "./DailyPages";
import { getExportDocumentPages } from "./dailyLayout";
import { fitExportText } from "./layout";
import { getExportNotesTitle, getExportTitle } from "./script";
import type { ExportSchedule, ExportView } from "./types";
import type { useExportDownload } from "./useExportDownload";
import "./styles.css";

type Props = {
  schedule: ExportSchedule;
  download: ReturnType<typeof useExportDownload>;
  onViewChange: (view: ExportView) => void;
  onSplitPeriodChange: (checked: boolean) => void;
  includeNotes: boolean;
  onIncludeNotesChange: (checked: boolean) => void;
};

export function ShiftExportView({
  schedule,
  download,
  onViewChange,
  onSplitPeriodChange,
  includeNotes,
  onIncludeNotesChange,
}: Props) {
  const { daily, pages, notePages, dailyPageCount, bodyPageCount, totalPageCount } = getExportDocumentPages(schedule);
  const isDaily = daily !== null;
  const isEmptyDaily = isDaily && dailyPageCount === 0;
  // 選んだ形で使える項目だけを出す。日別は1日ずつ出すため、期間を分ける項目を出さない。
  const options = [
    {
      label: "一覧を分割して表示する",
      isShown: !isDaily && schedule.dates.length >= 15,
      checked: schedule.splitPeriod,
      onChange: onSplitPeriodChange,
    },
    {
      label: "連絡事項も出力する",
      isShown: schedule.hasDateNotes,
      checked: includeNotes,
      onChange: onIncludeNotesChange,
    },
  ].filter(({ isShown }) => isShown);
  return (
    <Box minH="100dvh" bg="gray.100">
      <Box as="header" bg="white" borderBottomWidth="1px">
        <Flex px={4} py={3} gap={3} flexWrap="wrap" align="center" justify="space-between">
          {schedule.availableViews.length > 1 && (
            <ViewToggle
              options={VIEW_OPTIONS.filter((option) => schedule.availableViews.includes(option.value))}
              value={schedule.view}
              onChange={onViewChange}
              disabled={download.isGenerating}
            />
          )}
          <Flex gap={3} marginStart="auto" align="center">
            <Button
              flexShrink={0}
              colorPalette="teal"
              onClick={() => void download.generate("pdf")}
              disabled={download.isGenerating || isEmptyDaily}
              loading={download.isGenerating && download.generatingFormat === "pdf"}
            >
              <LuDownload />
              PDF
            </Button>
            {/* Excelは一覧とポジションだけを出すため、日別を選んでいる間は出さない。 */}
            {!isDaily && (
              <Button
                flexShrink={0}
                variant="outline"
                onClick={() => void download.generate("xlsx")}
                disabled={download.isGenerating}
                loading={download.isGenerating && download.generatingFormat === "xlsx"}
              >
                <LuDownload />
                Excel
              </Button>
            )}
          </Flex>
        </Flex>
        {options.length > 0 && (
          <Flex px={4} columnGap={6} flexWrap="wrap" borderTopWidth="1px">
            {options.map((option) => (
              <Checkbox.Root
                key={option.label}
                checked={option.checked}
                onCheckedChange={({ checked }) => option.onChange(checked === true)}
                disabled={download.isGenerating}
                colorPalette="teal"
                minH="44px"
                cursor={download.isGenerating ? "not-allowed" : "pointer"}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Label>{option.label}</Checkbox.Label>
              </Checkbox.Root>
            ))}
          </Flex>
        )}
        {download.download && (
          <Text role="status" fontSize="sm" px={4} pb={3}>
            ダウンロードが始まらない場合、
            <a
              className="shift-export-download-link"
              href={download.download.url}
              download={download.download.fileName}
            >
              ここ
            </a>
            を押して保存してください。
          </Text>
        )}
        {download.error && (
          <Text role="alert" px={4} pb={3} color="fg.error">
            {download.error}
          </Text>
        )}
      </Box>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll the fixed-width preview. */}
      <section className="shift-export-preview" aria-label="シフト表プレビュー" tabIndex={0}>
        {isEmptyDaily && (
          <Empty
            icon={LuCalendarX}
            title="勤務が入っている日がありません"
            description="シフト表で勤務を入れてから、もう一度出力してください。"
            minH="50dvh"
          />
        )}
        {daily && <ShiftExportDailyPages daily={daily} totalPageCount={totalPageCount} />}
        {pages.map(({ period, layout, rows, isFirstPage }, pageIndex) => (
          <section
            className="shift-export-page"
            aria-label={`${pageIndex + 1}ページ目`}
            key={`${period.periodStart}:${rows[0]?.staffId ?? "empty"}`}
            style={{
              width: `${layout.pageWidthPt}pt`,
              height: `${layout.pageHeightPt}pt`,
              padding: `${layout.marginPt}pt`,
              fontSize: `${layout.fontSizePt}pt`,
            }}
          >
            {isFirstPage && (
              <div style={{ height: `${layout.titleHeightPt}pt` }}>
                <h1 className="shift-export-title">{getExportTitle(period)}</h1>
              </div>
            )}
            <table className="shift-export-table" aria-label="シフト表">
              <colgroup>
                <col style={{ width: `${layout.staffColumnWidthPt}pt` }} />
                {period.dates.map(({ date }) => (
                  <col key={date} style={{ width: `${layout.dateColumnWidthPt}pt` }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ height: `${layout.headerHeightPt}pt` }}>
                  <th scope="col">スタッフ</th>
                  {period.dates.map((date) => (
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
                        key={period.dates[index].date}
                        className={period.dates[index].isClosed ? "shift-export-closed" : undefined}
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
              {pageIndex + 1} / {totalPageCount}
            </p>
          </section>
        ))}
        {notePages.map(({ layout, rows, isFirstPage }, notePageIndex) => (
          <section
            className="shift-export-page"
            aria-label={`${bodyPageCount + notePageIndex + 1}ページ目`}
            key={`notes:${rows[0]?.key ?? "empty"}`}
            style={{
              width: `${layout.pageWidthPt}pt`,
              height: `${layout.pageHeightPt}pt`,
              padding: `${layout.marginPt}pt`,
              fontSize: `${layout.fontSizePt}pt`,
            }}
          >
            {isFirstPage && (
              <div style={{ height: `${layout.titleHeightPt}pt` }}>
                <h1 className="shift-export-title">{getExportNotesTitle(schedule)}</h1>
              </div>
            )}
            <table className="shift-export-table shift-export-notes" aria-label="連絡事項">
              <colgroup>
                <col style={{ width: `${layout.dateColumnWidthPt}pt` }} />
                <col style={{ width: `${layout.staffColumnWidthPt}pt` }} />
                <col style={{ width: `${layout.noteColumnWidthPt}pt` }} />
              </colgroup>
              <thead>
                <tr style={{ height: `${layout.headerHeightPt}pt` }}>
                  <th scope="col">日付</th>
                  <th scope="col">名前</th>
                  <th scope="col">内容</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} style={{ height: `${layout.rowHeightPt}pt` }}>
                    <td>{row.dateLabel}</td>
                    <th scope="row" title={row.staffName}>
                      {
                        fitExportText(
                          row.staffName,
                          layout.staffColumnWidthPt - layout.cellPaddingPt * 2,
                          layout.fontSizePt,
                        ).text
                      }
                    </th>
                    <td className="shift-export-note" data-clarity-mask="true">
                      {row.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="shift-export-page-number">
              {bodyPageCount + notePageIndex + 1} / {totalPageCount}
            </p>
          </section>
        ))}
      </section>
    </Box>
  );
}

const VIEW_OPTIONS: { value: ExportView; label: string }[] = [
  { value: "overview", label: "一覧" },
  { value: "daily", label: "日別" },
  { value: "positions", label: "ポジション" },
];

/** 出力する形の切り替え。シフト表の「日別」「一覧」と同じ言葉を使う。 */
function ViewToggle({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: ExportView; label: string }[];
  value: ExportView;
  onChange: (view: ExportView) => void;
  disabled: boolean;
}) {
  return (
    <Flex role="group" aria-label="出力する形">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Button
            key={option.value}
            variant={selected ? "solid" : "outline"}
            colorPalette={selected ? "teal" : "gray"}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            disabled={disabled}
            minW="72px"
            borderStartRadius={index === 0 ? undefined : 0}
            borderEndRadius={index === options.length - 1 ? undefined : 0}
            marginStart={index === 0 ? 0 : "-1px"}
          >
            {option.label}
          </Button>
        );
      })}
    </Flex>
  );
}
