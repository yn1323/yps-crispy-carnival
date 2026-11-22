import { Box, chakra, Flex, Menu, Portal } from "@chakra-ui/react";
import { LuChartGantt, LuChevronDown } from "react-icons/lu";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { DayTemplateMenuItems, useDayStaffingEditor } from "../../staffingParts";
import type { DayStaffingView } from "../../staffingPresentation";

/**
 * 「配置/必要」の下に小さく置く、その日のテンプレートの名前。押すと、その日のテンプレートを選ぶメニューが開く。
 * 閲覧専用と確定済みでは、名前だけを出す。その日だけの指定は、塗って見分ける。
 */
export const DayTemplateTrigger = ({ date, view }: { date: string; view: DayStaffingView }) => {
  const editor = useDayStaffingEditor();
  const name = (
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
  );
  if (!editor) {
    return (
      <Flex as="span" maxW="100%" minW={0} textStyle="2xs" fontWeight={600}>
        <chakra.span srOnly>この日のテンプレート: </chakra.span>
        {name}
      </Flex>
    );
  }
  // その日だけ別のテンプレートを当てた日は、色だけに頼らず、読み上げる名前でも伝える。
  const templateLabel = `${view.template.label}${view.template.isDateSpecific && !view.template.isCustom ? "（この日だけ）" : ""}`;
  return (
    <Menu.Root positioning={{ placement: "bottom", gutter: 4 }}>
      <Menu.Trigger asChild>
        <chakra.button
          type="button"
          aria-label={`${formatDateWithWeekday(date)}のテンプレート: ${templateLabel}`}
          // 列の幅いっぱいに広げ、アイコンを左、名前を中央、開く印を右の端に置く。
          display="grid"
          gridTemplateColumns="auto minmax(0, 1fr) auto"
          alignItems="center"
          gap="2px"
          w="100%"
          minW={0}
          minH="24px"
          px="4px"
          borderRadius="sm"
          textStyle="2xs"
          fontWeight={600}
          color="gray.600"
          // 押せる場所だと分かるよう、ふだんから薄い地を付ける。
          bg="blackAlpha.50"
          cursor="pointer"
          transitionProperty="background"
          transitionDuration="faster"
          _hover={{ bg: "blackAlpha.100" }}
          _active={{ bg: "blackAlpha.200", transitionDuration: "0ms" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
        >
          {/* ほかの画面のテンプレートと同じ時間帯の横棒のアイコンで、必要人数のテンプレートだと分かるようにする。 */}
          <Box as="span" display="flex" color="gray.500">
            <LuChartGantt size={12} aria-hidden />
          </Box>
          <Flex as="span" justify="center" minW={0}>
            {name}
          </Flex>
          <Box as="span" display="flex">
            <LuChevronDown size={12} aria-hidden />
          </Box>
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
