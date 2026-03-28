import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreateRecruitmentForm } from "./index.tsx";

const meta = {
  title: "Features/Dashboard/CreateRecruitmentForm",
  component: CreateRecruitmentForm,
  parameters: {
    layout: "padded",
  },
  args: {
    onSubmit: () => {},
  },
} satisfies Meta<typeof CreateRecruitmentForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 初期状態: 空のフォーム */
export const Basic: Story = {};

/** デフォルト値あり */
export const WithDefaults: Story = {
  args: {
    defaultValues: {
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      deadline: "2026-03-25",
    },
  },
};
