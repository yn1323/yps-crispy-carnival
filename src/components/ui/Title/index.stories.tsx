import type { Meta, StoryObj } from "@storybook/react-vite";
import { Title } from ".";

const meta = {
  title: "ui/Title",
  component: Title,
  args: {
    text: "セクションタイトル",
    prev: {
      url: "/previous-page",
      label: "前のページへ戻る",
    },
    action: null,
  },
  parameters: {},
} satisfies Meta<typeof Title>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
