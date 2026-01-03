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

export const Basic: Story = {
  args: {
    shop: mockShop,
    staff: {
      _id: "staff123" as Id<"staffs">,
      email: "yamada@example.com",
      displayName: "山田太郎",
      status: "active",
      skills: [
        { position: "ホール", level: "ベテラン" },
        { position: "キッチン", level: "一人前" },
        { position: "レジ", level: "研修中" },
        { position: "その他", level: "未経験" },
      ],
      maxWeeklyHours: 40,
      memo: "真面目で信頼できるスタッフ",
      workStyleNote: "土日勤務可能",
      hourlyWage: 1200,
      resignedAt: undefined,
      resignationReason: undefined,
      createdAt: Date.now(),
    },
  },
};

export const AllBeginner: Story = {
  args: {
    shop: mockShop,
    staff: {
      _id: "staff456" as Id<"staffs">,
      email: "suzuki@example.com",
      displayName: "鈴木一郎",
      status: "active",
      skills: [
        { position: "ホール", level: "未経験" },
        { position: "キッチン", level: "未経験" },
        { position: "レジ", level: "未経験" },
        { position: "その他", level: "未経験" },
      ],
      maxWeeklyHours: undefined,
      memo: "",
      workStyleNote: "",
      hourlyWage: null,
      resignedAt: undefined,
      resignationReason: undefined,
      createdAt: Date.now(),
    },
  },
};

export const Loading: Story = {
  args: {
    shop: mockShop,
    staff: {
      _id: "staff123" as Id<"staffs">,
      email: "",
      displayName: "",
      status: "active",
      skills: [],
      maxWeeklyHours: undefined,
      memo: "",
      workStyleNote: "",
      hourlyWage: null,
      resignedAt: undefined,
      resignationReason: undefined,
      createdAt: Date.now(),
    },
  },
  render: () => <StaffEditLoading />,
};

export const NotFound: Story = {
  args: {
    shop: mockShop,
    staff: {
      _id: "staff123" as Id<"staffs">,
      email: "",
      displayName: "",
      status: "active",
      skills: [],
      maxWeeklyHours: undefined,
      memo: "",
      workStyleNote: "",
      hourlyWage: null,
      resignedAt: undefined,
      resignationReason: undefined,
      createdAt: Date.now(),
    },
  },
  render: () => <StaffEditNotFound shopId="shop123" />,
};
