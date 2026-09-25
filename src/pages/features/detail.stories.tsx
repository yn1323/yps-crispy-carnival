import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { FeatureDetailPage } from "./detail";

const meta = {
  title: "Pages/FeatureDetailPage",
  component: FeatureDetailPage,
  args: {
    slug: "shift-schedule",
  },
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof FeatureDetailPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const breadcrumbs = within(canvas.getByRole("navigation", { name: "パンくず" }));

    await expect(breadcrumbs.getByRole("link", { name: "機能一覧" })).toHaveAttribute("href", "/features");
    for (const link of canvas.getAllByRole("link", { name: /無料ではじめる/ })) {
      await expect(link).toHaveAttribute("href", "/signup");
    }
    await expect(canvas.getByRole("link", { name: "確定シフトの共有" })).toHaveAttribute(
      "href",
      "/features/shift-sharing",
    );
  },
};

export const Mobile: Story = {
  args: {
    slug: "shift-request-collection",
  },
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const NotFound: Story = {
  args: {
    slug: "unknown-feature",
  },
};
