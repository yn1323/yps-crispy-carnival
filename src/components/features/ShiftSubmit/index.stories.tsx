import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftSubmit } from ".";

const meta = {
  title: "features/ShiftSubmit",
  component: ShiftSubmit,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftSubmit>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockShop = {
  shopName: "カフェ テスト店",
  timeUnit: 30,
  openTime: "09:00",
  closeTime: "22:00",
};

const mockStaff = { _id: "staff_1", displayName: "田中太郎" };

const mockRecruitment = {
  _id: "recruitment_1",
  startDate: "2026-03-02",
  endDate: "2026-03-08",
  deadline: "2026-02-25",
};

const mockFrequentTimePatterns = [
  { startTime: "09:00", endTime: "17:00", count: 5 },
  { startTime: "10:00", endTime: "18:00", count: 3 },
  { startTime: "13:00", endTime: "22:00", count: 2 },
];

const mockPreviousRequest = {
  entries: [
    { date: "2026-02-23", isAvailable: true, startTime: "09:00", endTime: "17:00" },
    { date: "2026-02-24", isAvailable: false },
    { date: "2026-02-25", isAvailable: true, startTime: "10:00", endTime: "18:00" },
    { date: "2026-02-26", isAvailable: false },
    { date: "2026-02-27", isAvailable: true, startTime: "09:00", endTime: "17:00" },
    { date: "2026-02-28", isAvailable: true, startTime: "13:00", endTime: "22:00" },
    { date: "2026-03-01", isAvailable: false },
  ],
};

export const Basic: Story = {
  args: {
    token: "mock-token",
    staff: mockStaff,
    shop: mockShop,
    recruitment: mockRecruitment,
    existingRequest: null,
    previousRequest: mockPreviousRequest,
    frequentTimePatterns: mockFrequentTimePatterns,
  },
};

export const Submitted: Story = {
  args: {
    token: "mock-token",
    staff: mockStaff,
    shop: mockShop,
    recruitment: mockRecruitment,
    existingRequest: {
      entries: [
        { date: "2026-03-02", isAvailable: true, startTime: "09:00", endTime: "17:00" },
        { date: "2026-03-03", isAvailable: false },
        { date: "2026-03-04", isAvailable: true, startTime: "10:00", endTime: "18:00" },
        { date: "2026-03-05", isAvailable: false },
        { date: "2026-03-06", isAvailable: true, startTime: "09:00", endTime: "17:00" },
        { date: "2026-03-07", isAvailable: true, startTime: "13:00", endTime: "22:00" },
        { date: "2026-03-08", isAvailable: false },
      ],
      submittedAt: Date.now(),
    },
    previousRequest: null,
    frequentTimePatterns: mockFrequentTimePatterns,
  },
};
