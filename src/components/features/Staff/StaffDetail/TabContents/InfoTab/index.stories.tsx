import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoTab } from ".";

const mockStaff = {
  email: "tanaka@example.com",
  skills: [
    { position: "ホール", level: "ベテラン" },
    { position: "キッチン", level: "一人前" },
    { position: "レジ", level: "研修中" },
    { position: "その他", level: "未経験" },
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
  },
} satisfies Meta<typeof InfoTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const AllBeginner: Story = {
  args: {
    staff: {
      ...mockStaff,
      skills: [
        { position: "ホール", level: "未経験" },
        { position: "キッチン", level: "未経験" },
        { position: "レジ", level: "未経験" },
        { position: "その他", level: "未経験" },
      ],
    },
  },
};

export const AllVeteran: Story = {
  args: {
    staff: {
      ...mockStaff,
      skills: [
        { position: "ホール", level: "ベテラン" },
        { position: "キッチン", level: "ベテラン" },
        { position: "レジ", level: "ベテラン" },
        { position: "その他", level: "ベテラン" },
      ],
    },
  },
};

export const NoMemo: Story = {
  args: {
    staff: {
      ...mockStaff,
      memo: "",
      workStyleNote: "",
    },
  },
};
