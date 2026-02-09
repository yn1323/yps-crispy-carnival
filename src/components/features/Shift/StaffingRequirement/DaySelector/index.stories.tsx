import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DaySelector } from "./index";

const meta = {
  title: "features/Shift/StaffingRequirement/DaySelector",
  component: DaySelector,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof DaySelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    selectedDays: [],
    onChange: () => {},
  },
};

export const WeekdaysSelected: Story = {
  args: {
    selectedDays: [1, 2, 3, 4, 5],
    onChange: () => {},
  },
};

export const WeekendsSelected: Story = {
  args: {
    selectedDays: [0, 6],
    onChange: () => {},
  },
};

export const SomeDaysDisabled: Story = {
  args: {
    selectedDays: [1, 2, 3],
    onChange: () => {},
    disabledDays: [0, 6],
    label: "コピー先を選択",
  },
};

// インタラクティブなStory
const InteractiveDaySelector = () => {
  const [selectedDays, setSelectedDays] = useState([1, 2, 3, 4, 5]);

  return <DaySelector selectedDays={selectedDays} onChange={setSelectedDays} />;
};

export const Interactive: Story = {
  render: () => <InteractiveDaySelector />,
  args: {
    selectedDays: [],
    onChange: () => {},
  },
};
