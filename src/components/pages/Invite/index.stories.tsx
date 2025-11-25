import type { Meta, StoryObj } from "@storybook/react-vite";
import { Loading } from "@/src/components/features/User/Join";

// InvitePageはuseQueryを使うため、Storybookでは各状態のコンポーネントを直接表示
const meta = {
  title: "Pages/Invite",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

// ローディング状態
export const LoadingState: StoryObj = {
  render: () => <Loading />,
};
