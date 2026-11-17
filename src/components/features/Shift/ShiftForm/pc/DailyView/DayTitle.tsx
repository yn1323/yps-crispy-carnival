import { Box, Flex, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { getWeekdayLabel } from "@/src/domains/shift/date";
import { DisplaySettingsMenu } from "../../DisplaySettingsMenu";
import { ToolPalette } from "../../detailParts";
import { DayTemplateMenu, useDayStaffingView } from "../../staffingParts";
import { getShiftWeekdayColor } from "../../weekdayPresentation";

type Props = {
  date: string;
  holidays?: string[];
};

export const DayTitle = ({ date, holidays = [] }: Props) => {
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
        {staffingView && (
          <Flex align="center" gap={2} flexShrink={0}>
            <Text textStyle="xs" color="gray.600" whiteSpace="nowrap">
              テンプレート
            </Text>
            <DayTemplateMenu date={date} view={staffingView} />
          </Flex>
        )}
      </Flex>
      {/* 定休日は勤務を入れられないため、入れるものの選択を出さない。 */}
      <Flex align="center" gap={4} minW={0} flexShrink={1}>
        {!isClosed && <ToolPalette variant="inline" />}
        <DisplaySettingsMenu />
      </Flex>
    </Flex>
  );
};
