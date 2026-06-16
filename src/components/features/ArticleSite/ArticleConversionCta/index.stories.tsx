import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArticleConversionCta } from ".";

const meta = {
  title: "Features/ArticleSite/ArticleConversionCta",
  component: ArticleConversionCta,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <Box bg="white" p={{ base: 4, md: 8 }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof ArticleConversionCta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    compact: true,
  },
  decorators: [
    (Story) => (
      <Box maxW="820px" mx="auto" bg="white" p={{ base: 4, md: 8 }}>
        <Story />
      </Box>
    ),
  ],
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
