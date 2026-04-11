import { Box, Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockStaffs } from "../storyMocks";
import { StaffListItem } from "./index";

const meta = {
  title: "Features/Dashboard/StaffListItem",
  component: StaffListItem,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof StaffListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

const AllVariants = () => (
  <Flex direction="column" gap={4} p={4}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
      管理者
    </Text>
    <Box border="1px solid" borderColor="gray.200" borderRadius="lg" overflow="hidden">
      <StaffListItem staff={mockStaffs[0]} onEdit={() => {}} onDelete={() => {}} />
    </Box>

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      スタッフ
    </Text>
    <Box border="1px solid" borderColor="gray.200" borderRadius="lg" overflow="hidden">
      <StaffListItem staff={mockStaffs[1]} onEdit={() => {}} onDelete={() => {}} />
    </Box>
  </Flex>
);

export const Variants: Story = {
  render: () => <AllVariants />,
  args: {
    staff: mockStaffs[0],
    onEdit: () => {},
    onDelete: () => {},
  },
};
