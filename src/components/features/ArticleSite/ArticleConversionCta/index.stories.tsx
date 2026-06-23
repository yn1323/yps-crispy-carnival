import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { getByRole } from "@testing-library/dom";
import { expect } from "storybook/test";
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
  play: async ({ canvasElement }) => {
    const title = getByRole(canvasElement, "heading", {
      name: /LINEで届けてそのまま提出\s*かんたんシフト管理/,
    });
    const subtitle = Array.from(canvasElement.querySelectorAll<HTMLElement>("p")).find((element) =>
      element.textContent?.includes("スタッフはいつものスマホからシフト希望を提出"),
    );

    if (!subtitle) {
      throw new Error("ArticleConversionCtaのサブタイトルが見つかりませんでした");
    }

    expect(getComputedStyle(title).textAlign).toBe("center");
    expect(getComputedStyle(subtitle).textAlign).toBe("center");
  },
};
