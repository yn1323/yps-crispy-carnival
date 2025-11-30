import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoTab } from ".";

const mockStaff = {
  email: "tanaka@example.com",
  skills: [
    { position: "ホール", level: "ベテラン" },
    { position: "キッチン", level: "研修中" },
  ],
  maxWeeklyHours: 40,
  memo: "シフト調整に柔軟に対応してくれます。\n土日出勤可能。",
  workStyleNote: "午前中の勤務を希望。",
  hourlyWage: 1200,
};

const meta = {
  title: "Features/Shop/StaffDetail/TabContents/InfoTab",
  component: InfoTab,
  args: {
    staff: mockStaff,
    isOwner: true,
  },
} satisfies Meta<typeof InfoTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const AsNonOwner: Story = {
  args: {
    isOwner: false,
  },
};
