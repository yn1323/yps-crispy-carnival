import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftEditor } from ".";

const meta = {
  title: "features/Shift/ShiftEditor",
  component: ShiftEditor,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockRecruitment = {
  _id: "recruitment_1",
  startDate: "2025-12-01",
  endDate: "2025-12-07",
};

const mockShiftRequests = [
  {
    _id: "req_1",
    recruitmentId: "recruitment_1",
    staffId: "staff_1",
    staffName: "田中太郎",
    date: "2025-12-01",
    startTime: "09:00",
    endTime: "17:00",
  },
  {
    _id: "req_2",
    recruitmentId: "recruitment_1",
    staffId: "staff_2",
    staffName: "山田花子",
    date: "2025-12-01",
    startTime: "11:00",
    endTime: "19:00",
  },
  {
    _id: "req_3",
    recruitmentId: "recruitment_1",
    staffId: "staff_3",
    staffName: "鈴木次郎",
    date: "2025-12-01",
    startTime: "10:00",
    endTime: "18:00",
  },
  {
    _id: "req_4",
    recruitmentId: "recruitment_1",
    staffId: "staff_1",
    staffName: "田中太郎",
    date: "2025-12-02",
    startTime: "10:00",
    endTime: "18:00",
  },
  {
    _id: "req_5",
    recruitmentId: "recruitment_1",
    staffId: "staff_2",
    staffName: "山田花子",
    date: "2025-12-03",
    startTime: "09:00",
    endTime: "15:00",
  },
];

const mockPositions = [
  { value: "hall", label: "ホール" },
  { value: "kitchen", label: "キッチン" },
  { value: "register", label: "レジ" },
];

const mockRequiredStaffing = [
  { _id: "rs_1", shopId: "shop_1", dayOfWeek: 1, hour: 9, position: "ホール", requiredCount: 2 },
  { _id: "rs_2", shopId: "shop_1", dayOfWeek: 1, hour: 9, position: "キッチン", requiredCount: 1 },
  { _id: "rs_3", shopId: "shop_1", dayOfWeek: 1, hour: 10, position: "ホール", requiredCount: 2 },
  { _id: "rs_4", shopId: "shop_1", dayOfWeek: 1, hour: 10, position: "キッチン", requiredCount: 1 },
  { _id: "rs_5", shopId: "shop_1", dayOfWeek: 1, hour: 11, position: "ホール", requiredCount: 3 },
  { _id: "rs_6", shopId: "shop_1", dayOfWeek: 1, hour: 11, position: "キッチン", requiredCount: 2 },
  { _id: "rs_7", shopId: "shop_1", dayOfWeek: 1, hour: 12, position: "ホール", requiredCount: 3 },
  { _id: "rs_8", shopId: "shop_1", dayOfWeek: 1, hour: 12, position: "キッチン", requiredCount: 2 },
];

export const Basic: Story = {
  args: {
    shopId: "shop_1",
    recruitmentId: "recruitment_1",
    recruitment: mockRecruitment,
    shiftRequests: mockShiftRequests,
    positions: mockPositions,
    requiredStaffing: mockRequiredStaffing,
  },
};

export const Empty: Story = {
  args: {
    shopId: "shop_1",
    recruitmentId: "recruitment_1",
    recruitment: mockRecruitment,
    shiftRequests: [],
    positions: mockPositions,
    requiredStaffing: mockRequiredStaffing,
  },
};

export const ManyStaffs: Story = {
  args: {
    shopId: "shop_1",
    recruitmentId: "recruitment_1",
    recruitment: mockRecruitment,
    shiftRequests: [
      ...mockShiftRequests,
      {
        _id: "req_6",
        recruitmentId: "recruitment_1",
        staffId: "staff_4",
        staffName: "高橋三郎",
        date: "2025-12-01",
        startTime: "08:00",
        endTime: "16:00",
      },
      {
        _id: "req_7",
        recruitmentId: "recruitment_1",
        staffId: "staff_5",
        staffName: "伊藤四郎",
        date: "2025-12-01",
        startTime: "12:00",
        endTime: "20:00",
      },
      {
        _id: "req_8",
        recruitmentId: "recruitment_1",
        staffId: "staff_6",
        staffName: "渡辺五郎",
        date: "2025-12-01",
        startTime: "14:00",
        endTime: "22:00",
      },
    ],
    positions: mockPositions,
    requiredStaffing: mockRequiredStaffing,
  },
};

export const SingleDay: Story = {
  args: {
    shopId: "shop_1",
    recruitmentId: "recruitment_1",
    recruitment: {
      _id: "recruitment_1",
      startDate: "2025-12-01",
      endDate: "2025-12-01",
    },
    shiftRequests: mockShiftRequests.filter((r) => r.date === "2025-12-01"),
    positions: mockPositions,
    requiredStaffing: mockRequiredStaffing,
  },
};
