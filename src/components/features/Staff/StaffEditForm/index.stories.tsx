import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffEditForm } from "./index";

const meta = {
  title: "features/Staff/StaffEditForm",
  component: StaffEditForm,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof StaffEditForm>;

export default meta;

type Story = StoryObj<typeof meta>;

const mockStaff = {
  _id: "staff1" as Id<"staffs">,
  email: "tanaka@example.com",
  displayName: "田中太郎",
  status: "active",
  maxWeeklyHours: 40,
  memo: "ベテランスタッフ。新人教育担当。",
  workStyleNote: "土日出勤可能。午前中の勤務を希望。",
  hourlyWage: 1200,
  resignedAt: undefined,
  resignationReason: undefined,
  createdAt: Date.now(),
};

const mockPositions = [
  { _id: "pos1" as Id<"shopPositions">, name: "ホール", order: 0 },
  { _id: "pos2" as Id<"shopPositions">, name: "キッチン", order: 1 },
  { _id: "pos3" as Id<"shopPositions">, name: "レジ", order: 2 },
];

const mockStaffSkills = [
  {
    _id: "skill1" as Id<"staffSkills">,
    positionId: "pos1" as Id<"shopPositions">,
    positionName: "ホール",
    positionOrder: 0,
    level: "ベテラン",
  },
  {
    _id: "skill2" as Id<"staffSkills">,
    positionId: "pos2" as Id<"shopPositions">,
    positionName: "キッチン",
    positionOrder: 1,
    level: "一人前",
  },
  {
    _id: "skill3" as Id<"staffSkills">,
    positionId: "pos3" as Id<"shopPositions">,
    positionName: "レジ",
    positionOrder: 2,
    level: "研修中",
  },
];

export const Basic: Story = {
  args: {
    staff: mockStaff,
    positions: mockPositions,
    staffSkills: mockStaffSkills,
    onSubmit: async (data) => {
      console.log("Submit:", data);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    },
    onCancel: () => {
      console.log("Cancel");
    },
    isSubmitting: false,
  },
};

export const NewStaff: Story = {
  args: {
    staff: {
      ...mockStaff,
      memo: "",
      workStyleNote: "",
      maxWeeklyHours: undefined,
      hourlyWage: null,
    },
    positions: mockPositions,
    staffSkills: [],
    onSubmit: async (data) => {
      console.log("Submit:", data);
    },
    onCancel: () => {
      console.log("Cancel");
    },
  },
};

export const Submitting: Story = {
  args: {
    ...Basic.args,
    isSubmitting: true,
  },
};
