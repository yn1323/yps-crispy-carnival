import type { Meta, StoryObj } from "@storybook/react-vite";
import { RemindUnsubmittedContent } from "./index";

const meta = {
  title: "Features/ShiftBoard/RemindUnsubmittedContent",
  component: RemindUnsubmittedContent,
  parameters: {
    layout: "padded",
  },
  args: {
    deadline: "5/10(土)",
    linkExpiresAtLabel: "5/6(水) 02:28",
  },
} satisfies Meta<typeof RemindUnsubmittedContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    unsubmittedNames: ["田中次郎", "小林大輔", "佐藤花子"],
  },
};

export const Many: Story = {
  args: {
    unsubmittedNames: ["田中次郎", "小林大輔", "佐藤花子", "山田太郎", "鈴木一郎", "高橋健太", "中村真理", "渡辺優子"],
  },
};

export const Single: Story = {
  args: {
    unsubmittedNames: ["田中次郎"],
  },
};
