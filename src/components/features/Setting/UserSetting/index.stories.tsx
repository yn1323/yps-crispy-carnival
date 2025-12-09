import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { UserSetting } from "./index";

const meta = {
  title: "features/Setting/UserSetting",
  component: UserSetting,
  args: {
    user: {
      _id: "user1" as Id<"users">,
      _creationTime: Date.now(),
      name: "田中太郎",
      email: "tanaka@example.com",
      authId: "auth_123",
      status: "active",
      createdAt: Date.now(),
    } as Doc<"users">,
  },
} satisfies Meta<typeof UserSetting>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
