import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { StaffingTable } from "./index";

const meta = {
  title: "features/Shift/StaffingMatrix/StaffingTable",
  component: StaffingTable,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof StaffingTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const positions = [
  { _id: "pos_1", name: "ホール" },
  { _id: "pos_2", name: "キッチン" },
  { _id: "pos_3", name: "その他" },
];

export const Basic: Story = {
  args: {
    openTime: "09:00",
    closeTime: "22:00",
    positions,
    staffing: [],
    onChange: () => {},
  },
};

export const WithData: Story = {
  args: {
    openTime: "09:00",
    closeTime: "22:00",
    positions,
    staffing: [
      { hour: 9, position: "ホール", requiredCount: 1 },
      { hour: 9, position: "キッチン", requiredCount: 1 },
      { hour: 10, position: "ホール", requiredCount: 1 },
      { hour: 10, position: "キッチン", requiredCount: 1 },
      { hour: 11, position: "ホール", requiredCount: 3 },
      { hour: 11, position: "キッチン", requiredCount: 2 },
      { hour: 12, position: "ホール", requiredCount: 3 },
      { hour: 12, position: "キッチン", requiredCount: 2 },
      { hour: 13, position: "ホール", requiredCount: 3 },
      { hour: 13, position: "キッチン", requiredCount: 2 },
    ],
    onChange: () => {},
  },
};

// インタラクティブなStory
const InteractiveStaffingTable = () => {
  const [staffing, setStaffing] = useState([
    { hour: 11, position: "ホール", requiredCount: 2 },
    { hour: 11, position: "キッチン", requiredCount: 1 },
  ]);

  return (
    <StaffingTable
      openTime="09:00"
      closeTime="18:00"
      positions={positions}
      staffing={staffing}
      onChange={setStaffing}
    />
  );
};

export const Interactive: Story = {
  render: () => <InteractiveStaffingTable />,
  args: {
    openTime: "09:00",
    closeTime: "18:00",
    positions,
    staffing: [],
    onChange: () => {},
  },
};

export const ShortHours: Story = {
  args: {
    openTime: "11:00",
    closeTime: "15:00",
    positions: [
      { _id: "pos_1", name: "ホール" },
      { _id: "pos_2", name: "キッチン" },
    ],
    staffing: [],
    onChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    openTime: "09:00",
    closeTime: "18:00",
    positions,
    staffing: [
      { hour: 11, position: "ホール", requiredCount: 2 },
      { hour: 11, position: "キッチン", requiredCount: 1 },
    ],
    onChange: () => {},
    disabled: true,
  },
};
