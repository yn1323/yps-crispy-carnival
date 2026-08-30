import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { HelpIndex } from "./HelpIndex";
import { SHIFT_MANAGEMENT_SCENARIO } from "./helpScenario";
import { getHelpTaskHref, HELP_TASKS } from "./helpTasks";
import { ORGANIZATION_STRUCTURE_HELP } from "./organizationStructureHelp";

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

    await expect(await canvas.findByRole("heading", { level: 1, name: "ヘルプ・使い方" })).toBeVisible();
    await expect(canvas.getByRole("searchbox", { name: "キーワードで検索" })).toBeVisible();
    const organizationStructureCard = canvas.getByRole("link", { name: ORGANIZATION_STRUCTURE_HELP.cardTitle });
    await expect(organizationStructureCard).toHaveAttribute("href", ORGANIZATION_STRUCTURE_HELP.href);
    const scenarioCard = canvas.getByRole("link", { name: SHIFT_MANAGEMENT_SCENARIO.cardTitle });
    await expect(scenarioCard).toHaveAttribute("href", SHIFT_MANAGEMENT_SCENARIO.href);
    const scenarioCardContent = within(scenarioCard);
    await expect(scenarioCardContent.getByText("管理者")).toBeVisible();
    await expect(scenarioCardContent.getByText("スタッフ")).toBeVisible();
    const basicLinks = within(canvas.getByRole("region", { name: "基本の使い方を見る" })).getAllByRole("link");
    await expect(basicLinks[0]).toHaveAttribute("href", SHIFT_MANAGEMENT_SCENARIO.href);
    await expect(basicLinks[1]).toHaveAttribute("href", ORGANIZATION_STRUCTURE_HELP.href);
    for (const task of HELP_TASKS) {
      await expect(canvas.getByRole("link", { name: task.title })).toHaveAttribute("href", getHelpTaskHref(task.id));
    }
    await expect(canvas.queryByRole("heading", { level: 2, name: "よくある質問" })).not.toBeInTheDocument();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const basicLinks = within(canvas.getByRole("region", { name: "基本の使い方を見る" })).getAllByRole("link");
    await expect(within(basicLinks[0]).getByText(SHIFT_MANAGEMENT_SCENARIO.cardDescription)).not.toBeVisible();
    await expect(within(basicLinks[1]).getByText(ORGANIZATION_STRUCTURE_HELP.cardDescription)).not.toBeVisible();

    for (const task of HELP_TASKS) {
      const taskDescription = within(canvas.getByRole("link", { name: task.title })).getByText(task.description);
      await expect(taskDescription, `${task.title}の説明文`).not.toBeVisible();
    }
  },
};

export const SearchWithoutResults: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = await canvas.findByRole("searchbox", { name: "キーワードで検索" });

    await userEvent.type(search, "一致しない検索語xyz");
    await expect(await canvas.findByText("該当するヘルプが見つかりません")).toBeVisible();
    await expect(canvas.queryByRole("link", { name: HELP_TASKS[0].title })).not.toBeInTheDocument();

    const clearButtons = canvas.getAllByRole("button", { name: "検索をクリア" });
    await userEvent.click(clearButtons[0]);
    await expect(search).toHaveValue("");
    await expect(search).toHaveFocus();
    await expect(await canvas.findByRole("link", { name: HELP_TASKS[0].title })).toBeVisible();
  },
};

export const Search: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = await canvas.findByRole("searchbox", { name: "キーワードで検索" });

    await userEvent.type(search, "スタッフ 追加");

    await expect(canvas.queryByRole("link", { name: HELP_TASKS[0].title })).not.toBeInTheDocument();
    await expect(await canvas.findByRole("heading", { level: 2, name: /よくある質問/ })).toBeVisible();
    await expect(canvas.getByRole("link", { name: /スタッフを追加する方法は？/ })).toHaveAttribute(
      "href",
      "/help/tasks/staff-management#add-staff-methods",
    );
    await expect(canvas.getByRole("heading", { level: 2, name: /使い方/ })).toBeVisible();
    await expect(canvas.getByRole("link", { name: /スタッフの参加申請を承認・却下する/ })).toHaveAttribute(
      "href",
      "/help/review-staff-registration-request",
    );
  },
};
