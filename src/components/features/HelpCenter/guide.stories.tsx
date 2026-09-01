import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { HelpGuide } from "./HelpGuide";
import { faqMetas } from "./helpMeta";

const meta = {
  title: "Features/HelpCenter/Guide",
  component: HelpGuide,
  args: {
    slug: "resolve-action-inbox",
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

    await expect(
      await canvas.findByRole("heading", { level: 1, name: "「要対応」ページの使い方" }, { timeout: 10_000 }),
    ).toBeVisible();
    await expect(canvas.getAllByRole("link", { name: "ヘルプ・使い方" })[0]).toHaveAttribute("href", "/help");
    await expect(canvas.getByRole("link", { name: "その他困りごと" })).toHaveAttribute(
      "href",
      "/help/tasks/troubleshooting",
    );
    await expect(canvas.getAllByRole("navigation", { name: "この使い方の目次" }).length).toBeGreaterThan(0);
    await expect(canvas.getByRole("link", { name: "スタッフの参加申請を承認・却下する" })).toHaveAttribute(
      "href",
      "/help/review-staff-registration-request",
    );
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole("heading", { level: 1, name: "「要対応」ページの使い方" }, { timeout: 10_000 }),
    ).toBeVisible();
    await expect(canvas.getByText(/管理者の判断や操作が必要な項目を種類ごとに確認できます/)).toBeVisible();
  },
};

export const HomeScreenAccessMobile: Story = {
  args: {
    slug: "open-shiftori-from-home-screen",
  },
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    screenshot: {
      mask: { selector: "video", color: "#f7fafc" },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole(
        "heading",
        { level: 1, name: "スマホのホーム画面からシフトリを開く" },
        { timeout: 10_000 },
      ),
    ).toBeVisible();
    const video = canvas.getByLabelText("iPhoneのSafariからホーム画面にシフトリを追加するの動画");
    await expect(video).toHaveAttribute("controls");
    await expect(video).toHaveAttribute("playsinline");
    await expect(video).toHaveAttribute("preload", "metadata");
    await expect(video).toHaveAttribute("width", "720");
    await expect(video).toHaveAttribute("height", "1518");
    await expect(canvas.getByRole("button", { name: "iPhone x Chromeの場合" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(canvas.getByRole("button", { name: "Android x Chromeの場合" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  },
};

export const HomeScreenAccessAccordionInteractions: Story = {
  args: {
    slug: "open-shiftori-from-home-screen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const iphoneTrigger = await canvas.findByRole("button", { name: "iPhone x Chromeの場合" }, { timeout: 10_000 });
    await userEvent.click(iphoneTrigger);
    await expect(iphoneTrigger).toHaveAttribute("aria-expanded", "true");
    await waitFor(async () => {
      await expect(canvas.getByRole("img", { name: "iPhone版Chromeの共有ボタンを矢印で示した画面" })).toBeVisible();
      await expect(
        canvas.getByRole("img", { name: "iPhone版Chromeのメニューにあるホーム画面に追加を矢印で示した画面" }),
      ).toBeVisible();
    });

    const androidTrigger = canvas.getByRole("button", { name: "Android x Chromeの場合" });
    await userEvent.click(androidTrigger);
    await expect(androidTrigger).toHaveAttribute("aria-expanded", "true");
    await waitFor(async () => {
      await expect(
        canvas.getByRole("img", { name: "Android版Chromeの縦三点メニューを矢印で示した画面" }),
      ).toBeVisible();
      await expect(
        canvas.getByRole("img", { name: "Android版Chromeのメニューにあるホーム画面に追加を矢印で示した画面" }),
      ).toBeVisible();
    });
  },
};

export const NotFound: Story = {
  args: {
    slug: "not-found-guide",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("heading", { level: 1, name: "ヘルプが見つかりません" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "ヘルプ・使い方へ戻る" })).toHaveAttribute("href", "/help");
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
    const recruitmentNotificationFaq = faqMetas.find(({ id }) => id === "recruitment-notification-timing");
    if (!recruitmentNotificationFaq) {
      throw new Error("Guide Storyにはrecruitment-notification-timing FAQが必要です");
    }

    await expect(
      await canvas.findByRole("link", { name: recruitmentNotificationFaq.title }, { timeout: 10_000 }),
    ).toHaveAttribute("href", recruitmentNotificationFaq.href);
  },
};
