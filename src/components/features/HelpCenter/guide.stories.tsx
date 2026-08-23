import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { HelpGuide } from "./HelpGuide";

const meta = {
  title: "Features/HelpCenter/Guide",
  component: HelpGuide,
  args: {
    slug: "start-shift-management",
  },
  decorators: [
    (Story) => (
      <>
        <style>{`
          html[data-vrt="true"] header {
            position: static !important;
            inset-inline-start: auto !important;
            inset-inline-end: auto !important;
            top: auto !important;
          }

          html[data-vrt="true"] main {
            padding-top: 0 !important;
          }

          html[data-vrt="true"] nav[aria-label="この使い方の目次"] {
            position: static !important;
            top: auto !important;
          }
        `}</style>
        <Story />
      </>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof HelpGuide>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("heading", { level: 1, name: "最初のシフト募集を始める" })).toBeVisible();
    await expect(canvas.getAllByRole("link", { name: "ヘルプ" })[0]).toHaveAttribute("href", "/help");
    await expect(canvas.getAllByRole("navigation", { name: "この使い方の目次" }).length).toBeGreaterThan(0);
    await expect(canvas.getByRole("link", { name: /利用を始めるとき、最初に何をしますか？/ })).toHaveAttribute(
      "href",
      "/help#first-steps",
    );
    await expect(canvas.getByRole("link", { name: /スタッフを追加する/ })).toHaveAttribute("href", "/help/add-staff");
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("heading", { level: 1, name: "最初のシフト募集を始める" })).toBeVisible();
    await expect(canvas.getByText(/初回セットアップ後、管理者自身で募集作成から希望提出/)).toBeVisible();
  },
};

export const NotFound: Story = {
  args: {
    slug: "not-found-guide",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("heading", { level: 1, name: "ヘルプが見つかりません" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "ヘルプへ戻る" })).toHaveAttribute("href", "/help");
  },
};

export const RelatedFromIncomingRelation: Story = {
  args: {
    slug: "check-notification-history",
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole("link", { name: /募集を作成すると、すぐにスタッフへ届きますか？/ }),
    ).toHaveAttribute("href", "/help#recruitment-notification-timing");
  },
};
