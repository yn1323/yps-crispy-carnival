import { Box, Flex, Stack } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { WeekStart } from "@/src/domains/shift/date";
import { IssueCountBadge } from "../../components";
import { BreakMark, PositionMark, StaffMeta } from "../../detailParts";
import {
  detailModeAtom,
  selectDateWithDailyStaffOrderAtom,
  shiftConfigAtom,
  shiftsAtom,
  viewModeAtom,
  warningCountByDateAtom,
} from "../../stores";
import { buildOverviewWeeks, type OverviewWeekViewModel } from "./script";

type OverviewViewProps = {
  weekStart?: WeekStart;
};

export const OverviewView = ({ weekStart = "mon" }: OverviewViewProps) => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const detailMode = useAtomValue(detailModeAtom);
  const { dates, holidays, isReadOnly, staffs } = config;

  const weeks = useMemo(
    () => buildOverviewWeeks({ dates, weekStart, holidays, isReadOnly, staffs, shifts, warningCounts }),
    [dates, holidays, isReadOnly, shifts, staffs, warningCounts, weekStart],
  );

  const [open, setOpen] = useState<Record<number, boolean>>({});

  const handleDateClick = useCallback(
    (iso: string) => {
      if (isReadOnly) return;
      selectDate(iso);
      setViewMode("daily");
    },
    [isReadOnly, selectDate, setViewMode],
  );

  return (
    <Box bg="gray.50" h="100%" overflow="auto" px={5} py={5}>
      <Stack gap={3}>
        {weeks.map((week, wi) => {
          if (week.dates.length === 0) return null;
          const isOpen = open[wi] !== false;
          return (
            <WeekCard
              key={week.key}
              week={week}
              isOpen={isOpen}
              onToggle={() => setOpen({ ...open, [wi]: !isOpen })}
              onDateClick={handleDateClick}
              detailMode={detailMode}
            />
          );
        })}
      </Stack>
    </Box>
  );
};

type WeekCardProps = WeekTableProps & {
  isOpen: boolean;
  onToggle: () => void;
};

const WeekCard = ({ week, isOpen, onToggle, onDateClick, detailMode }: WeekCardProps) => {
  return (
    <Box
      bg="white"
      borderRadius="xl"
      borderWidth="1px"
      borderColor="gray.200"
      overflow="hidden"
      boxShadow="0 1px 2px rgba(0,0,0,0.03)"
      transition="all 120ms"
    >
      <Flex
        align="center"
        gap={3}
        px={5}
        py={3}
        cursor="pointer"
        onClick={onToggle}
        borderBottomWidth={isOpen ? "1px" : "0"}
        borderColor="gray.100"
        bg="transparent"
        transitionProperty="colors"
        transitionDuration="faster"
        _active={{ bg: "gray.100", transitionDuration: "0ms" }}
      >
        <Flex
          w="28px"
          h="28px"
          borderRadius="md"
          bg={isOpen ? "teal.600" : "gray.100"}
          color={isOpen ? "white" : "gray.500"}
          align="center"
          justify="center"
          flexShrink={0}
        >
          {isOpen ? <LuChevronDown size={16} /> : <LuChevronRight size={16} />}
        </Flex>
        <Box textStyle="numeric" fontWeight={700} color="gray.800">
          {week.rangeLabel}
        </Box>
      </Flex>

      {isOpen && <WeekTable week={week} onDateClick={onDateClick} detailMode={detailMode} />}
    </Box>
  );
};

type WeekTableProps = {
  week: OverviewWeekViewModel;
  onDateClick: (iso: string) => void;
  /** くわしく表示かどうか。falseのときは従来の表と同じ内容を出す。 */
  detailMode: boolean;
};

