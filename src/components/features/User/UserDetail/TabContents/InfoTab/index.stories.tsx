import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { InfoTab } from ".";

const meta: Meta<typeof InfoTab> = {
  component: InfoTab,
  title: "Features/User/UserDetail/TabContents/InfoTab",
};

export default meta;

type Story = StoryObj<typeof InfoTab>;

export const Basic: Story = {
  args: {
    shops: [
      {
        _id: "shop1" as Id<"shops">,
        _creationTime: Date.now(),
        shopName: "Crispy Carnival 渋谷店",
        openTime: "10:00",
        closeTime: "22:00",
        timeUnit: 30,
        submitFrequency: "2w",
        useTimeCard: true,
        createdAt: Date.now(),
        isDeleted: false,
        createdBy: "user123",
        roles: ["owner"],
      },
      {
        _id: "shop2" as Id<"shops">,
        _creationTime: Date.now(),
        shopName: "Crispy Carnival 新宿店",
        openTime: "09:00",
        closeTime: "21:00",
        timeUnit: 30,
        submitFrequency: "1w",
        useTimeCard: true,
        createdAt: Date.now(),
        isDeleted: false,
        createdBy: "user456",
        roles: ["manager"],
      },
      {
        _id: "shop3" as Id<"shops">,
        _creationTime: Date.now(),
        shopName: "Crispy Carnival 池袋店",
        openTime: "10:00",
        closeTime: "20:00",
        timeUnit: 15,
        submitFrequency: "1w",
        useTimeCard: false,
        createdAt: Date.now(),
        isDeleted: false,
        createdBy: "user789",
        roles: ["general"],
      },
    ],
  },
};

export const Empty: Story = {
  args: {
    shops: [],
  },
};
