import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { faqEntries } from "./faqContent";
import { HelpIndex } from "./HelpIndex";
import { getGuideMeta } from "./helpMeta";
import { HELP_TASKS } from "./helpTasks";

const meta = {
  title: "Features/HelpCenter/Index",
  component: HelpIndex,
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
        `}</style>
        <Story />
      </>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof HelpIndex>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("heading", { level: 1, name: "ヘルプ" })).toBeVisible();
    for (const task of HELP_TASKS) {
      await expect(canvas.getByRole("link", { name: new RegExp(task.title) })).toHaveAttribute(
        "href",
        `#task-${task.id}`,
      );
    }
    await expect(canvas.getByRole("searchbox", { name: "ヘルプを検索" })).toBeVisible();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const SearchWithoutResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = await canvas.findByRole("searchbox", { name: "ヘルプを検索" });

    await userEvent.type(search, "一致しない検索語xyz");
    await expect(await canvas.findByText("該当するヘルプが見つかりません")).toBeVisible();

    const clearButtons = canvas.getAllByRole("button", { name: "検索をクリア" });
    await userEvent.click(clearButtons[0]);
    await expect(search).toHaveValue("");
    await expect(search).toHaveFocus();
  },
};

export const Search: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = await canvas.findByRole("searchbox", { name: "ヘルプを検索" });

    await userEvent.type(search, "スタッフ 追加");

    await expect(await canvas.findByRole("heading", { level: 2, name: /よくある質問/ })).toBeVisible();
    await expect(canvas.getByRole("button", { name: /スタッフを追加する方法は？/ })).toBeVisible();
    await expect(canvas.getByRole("heading", { level: 2, name: /詳しい使い方/ })).toBeVisible();
    await expect(canvas.getByRole("link", { name: /スタッフを追加する/ })).toHaveAttribute("href", "/help/add-staff");
  },
};

export const FaqHashOpen: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const entry = faqEntries.find(({ meta: entryMeta }) => entryMeta.id === "add-staff-methods");
    if (!entry) throw new Error("FAQ hash storyにはadd-staff-methodsが必要です");

    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${entry.meta.id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    const trigger = await canvas.findByRole("button", { name: new RegExp(entry.meta.title) });
    await waitFor(async () => {
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(trigger).toHaveFocus();
    });
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  },
};

export const FaqExpanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const entry = faqEntries[0];
    if (!entry) throw new Error("FAQ storyには公開中のFAQが1件以上必要です");

    const trigger = await canvas.findByRole("button", { name: new RegExp(entry.meta.title) });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await waitFor(async () => {
      await expect(canvas.getByText(entry.meta.summary)).toBeVisible();
    });
    if (entry.meta.primaryGuide) {
      const primaryGuide = getGuideMeta(entry.meta.primaryGuide);
      if (!primaryGuide) throw new Error(`FAQ「${entry.meta.id}」のprimaryGuideが見つかりません`);
      await expect(canvas.getByRole("link", { name: `「${primaryGuide.title}」を見る` })).toHaveAttribute(
        "href",
        `/help/${entry.meta.primaryGuide}`,
      );
    }
  },
};

export const FaqRelatedHelp: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole("button", {
      name: /募集を作成すると、すぐにスタッフへ届きますか？/,
    });

    await userEvent.click(trigger);
    await waitFor(async () => {
      await expect(canvas.getByRole("link", { name: "スタッフへの通知履歴を確認する" })).toHaveAttribute(
        "href",
        "/help/check-notification-history",
      );
    });
  },
};
