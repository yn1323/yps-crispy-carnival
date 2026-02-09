import { Tabs } from "@chakra-ui/react";
import { DAY_LABELS, getDayColor, WEEKDAY_ORDER } from "../constants";

type DayTabsProps = {
  selectedDay: number;
  onChange: (day: number) => void;
};

export const DayTabs = ({ selectedDay, onChange }: DayTabsProps) => {
  return (
    <Tabs.Root
      value={String(selectedDay)}
      onValueChange={(e) => onChange(Number.parseInt(e.value, 10))}
      variant="outline"
    >
      <Tabs.List>
        {/* 月曜始まり: 月火水木金土日祝 */}
        {WEEKDAY_ORDER.map((dayIndex) => (
          <Tabs.Trigger key={dayIndex} value={String(dayIndex)} px={{ base: 3, md: 4 }} color={getDayColor(dayIndex)}>
            {DAY_LABELS[dayIndex]}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
};
