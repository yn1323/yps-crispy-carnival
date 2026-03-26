import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreateRecruitmentForm } from "./index";

const meta = {
  title: "Features/Dashboard/CreateRecruitmentForm",
  component: CreateRecruitmentForm,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof CreateRecruitmentForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
