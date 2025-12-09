import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserProfile } from "./index";

const meta = {
  title: "features/Setting/UserSetting/UserProfile",
  component: UserProfile,
  args: {
    userName: "田中太郎",
    email: "tanaka@example.com",
    onChangeUserName: () => {},
    onSave: () => {},
  },
} satisfies Meta<typeof UserProfile>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
