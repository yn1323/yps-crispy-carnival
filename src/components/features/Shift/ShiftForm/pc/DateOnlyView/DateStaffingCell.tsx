import { Box, chakra, Flex, Menu, Portal, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { LuChevronDown } from "react-icons/lu";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { DayTemplateMenuItems, StaffingUnsetNote, useDayStaffingEditor } from "../../staffingParts";
import type { DayStaffingView } from "../../staffingPresentation";
import { shiftConfigAtom } from "../../stores";
import { StaffingSlotCount } from "../ShiftTypeDailyView/StaffingSlotCount";
import { summarizeStaffingSlot } from "../ShiftTypeDailyView/script";

/** 人数の下に添える、その日の型の名前。その日だけの指定は塗って見分ける。 */
const TemplateName = ({ view, trailing }: { view: DayStaffingView; trailing?: ReactNode }) => (
  <Flex as="span" align="center" justify="center" gap="2px" minW={0} maxW="100%" textStyle="2xs" fontWeight={600}>
    <Box
      as="span"
      truncate
      title={view.template.label}
      px={view.template.isDateSpecific ? "4px" : 0}
      borderRadius="sm"
      bg={view.template.isDateSpecific ? "gray.700" : undefined}
      color={view.template.isDateSpecific ? "white" : "gray.600"}
    >
      {view.template.label}
    </Box>
    {trailing}
  </Flex>
);

/**
 * 週表の日付の列に置く、その日の人数と過不足。くわしく表示のときだけ出る。
 * 列が狭いため、セル全体を押すと、その日の型のメニューが開く。
 */
export const DateStaffingCell = ({ date, view }: { date: string; view: DayStaffingView }) => {
  const editor = useDayStaffingEditor();
  // 日付選択の区切りは終日の1つだけ。
  const slot = view.slots[0];
  const counts = slot ? <StaffingSlotCount slot={slot} /> : null;

  if (!editor) {
    return (
      <Flex direction="column" align="center" gap="4px" px="4px" py={2}>
        {counts}
        <TemplateName view={view} />
      </Flex>
    );
  }

  const countLabel = slot ? `の人数 ${summarizeStaffingSlot(slot).totalLabel}` : "";
  // その日だけ別の型を当てた日は、色だけに頼らず、読み上げる名前でも伝える。
  const templateLabel = `${view.template.label}${view.template.isDateSpecific && !view.template.isCustom ? "（この日だけ）" : ""}`;
  return (
    <Menu.Root positioning={{ placement: "bottom", gutter: 4 }}>
      <Menu.Trigger asChild>
        <chakra.button
          type="button"
          aria-label={`${formatDateWithWeekday(date)}${countLabel}、この日の型: ${templateLabel}`}
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap="4px"
          w="full"
          px="4px"
          py={2}
          cursor="pointer"
          transitionProperty="background"
          transitionDuration="faster"
          _hover={{ bg: "blackAlpha.50" }}
          _active={{ bg: "blackAlpha.100", transitionDuration: "0ms" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
        >
          {counts}
          <TemplateName
            view={view}
            trailing={
              <Box as="span" color="gray.600" flexShrink={0} display="flex">
                <LuChevronDown size={12} aria-hidden />
              </Box>
            }
          />
        </chakra.button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content w="min(260px, calc(100vw - 24px))">
            <DayTemplateMenuItems date={date} view={view} />
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

/** 人数の行の左に置く見出し。必要人数を持つ日が1日もない場合は、未設定と伝える。 */
export const StaffingRowLabel = () => {
  const config = useAtomValue(shiftConfigAtom);
  const hasRequirements = config.staffing?.days.some((day) => day.requirements !== null) ?? false;
  return (
    <Flex align="center" gap={2}>
      <Text fontWeight={700} color="gray.700" whiteSpace="nowrap">
        {hasRequirements ? "人数 / 必要" : "人数"}
      </Text>
      {!hasRequirements && <StaffingUnsetNote />}
    </Flex>
  );
};
