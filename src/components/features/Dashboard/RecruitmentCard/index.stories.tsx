import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRecruitments } from "../mocks";
import { RecruitmentCard } from "./index";

const meta = {
  title: "Features/Dashboard/RecruitmentCard",
  component: RecruitmentCard,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof RecruitmentCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    recruitment: mockRecruitments[0],
  },
};

export const Closed: Story = {
  args: {
    recruitment: { ...mockRecruitments[1], status: "closed" },
  },
};
