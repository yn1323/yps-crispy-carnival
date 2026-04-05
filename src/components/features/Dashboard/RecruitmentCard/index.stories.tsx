import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRecruitments } from "../storyMocks";
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
    onOpenShiftBoard: () => {},
  },
};

export const Completed: Story = {
  args: {
    recruitment: mockRecruitments[1],
    onOpenShiftBoard: () => {},
  },
};
