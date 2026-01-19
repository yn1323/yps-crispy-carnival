import type { Meta, StoryObj } from "@storybook/react-vite";
import { RequestStatus } from ".";

const meta = {
  title: "features/Shift/RequestStatus",
  component: RequestStatus,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof RequestStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockRecruitment = {
  _id: "recruitment_1",
  startDate: "2025-12-01",
  endDate: "2025-12-07",
  deadline: "2025-11-25",
  status: "open" as const,
};

const mockStaffsWithRequests = [
  {
    staffId: "staff_1",
    staffName: "田中太郎",
    status: "applied" as const,
    requests: [
      {
        _id: "req_1",
        staffId: "staff_1",
        staffName: "田中太郎",
        date: "2025-12-01",
        startTime: "09:00",
        endTime: "17:00",
      },
      {
        _id: "req_2",
        staffId: "staff_1",
        staffName: "田中太郎",
        date: "2025-12-03",
        startTime: "10:00",
        endTime: "18:00",
      },
    ],
    totalDays: 2,
    totalHours: 16,
  },
  {
    staffId: "staff_2",
    staffName: "山田花子",
    status: "applied" as const,
    requests: [
      {
        _id: "req_3",
        staffId: "staff_2",
        staffName: "山田花子",
        date: "2025-12-02",
        startTime: "11:00",
        endTime: "19:00",
      },
    ],
    totalDays: 1,
    totalHours: 8,
  },
  {
    staffId: "staff_3",
    staffName: "佐藤一郎",
    status: "not_applied" as const,
    requests: [],
    totalDays: 0,
    totalHours: 0,
  },
];

export const Basic: Story = {
  args: {
    shopId: "shop_1",
    recruitmentId: "recruitment_1",
    recruitment: mockRecruitment,
    staffsWithRequests: mockStaffsWithRequests,
  },
};

export const AllApplied: Story = {
  args: {
    shopId: "shop_1",
    recruitmentId: "recruitment_1",
    recruitment: mockRecruitment,
    staffsWithRequests: mockStaffsWithRequests
      .filter((s) => s.status === "applied")
      .map((s) => ({ ...s, status: "applied" as const })),
  },
};

export const NoApplications: Story = {
  args: {
    shopId: "shop_1",
    recruitmentId: "recruitment_1",
    recruitment: mockRecruitment,
    staffsWithRequests: [
      {
        staffId: "staff_1",
        staffName: "田中太郎",
        status: "not_applied" as const,
        requests: [],
        totalDays: 0,
        totalHours: 0,
      },
      {
        staffId: "staff_2",
        staffName: "山田花子",
        status: "not_applied" as const,
        requests: [],
        totalDays: 0,
        totalHours: 0,
      },
    ],
  },
};

export const Empty: Story = {
  args: {
    shopId: "shop_1",
    recruitmentId: "recruitment_1",
    recruitment: mockRecruitment,
    staffsWithRequests: [],
  },
};
