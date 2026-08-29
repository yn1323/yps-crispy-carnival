import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { faqEntries } from "./faqContent";
import { HelpTask } from "./HelpTask";
import { getGuideMeta } from "./helpMeta";
import { getHelpTask } from "./helpTasks";

const meta = {
  title: "Features/HelpCenter/Task",
  component: HelpTask,
  args: {
    taskId: "staff-management",
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
        `}</style>
        <Story />
      </>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof HelpTask>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const task = getHelpTask("staff-management");
    const selectedFaq = faqEntries.find(({ meta: entryMeta }) => entryMeta.task === task?.id);
    if (!task || !selectedFaq) throw new Error("task Storyに必要なヘルプが見つかりません");

    await expect(await canvas.findByRole("heading", { level: 1, name: task.title })).toBeVisible();
    await expect(canvas.getByRole("heading", { level: 2, name: "よくある質問" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: new RegExp(selectedFaq.meta.title) })).toBeVisible();
    await expect(canvas.getByRole("heading", { level: 2, name: "使い方" })).toBeVisible();
    if (selectedFaq.meta.primaryGuide) {
      const guide = getGuideMeta(selectedFaq.meta.primaryGuide);
      if (!guide) throw new Error("task Storyの使い方が見つかりません");
      await expect(canvas.getByRole("link", { name: new RegExp(guide.title) })).toHaveAttribute("href", guide.href);
    }
    await expect(canvas.getByRole("link", { name: "ヘルプTOPに戻る" })).toHaveAttribute("href", "/help");
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const FaqExpanded: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const entry = faqEntries.find(({ meta: entryMeta }) => entryMeta.task === "staff-management");
    if (!entry) throw new Error("FAQ Storyにはstaff-managementのFAQが必要です");

    const trigger = await canvas.findByRole("button", { name: new RegExp(entry.meta.title) });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const item = trigger.closest('[data-part="item"]');
    if (!item) throw new Error(`FAQ「${entry.meta.id}」の項目が見つかりません`);
    await waitFor(async () => {
      await expect(item).toHaveTextContent(entry.meta.summary.split("。 ")[0]);
    });
    if (entry.meta.primaryGuide) {
      const primaryGuide = getGuideMeta(entry.meta.primaryGuide);
      if (!primaryGuide) throw new Error(`FAQ「${entry.meta.id}」のprimaryGuideが見つかりません`);
      await expect(canvas.getByRole("link", { name: `「${primaryGuide.title}」を見る` })).toHaveAttribute(
        "href",
        primaryGuide.href,
      );
    }
  },
};

export const FaqHashOpen: Story = {
  args: {
    taskId: "shift-building",
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const entry = faqEntries.find(({ meta: entryMeta }) => entryMeta.id === "build-before-submissions-complete");
    if (!entry) throw new Error("FAQ hash Storyにはbuild-before-submissions-completeが必要です");

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

export const NotFound: Story = {
  args: {
    taskId: "unknown-task",
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("heading", { level: 1, name: "やりたいことが見つかりません" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "ヘルプへ戻る" })).toHaveAttribute("href", "/help");
  },
};
