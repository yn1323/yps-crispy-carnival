import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffEdit, StaffEditLoading, StaffEditNotFound } from ".";

const meta = {
  title: "Features/Shop/StaffEdit",
  component: StaffEdit,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof StaffEdit>;

export default meta;

type Story = StoryObj<typeof meta>;

const mockShop = {
  _id: "shop123" as Id<"shops">,
  shopName: "カフェサンプル",
};

const mockPositions = [
  { _id: "pos1" as Id<"shopPositions">, name: "ホール", order: 0 },
  { _id: "pos2" as Id<"shopPositions">, name: "キッチン", order: 1 },
  { _id: "pos3" as Id<"shopPositions">, name: "レジ", order: 2 },
  { _id: "pos4" as Id<"shopPositions">, name: "その他", order: 3 },
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
  {
    _id: "skill4" as Id<"staffSkills">,
    positionId: "pos4" as Id<"shopPositions">,
    positionName: "その他",
    positionOrder: 3,
    level: "未経験",
  },
];

export const Basic: Story = {
  args: {
    shop: mockShop,
    positions: mockPositions,
    staffSkills: mockStaffSkills,
    staff: {
      _id: "staff123" as Id<"staffs">,
      email: "yamada@example.com",
      displayName: "山田太郎",
      status: "active",
      memo: "真面目で信頼できるスタッフ",
      workStyleNote: "土日勤務可能",
      resignedAt: undefined,
      resignationReason: undefined,
      createdAt: Date.now(),
    },
  },
};

export const AllBeginner: Story = {
  args: {
    shop: mockShop,
    positions: mockPositions,
    staffSkills: [], // 全て未経験の場合は空配列（デフォルトで未経験になる）
    staff: {
      _id: "staff456" as Id<"staffs">,
      email: "suzuki@example.com",
      displayName: "鈴木一郎",
      status: "active",
      memo: "",
      workStyleNote: "",
      resignedAt: undefined,
      resignationReason: undefined,
      createdAt: Date.now(),
    },
  },
};

const mockEmptyStaff = {
  _id: "staff123" as Id<"staffs">,
  email: "",
  displayName: "",
  status: "active",
  memo: "",
  workStyleNote: "",
  resignedAt: undefined,
  resignationReason: undefined,
  createdAt: Date.now(),
};

export const Loading: Story = {
  args: {
    shop: mockShop,
    positions: mockPositions,
    staffSkills: [],
    staff: mockEmptyStaff,
  },
  render: () => <StaffEditLoading />,
};

export const NotFound: Story = {
  args: {
    shop: mockShop,
    positions: mockPositions,
    staffSkills: [],
    staff: mockEmptyStaff,
  },
  render: () => <StaffEditNotFound shopId="shop123" />,
};