const WeekTable = ({ week, onDateClick, detailMode }: WeekTableProps) => (
  <Box>
    <Box as="table" w="100%" textStyle="tableDense" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
      <Box as="colgroup">
        <Box as="col" style={{ width: 200 }} />
        {week.dates.map((date) => (
          <Box as="col" key={date.iso} />
        ))}
        <Box as="col" style={{ width: 72 }} />
      </Box>
      <Box as="thead">
        <Box as="tr" bg="gray.50" borderBottomWidth="1px" borderColor="gray.200">
          <Box
            as="th"
            textStyle="tableDense"
            style={{
              padding: "10px 18px",
              textAlign: "left",
              fontWeight: 600,
              color: "#52525b",
            }}
          >
            スタッフ
          </Box>
          {week.dates.map((date) => {
            return (
              <Box
                as="th"
                key={date.iso}
                onClick={date.isClickable ? () => onDateClick(date.iso) : undefined}
                bg={date.isClosed ? "gray.100" : undefined}
                transitionProperty="colors"
                transitionDuration="faster"
                _active={
                  date.isClickable
                    ? { bg: date.isClosed ? "gray.200" : "gray.100", transitionDuration: "0ms" }
                    : undefined
                }
                style={{
                  padding: "10px 4px",
                  fontWeight: 600,
                  textAlign: "center",
                  cursor: date.isClickable ? "pointer" : "default",
                  opacity: date.inRange ? 1 : 0.35,
                }}
              >
                <Box display="inline-block" position="relative" px={date.warningCount > 0 ? 1 : 0}>
                  {date.warningCount > 0 && (
                    <IssueCountBadge count={date.warningCount} tone="warning" top="-10px" right="-14px" />
                  )}
                  <Box textStyle="numeric" color="gray.700" fontWeight={600}>
                    {date.label}
                  </Box>
                </Box>
                <Box textStyle="2xs" fontWeight={600} mt="2px" style={{ color: date.weekdayColor }}>
                  {date.weekdayLabel}
                </Box>
                {date.isClosed && (
                  <Box textStyle="2xs" fontWeight={700} mt="2px" color="gray.500">
                    定休日
                  </Box>
                )}
                {!date.inRange && (
                  <Box textStyle="2xs" fontWeight={700} mt="2px" color="gray.500">
                    期間外
                  </Box>
                )}
              </Box>
            );
          })}
          <Box
            as="th"
            textStyle="tableDense"
            style={{
              padding: "10px 18px",
              textAlign: "right",
              fontWeight: 600,
              color: "#52525b",
            }}
          >
            計
          </Box>
        </Box>
      </Box>
      <Box as="tbody">
        {week.rows.map((row) => (
          <Box as="tr" key={row.key} borderBottomWidth="1px" borderColor="gray.100">
            <Box as="td" style={{ padding: "10px 18px" }}>
              <Flex align="center" gap="10px">
                <Box textStyle="sm" fontWeight={600} color={row.isUnsubmitted ? "gray.500" : "gray.800"}>
                  {row.name}
                </Box>
                {row.isUnsubmitted && (
                  <Box textStyle="2xs" fontWeight={600} flexShrink={0} style={{ color: "#b45309" }}>
                    未提出
                  </Box>
                )}
                {/* 合計は右端の「計」の列に週ごとに出すため、名前には熟練度の印だけを添える。 */}
                {detailMode && <StaffMeta staff={row.staff} showTotal={false} />}
              </Flex>
            </Box>
            {row.cells.map((cell) => (
              <Box
                as="td"
                key={cell.key}
                style={{
                  padding: "8px 4px",
                  textAlign: "center",
                  verticalAlign: "middle",
                  background: cell.tone === "closed" ? "#f4f4f5" : undefined,
                }}
              >
                {cell.tone === "closed" ? (
                  <Box as="span" color="gray.500" textStyle="caption" fontWeight={700}>
                    {cell.text}
                  </Box>
                ) : cell.tone === "assigned" && detailMode ? (
                  // 勤務時間の横に休憩の印、下にポジションを添える。
                  <Flex direction="column" align="center" gap="3px" minW={0}>
                    <Flex align="center" justify="center" gap="4px">
                      <Box
                        as="span"
                        textStyle="numeric"
                        fontWeight={600}
                        color="teal.700"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {cell.text}
                      </Box>
                      <BreakMark shift={cell.breakShift} compact />
                    </Flex>
                    {/* ポジションが1つの店舗では、熟練度の印がある日だけ出す。 */}
                    <Flex
                      justify="center"
                      wrap="wrap"
                      columnGap="6px"
                      rowGap="2px"
                      maxW="100%"
                      color="gray.700"
                      _empty={{ display: "none" }}
                    >
                      {cell.positions.map((segment) => (
                        <PositionMark key={segment.positionId} segment={segment} staff={row.staff} />
                      ))}
                    </Flex>
                  </Flex>
                ) : cell.tone === "assigned" ? (
                  <Box
                    as="span"
                    textStyle="numeric"
                    fontWeight={600}
                    color="teal.700"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {cell.text}
                  </Box>
                ) : (
                  <Box as="span" color={cell.tone === "empty" ? "gray.300" : "gray.200"} textStyle="caption">
                    {cell.text}
                  </Box>
                )}
              </Box>
            ))}
            <Box
              as="td"
              textStyle="sm"
              style={{
                padding: "10px 18px",
                textAlign: "right",
                fontWeight: 700,
                color: row.hasTotal ? "#27272a" : "#d4d4d8",
                fontVariantNumeric: "tabular-nums",
                // 休憩を引いた「13.25h」のような合計を、途中で折り返さない。
                whiteSpace: "nowrap",
              }}
            >
              {row.totalLabel}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  </Box>
);
