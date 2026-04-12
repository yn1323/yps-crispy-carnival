import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRecruitments } from "../storyMocks";
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
    onOpenShiftBoard: () => {},
    status: "Exhausted",
    onLoadMore: () => {},
  },
};

export const CanLoadMore: Story = {
  args: {
    recruitments: mockRecruitments.slice(0, 3),

    onCreateClick: () => {},
    onOpenShiftBoard: () => {},
    status: "CanLoadMore",
    onLoadMore: () => {},
  },
};

export const EmptyState: Story = {
  args: {
    recruitments: [],
    onCreateClick: () => {},
    onOpenShiftBoard: () => {},
    status: "Exhausted",
    onLoadMore: () => {},
  },
};
