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

export const Basic: Story = {
  args: {
    selectedDay: 1,
    onChange: () => {},
  },
};

export const Sunday: Story = {
  args: {
    selectedDay: 0,
    onChange: () => {},
  },
};

export const Saturday: Story = {
  args: {
    selectedDay: 6,
    onChange: () => {},
  },
};

// インタラクティブなStory
const InteractiveDayTabs = () => {
  const [selectedDay, setSelectedDay] = useState(1);

  return <DayTabs selectedDay={selectedDay} onChange={setSelectedDay} />;
};

export const Interactive: Story = {
  render: () => <InteractiveDayTabs />,
  args: {
    selectedDay: 1,
    onChange: () => {},
  },
};
