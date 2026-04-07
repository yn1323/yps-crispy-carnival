import { Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExpiredView } from "./index";

const meta = {
  title: "Features/StaffView/ExpiredView",
  component: ExpiredView,
} satisfies Meta<typeof ExpiredView>;

export default meta;
type Story = StoryObj<typeof meta>;

const AllVariants = () => (
  <Flex direction="column" gap={4} p={4}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
      再発行リンクあり
    </Text>
    <ExpiredView recruitmentId="abc123" />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      再発行リンクなし
    </Text>
    <ExpiredView recruitmentId={null} />
  </Flex>
);

export const Variants: Story = {
  render: () => <AllVariants />,
  args: {
    recruitmentId: "abc123",
  },
};
