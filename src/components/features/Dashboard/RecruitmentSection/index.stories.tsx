import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRecruitments } from "../mocks";
import { RecruitmentSection } from "./index";

const meta = {
  title: "Features/Dashboard/RecruitmentSection",
  component: RecruitmentSection,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof RecruitmentSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  args: {
    recruitments: mockRecruitments,
    onCreateClick: () => {},
  },
};

export const EmptyState: Story = {
  args: {
    recruitments: [],
    onCreateClick: () => {},
  },
};
