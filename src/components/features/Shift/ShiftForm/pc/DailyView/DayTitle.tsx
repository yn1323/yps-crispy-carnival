import { Box, Flex } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue } from "jotai";
import { getWeekdayLabel } from "@/src/domains/shift/date";
import { FulfillmentLabel } from "../../assignmentCellParts";
import { DisplaySettingsMenu } from "../../DisplaySettingsMenu";
import { RangeAssignPalette, WorkPositionPicker } from "../../detailParts";
import { DayTemplateMenu, useDayStaffingView } from "../../staffingParts";
import { isToolPaletteActiveAtom, usesPositionColorsAtom } from "../../stores";
import { getShiftWeekdayColor } from "../../weekdayPresentation";

type Props = {
  date: string;
  holidays?: string[];
  /**
   * 見出しの右に置くもの。`rangeAssign`は、時間指定で次に新しく入れるものを選ぶ並びである。
   * `legend`は、パターン選択で次に入れるポジションを選ぶ並びで、色とポジションの対応を示す凡例を兼ねる。
   */
  positionControl: "rangeAssign" | "legend";
  /** その日のテンプレートを日付の横に出すか。時間指定は人数の帯の見出しに出すため、falseを渡す。 */
  showsTemplate?: boolean;
  /** 日付の横に出す充足率。必要人数が1つもない日と、充足率を出さない表示では渡さない。 */
  fulfillment?: { percent: number; isFulfilled: boolean } | null;
};

export const DayTitle = ({ date, holidays = [], positionControl, showsTemplate = true, fulfillment = null }: Props) => {
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  // 閲覧専用の表示では、表の上の凡例（PositionLegend）が出るため、見出しには重ねて出さない。
  const isEditable = useAtomValue(isToolPaletteActiveAtom);
  // くわしく表示のときだけ、その日のテンプレートを日付の横に出す。人数を見る前に、何と比べるかを選べるようにする。
  const staffingView = useDayStaffingView(date);
  if (!date) return null;
  const d = dayjs(date);
  const isClosed = holidays.includes(date);
  return (
    <Flex
      px={5}
      py={3}
      bg="white"
      borderBottomWidth="1px"
      borderColor="gray.200"
      flexShrink={0}
      align="center"
      justify="space-between"
      gap={3}
    >
      <Flex align="center" gap={5} flexShrink={0}>
        <Flex align="baseline" gap={2} flexShrink={0}>
          <Box textStyle="2xl" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
            {d.month() + 1}月{d.date()}日
          </Box>
          <Box textStyle="sm" fontWeight={600} style={{ color: getShiftWeekdayColor(date) }}>
            ({getWeekdayLabel(date)})
          </Box>
          {isClosed && (
            <Box px={2} py={0.5} borderRadius="full" bg="gray.100" color="gray.600" textStyle="2xs" fontWeight={700}>
              定休日
            </Box>
          )}
        </Flex>
        {!isClosed && fulfillment && (
          <FulfillmentLabel percent={fulfillment.percent} isFulfilled={fulfillment.isFulfilled} />
        )}
        {showsTemplate && staffingView && (
          // メニューのアイコンと名前でテンプレートだと分かるため、左にラベルを置かない。
          <Box flexShrink={0}>
            <DayTemplateMenu date={date} view={staffingView} />
          </Box>
        )}
      </Flex>
      {/* 定休日は勤務を入れられないため、入れるものの選択を出さない。 */}
      <Flex align="center" gap={4} minW={0} flexShrink={1}>
        {!isClosed &&
          (positionControl === "rangeAssign" ? (
            <RangeAssignPalette />
          ) : (
            usesPositionColors && isEditable && <WorkPositionPicker />
          ))}
        <DisplaySettingsMenu />
      </Flex>
    </Flex>
  );
};
