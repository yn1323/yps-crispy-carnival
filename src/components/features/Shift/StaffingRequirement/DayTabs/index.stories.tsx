import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DayTabs } from "./index";

const meta = {
  title: "features/Shift/StaffingRequirement/DayTabs",
  component: DayTabs,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof DayTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

// 月〜金が設定済み、土日祝は未設定
const CONFIGURED_WEEKDAYS = [1, 2, 3, 4, 5];
// 全曜日設定済み
const ALL_CONFIGURED = [0, 1, 2, 3, 4, 5, 6, 7];

export const Basic: Story = {
  args: {
    selectedDay: 1,
    onChange: () => {},
    configuredDays: CONFIGURED_WEEKDAYS,
  },
};

export const Sunday: Story = {
  args: {
    selectedDay: 0,
    onChange: () => {},
    configuredDays: CONFIGURED_WEEKDAYS,
  },
};

export const Saturday: Story = {
  args: {
    selectedDay: 6,
    onChange: () => {},
    configuredDays: ALL_CONFIGURED,
  },
};

export const NoneConfigured: Story = {
  args: {
    selectedDay: 1,
    onChange: () => {},
    configuredDays: [],
  },
};

// インタラクティブなStory
const InteractiveDayTabs = () => {
  const [selectedDay, setSelectedDay] = useState(1);

  return <DayTabs selectedDay={selectedDay} onChange={setSelectedDay} configuredDays={CONFIGURED_WEEKDAYS} />;
};

export const Interactive: Story = {
  render: () => <InteractiveDayTabs />,
  args: {
    selectedDay: 1,
    onChange: () => {},
    configuredDays: CONFIGURED_WEEKDAYS,
  },
};
