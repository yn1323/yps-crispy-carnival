import { Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockStaffs, mockStaffsMany } from "@/src/components/features/Dashboard/storyMocks";
import { StaffRoster } from ".";

const meta = {
  title: "Features/Dashboard2/StaffRoster",
  component: StaffRoster,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof StaffRoster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  args: {
    staffs: mockStaffs,
    status: "Exhausted",
    onAddClick: () => {},
    onMenuClick: () => {},
    onLoadMore: () => {},
  },
  render: () => (
    <Stack gap={10} maxW="720px" mx="auto" w="full">
      <Stack gap={3}>
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted" letterSpacing="0.08em" textTransform="uppercase">
          データあり
        </Text>
        <StaffRoster
          staffs={mockStaffs}
          status="Exhausted"
          onAddClick={() => {}}
          onMenuClick={() => {}}
          onLoadMore={() => {}}
        />
      </Stack>
      <Stack gap={3}>
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted" letterSpacing="0.08em" textTransform="uppercase">
          もっと見る ありの状態
        </Text>
        <StaffRoster
          staffs={mockStaffsMany}
          status="CanLoadMore"
          onAddClick={() => {}}
          onMenuClick={() => {}}
          onLoadMore={() => {}}
        />
      </Stack>
      <Stack gap={3}>
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted" letterSpacing="0.08em" textTransform="uppercase">
          空の状態
        </Text>
        <StaffRoster
          staffs={[]}
          status="Exhausted"
          onAddClick={() => {}}
          onMenuClick={() => {}}
          onLoadMore={() => {}}
        />
      </Stack>
    </Stack>
  ),
};
