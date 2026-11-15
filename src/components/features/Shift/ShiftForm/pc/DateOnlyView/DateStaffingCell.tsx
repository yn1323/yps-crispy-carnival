import { Box, chakra, Flex, Menu, Portal, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { LuCheck, LuChevronDown } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { useShiftFormDetailActions } from "../../detailParts";
import type { DayStaffingView } from "../../staffingPresentation";
import { shiftConfigAtom } from "../../stores";
import { StaffingSlotCount } from "../ShiftTypeDailyView/StaffingSlotCount";
import { summarizeStaffingSlot } from "../ShiftTypeDailyView/script";

const NO_TEMPLATE_LABEL = "型なし";

/** 人数の下に添える、その日に当たっている日の型の名前。その日だけの指定は塗って見分ける。 */
const TemplateName = ({ view, trailing }: { view: DayStaffingView; trailing?: ReactNode }) => (
  <Flex as="span" align="center" justify="center" gap="2px" minW={0} maxW="100%" textStyle="2xs" fontWeight={600}>
    <Box
      as="span"
      truncate
      title={view.template?.name}
      px={view.isOverridden ? "4px" : 0}
      borderRadius="sm"
      bg={view.isOverridden ? "gray.700" : undefined}
      color={view.isOverridden ? "white" : "gray.600"}
    >
      {view.template?.name ?? NO_TEMPLATE_LABEL}
    </Box>
    {trailing}
  </Flex>
);

/**
 * 週表の日付の列に置く、その日の人数と過不足。くわしく表示のときだけ出る。
 * 列が狭いため、セル全体を押すと、その日に当てる日の型を選ぶメニューが開く。
 */
export const DateStaffingCell = ({ date, view }: { date: string; view: DayStaffingView }) => {
  const config = useAtomValue(shiftConfigAtom);
  const { onChangeDayTemplate } = useShiftFormDetailActions();
  const templates = config.staffing?.dayTemplates ?? [];
  // 日付選択の区切りは終日の1つだけ。
  const slot = view.slots[0];
  const counts = slot ? <StaffingSlotCount slot={slot} /> : null;

  if (templates.length === 0 || !onChangeDayTemplate || config.isReadOnly) {
    return (
      <Flex direction="column" align="center" gap="4px" px="4px" py={2}>
        {counts}
        {templates.length > 0 && <TemplateName view={view} />}
      </Flex>
    );
  }

  const templateLabel = view.template?.name ?? NO_TEMPLATE_LABEL;
  const countLabel = slot ? `の人数 ${summarizeStaffingSlot(slot).totalLabel}` : "";
  return (
    <Menu.Root positioning={{ placement: "bottom", gutter: 4 }}>
      <Menu.Trigger asChild>
        <chakra.button
          type="button"
          aria-label={`${formatDateWithWeekday(date)}${countLabel}、この日の型: ${templateLabel}${
            view.isOverridden ? "（この日だけ）" : ""
          }`}
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
          <Menu.Content w="min(240px, calc(100vw - 24px))">
            <Menu.ItemGroup>
              <Menu.ItemGroupLabel>{formatDateWithWeekday(date)}の型</Menu.ItemGroupLabel>
              {templates.map((template) => {
                const checked = view.template?.id === template.id;
                return (
                  <Menu.Item
                    key={template.id}
                    value={template.id}
                    cursor="pointer"
                    py={2.5}
                    onClick={() => {
                      if (!checked) onChangeDayTemplate(date, template.id);
                    }}
                  >
                    <Box w={4} color="teal.600" flexShrink={0}>
                      {checked && <LuCheck aria-hidden />}
                    </Box>
                    <Menu.ItemText fontSize="sm">{template.name}</Menu.ItemText>
                  </Menu.Item>
                );
              })}
            </Menu.ItemGroup>
            {view.isOverridden && (
              <>
                <Menu.Separator />
                <Menu.Item value="reset" cursor="pointer" py={2.5} onClick={() => onChangeDayTemplate(date, null)}>
                  <Box w={4} flexShrink={0} />
                  <Menu.ItemText fontSize="sm">曜日の設定に戻す</Menu.ItemText>
                </Menu.Item>
              </>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

/** 人数の行の左に置く見出し。日の型が1つもない店舗では、設定への導線を添える。 */
export const StaffingRowLabel = () => {
  const config = useAtomValue(shiftConfigAtom);
  const { onOpenSetup } = useShiftFormDetailActions();
  const hasTemplates = (config.staffing?.dayTemplates.length ?? 0) > 0;
  return (
    <Flex align="center" justify="space-between" gap={2}>
      <Text fontWeight={700} color="gray.700" whiteSpace="nowrap">
        {hasTemplates ? "人数 / 必要" : "人数"}
      </Text>
      {!hasTemplates && onOpenSetup && !config.isReadOnly && (
        <Button type="button" size="xs" variant="outline" h="28px" px={2} onClick={onOpenSetup} flexShrink={0}>
          必要人数を設定
        </Button>
      )}
    </Flex>
  );
};
