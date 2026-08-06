import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffGuideContent } from "./index";

const meta = {
  title: "Shared/StaffGuideContent",
  component: StaffGuideContent,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <Box bg="teal.50" minH="100dvh" px={{ base: 3, md: 6 }} py={{ base: 4, md: 8 }}>
        <Box maxW="960px" mx="auto" bg="white" borderRadius={{ base: "2xl", md: "3xl" }} overflow="hidden">
          <Story />
        </Box>
      </Box>
    ),
  ],
} satisfies Meta<typeof StaffGuideContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
