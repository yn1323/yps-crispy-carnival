import { Flex, Text } from "@chakra-ui/react";
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

const AllVariants = () => (
  <Flex direction="column" gap={4} p={4}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
      収集中（締切前）
    </Text>
    <RecruitmentCard recruitment={mockRecruitments[0]} onOpenShiftBoard={() => {}} />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      締切済み
    </Text>
    <RecruitmentCard recruitment={mockRecruitments[1]} onOpenShiftBoard={() => {}} />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      確定済み
    </Text>
    <RecruitmentCard recruitment={mockRecruitments[2]} onOpenShiftBoard={() => {}} />
  </Flex>
);

export const Variants: Story = {
  render: () => <AllVariants />,
  args: {
    recruitment: mockRecruitments[0],
    onOpenShiftBoard: () => {},
  },
};
