import { Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { generateTimeOptions } from "../utils/timeOptions";
import { DayCard, type DayEntry } from "./index";

const timeOptions = generateTimeOptions("09:00", "22:00");
const noop = () => {};

const AllVariants = () => (
  <Flex direction="column" gap={3} p={4}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
      休み（平日 / 土曜 / 日曜）
    </Text>
    <DayCard
      entry={{ date: "2026-04-07", isWorking: false, startTime: "09:00", endTime: "22:00" }}
      timeOptions={timeOptions}
      onToggleWorking={noop}
      onTimeChange={noop}
      onClear={noop}
    />
    <DayCard
      entry={{ date: "2026-04-11", isWorking: false, startTime: "09:00", endTime: "22:00" }}
      timeOptions={timeOptions}
      onToggleWorking={noop}
      onTimeChange={noop}
      onClear={noop}
    />
    <DayCard
      entry={{ date: "2026-04-12", isWorking: false, startTime: "09:00", endTime: "22:00" }}
      timeOptions={timeOptions}
      onToggleWorking={noop}
      onTimeChange={noop}
      onClear={noop}
    />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      出勤
    </Text>
    <DayCard
      entry={{ date: "2026-04-08", isWorking: true, startTime: "09:00", endTime: "18:00" }}
      timeOptions={timeOptions}
      onToggleWorking={noop}
      onTimeChange={noop}
      onClear={noop}
    />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      読み取り専用（出勤 / 休み）
    </Text>
    <DayCard
      entry={{ date: "2026-04-07", isWorking: true, startTime: "09:00", endTime: "18:00" }}
      timeOptions={timeOptions}
      onToggleWorking={noop}
      onTimeChange={noop}
      onClear={noop}
      isReadOnly
    />
    <DayCard
      entry={{ date: "2026-04-08", isWorking: false, startTime: "09:00", endTime: "22:00" }}
      timeOptions={timeOptions}
      onToggleWorking={noop}
      onTimeChange={noop}
      onClear={noop}
      isReadOnly
    />
  </Flex>
);

const InteractiveDemo = () => {
  const [entry, setEntry] = useState<DayEntry>({
    date: "2026-04-07",
    isWorking: false,
    startTime: "09:00",
    endTime: "22:00",
  });

  return (
    <div style={{ padding: 16 }}>
      <DayCard
        entry={entry}
        timeOptions={timeOptions}
        onToggleWorking={() => setEntry((e) => ({ ...e, isWorking: true }))}
        onTimeChange={(field, value) => setEntry((e) => ({ ...e, [field]: value }))}
        onClear={() => setEntry((e) => ({ ...e, isWorking: false, startTime: "09:00", endTime: "22:00" }))}
      />
    </div>
  );
};

const meta = {
  title: "features/StaffSubmit/DayCard",
  component: DayCard,
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof DayCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => <AllVariants />,
  args: {
    entry: { date: "2026-04-07", isWorking: false, startTime: "09:00", endTime: "22:00" },
    timeOptions: [],
    onToggleWorking: () => {},
    onTimeChange: () => {},
    onClear: () => {},
  },
};

export const Interactive: Story = {
  render: () => <InteractiveDemo />,
  args: {
    entry: { date: "2026-04-07", isWorking: false, startTime: "09:00", endTime: "22:00" },
    timeOptions: [],
    onToggleWorking: () => {},
    onTimeChange: () => {},
    onClear: () => {},
  },
};
