import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { HeroSummary } from ".";

const meta = {
  title: "Features/Dashboard2/HeroSummary",
  component: HeroSummary,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof HeroSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  args: {
    shop: { name: "居酒屋たなか", shiftStartTime: "14:00", shiftEndTime: "25:00" },
    collectingCount: 1,
    pastDeadlineCount: 1,
    confirmedCount: 1,
    staffCount: 3,
    onEditClick: () => {},
    onSetupClick: () => {},
  },
  render: () => (
    <Stack gap={6} maxW="1024px" mx="auto" w="full">
      <HeroSummary
        shop={{ name: "居酒屋たなか", shiftStartTime: "14:00", shiftEndTime: "25:00" }}
        collectingCount={1}
        pastDeadlineCount={1}
        confirmedCount={1}
        staffCount={3}
        onEditClick={() => {}}
        onSetupClick={() => {}}
      />
      <HeroSummary
        shop={{ name: "カフェ・ソレイユ", shiftStartTime: "09:00", shiftEndTime: "18:00" }}
        collectingCount={0}
        pastDeadlineCount={0}
        confirmedCount={0}
        staffCount={0}
        onEditClick={() => {}}
        onSetupClick={() => {}}
      />
      <HeroSummary
        shop={null}
        collectingCount={0}
        pastDeadlineCount={0}
        confirmedCount={0}
        staffCount={0}
        onEditClick={() => {}}
        onSetupClick={() => {}}
      />
    </Stack>
  ),
};
