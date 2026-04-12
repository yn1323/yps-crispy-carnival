import { HStack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecruitmentStatusBadge } from "./index";

const meta = {
  title: "Dashboard/RecruitmentStatusBadge",
  component: RecruitmentStatusBadge,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof RecruitmentStatusBadge>;

export default meta;
type Story = StoryObj<typeof RecruitmentStatusBadge>;

// 全バリアント
export const Variants: Story = {
  render: () => (
    <HStack gap={3}>
      <RecruitmentStatusBadge status="collecting" />
      <RecruitmentStatusBadge status="past-deadline" />
      <RecruitmentStatusBadge status="confirmed" />
    </HStack>
  ),
};
