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
    await expect(canvas.queryByRole("link", { name: /デモを試す/ })).not.toBeInTheDocument();
    await expect(canvas.getByRole("heading", { level: 2, name: "よくある質問" })).toBeInTheDocument();
  },
};

/**
 * デモがある機能だけ、最初の画面と「できること」の後に、デモを別タブで開くボタンを出す。
 * よくある質問のない機能では、その節を出さない。
 */
export const WithDemo: Story = {
  args: {
    slug: "shift-auto-creation",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const demoLinks = canvas.getAllByRole("link", { name: "デモを試す（別タブで開きます）" });

    await expect(demoLinks).toHaveLength(2);
    for (const link of demoLinks) {
      await expect(link).toHaveAttribute("href", "/demo/shiftboard");
      await expect(link).toHaveAttribute("target", "_blank");
    }
    await expect(canvas.queryByRole("heading", { name: "よくある質問" })).not.toBeInTheDocument();
  },
};

export const WithDemoMobile: Story = {
  args: {
    slug: "shift-auto-creation",
  },
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
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
