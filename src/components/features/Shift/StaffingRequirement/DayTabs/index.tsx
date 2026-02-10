import { Tabs } from "@chakra-ui/react";
import { getDayColor, WEEKDAY_ORDER } from "../constants";

const DAY_TAB_LABELS = ["日", "月", "火", "水", "木", "金", "土", "祝"] as const;

type DayTabsProps = {
  selectedDay: number;
  onChange: (day: number) => void;
  configuredDays: number[];
};

export const DayTabs = ({ selectedDay, onChange, configuredDays }: DayTabsProps) => {
  const getTabColor = (dayIndex: number) => {
    if (!configuredDays.includes(dayIndex)) return "gray.400";
    return getDayColor(dayIndex);
  };

  return (
    <Tabs.Root
      value={String(selectedDay)}
      onValueChange={(e) => onChange(Number.parseInt(e.value, 10))}
      variant="line"
      colorPalette="teal"
      size="sm"
    >
      <Tabs.List
        overflowX="auto"
        css={{
          "&::-webkit-scrollbar": { display: "none" },
          scrollbarWidth: "none",
        }}
      >
        {/* 月曜始まり: 月火水木金土日祝 */}
        {WEEKDAY_ORDER.map((dayIndex) => (
          <Tabs.Trigger key={dayIndex} value={String(dayIndex)} px={{ base: 3, md: 4 }} color={getTabColor(dayIndex)}>
            {DAY_TAB_LABELS[dayIndex]}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
};
