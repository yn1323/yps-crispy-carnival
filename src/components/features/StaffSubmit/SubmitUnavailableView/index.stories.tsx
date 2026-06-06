import { Box, VStack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubmitUnavailableView } from "./index";

const meta = {
  title: "features/StaffSubmit/SubmitUnavailableView",
  component: SubmitUnavailableView,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof SubmitUnavailableView>;

export default meta;
type Story = StoryObj<typeof meta>;

const disableSnapshot = {
  chromatic: { disableSnapshot: true },
};

export const InvalidLink: Story = {
  args: {
    reason: "invalid_link",
  },
  parameters: disableSnapshot,
};

export const RecruitmentDeleted: Story = {
  args: {
    reason: "recruitment_deleted",
  },
  parameters: disableSnapshot,
};

export const SubmissionClosed: Story = {
  args: {
    reason: "submission_closed",
  },
  parameters: disableSnapshot,
};

export const Variants: Story = {
  args: {
    reason: "invalid_link",
  },
  render: () => (
    <VStack align="stretch" gap={0}>
      <Box h="100dvh">
        <SubmitUnavailableView reason="invalid_link" />
      </Box>
      <Box h="100dvh">
        <SubmitUnavailableView reason="recruitment_deleted" />
      </Box>
      <Box h="100dvh">
        <SubmitUnavailableView reason="submission_closed" />
      </Box>
    </VStack>
  ),
};
