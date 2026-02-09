import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { MobileAccordionView } from "./index";

const meta = {
  title: "features/Shift/StaffingRequirement/MobileAccordionView",
  component: MobileAccordionView,
  parameters: {
    layout: "padded",
    viewport: { defaultViewport: "mobile1" },
  },
} satisfies Meta<typeof MobileAccordionView>;

export default meta;
type Story = StoryObj<typeof meta>;

const positions = [
  { _id: "pos_1", name: "ホール" },
  { _id: "pos_2", name: "キッチン" },
  { _id: "pos_3", name: "その他" },
];

const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

export const Basic: Story = {
  args: {
    hours,
    positions,
    staffing: [],
    onChange: () => {},
  },
};

export const WithData: Story = {
  args: {
    hours,
    positions,
    staffing: [
      { hour: 11, position: "ホール", requiredCount: 3 },
      { hour: 11, position: "キッチン", requiredCount: 2 },
      { hour: 12, position: "ホール", requiredCount: 3 },
      { hour: 12, position: "キッチン", requiredCount: 2 },
      { hour: 18, position: "ホール", requiredCount: 4 },
      { hour: 18, position: "キッチン", requiredCount: 2 },
      { hour: 19, position: "ホール", requiredCount: 4 },
      { hour: 19, position: "キッチン", requiredCount: 2 },
    ],
    onChange: () => {},
  },
};

const InteractiveAccordion = () => {
  const [staffing, setStaffing] = useState([
    { hour: 11, position: "ホール", requiredCount: 2 },
    { hour: 12, position: "ホール", requiredCount: 3 },
  ]);

  return <MobileAccordionView hours={hours} positions={positions} staffing={staffing} onChange={setStaffing} />;
};

export const Interactive: Story = {
  render: () => <InteractiveAccordion />,
  args: {
    hours,
    positions,
    staffing: [],
    onChange: () => {},
  },
};
