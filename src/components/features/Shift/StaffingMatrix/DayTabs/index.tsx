import { Tabs } from "@chakra-ui/react";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

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
        {/* 月曜始まり: 月火水木金土日 */}
        {[1, 2, 3, 4, 5, 6, 0].map((dayIndex) => (
          <Tabs.Trigger key={dayIndex} value={String(dayIndex)} px={{ base: 3, md: 4 }}>
            {DAY_LABELS[dayIndex]}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
};
