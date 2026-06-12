import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  findByText,
  findByTitle,
  getAllByText,
  getByRole,
  getByText,
  queryByRole,
  queryByText,
  waitFor,
} from "@testing-library/dom";
import { expect } from "storybook/test";
import { ShiftoriDemoFlow } from "./index";

const meta = {
  title: "Features/Demo/ShiftoriDemoFlow",
  component: ShiftoriDemoFlow,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftoriDemoFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flow: Story = {
  args: {
    initialStep: "recruit",
  },
};

export const RecruitStepSimplifiedBehavior: Story = {
  args: {
    initialStep: "recruit",
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  play: async ({ canvasElement }) => {
    expect(getByText(canvasElement, "シフト期間を選択")).toBeTruthy();
    expect(queryByRole(canvasElement, "button", { name: "キャンセル" })).toBeNull();
    expect(queryByRole(canvasElement, "button", { name: "次へ" })).toBeNull();
    expect(queryByText(canvasElement, "お休み")).toBeNull();
    expect(queryByText(canvasElement, "提出期限")).toBeNull();
    expect(queryByText(canvasElement, "確認")).toBeNull();
    expect(canvasElement.textContent).not.toContain("締切");

    getByRole(canvasElement, "button", { name: "募集をつくる" }).click();
    await findByText(canvasElement, "シフトを提出してみよう");
  },
};

export const SubmitStepDefaultRestBehavior: Story = {
  args: {
    initialStep: "submit",
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  play: async ({ canvasElement }) => {
    expect(getAllByText(canvasElement, "休み")).toHaveLength(7);
    expect(queryByText(canvasElement, "10:00")).toBeNull();
    expect(queryByText(canvasElement, "11:00")).toBeNull();
    expect(queryByText(canvasElement, "15:00")).toBeNull();
  },
};

export const ShareCompleteCtaBehavior: Story = {
  args: {
    initialStep: "share",
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  play: async ({ canvasElement }) => {
    const emailFrame = (await findByTitle(canvasElement, "確定シフトメール")) as HTMLIFrameElement;
    const emailLink = await waitFor(() => {
      const link = emailFrame.contentDocument?.querySelector<HTMLAnchorElement>("a[href]");
      if (!link) throw new Error("確定シフトメール内のリンクが見つかりませんでした");
      return link;
    });

    emailLink.click();

    await findByText(document.body, "このまま無料で始められます");
    expect(queryByText(document.body, "スタッフ登録なしで、募集作成から共有まで試せます。")).toBeNull();
    expect(getByRole(document.body, "link", { name: /無料ではじめる/ })).toBeTruthy();
    expect(getByRole(document.body, "button", { name: "もう1回試す" })).toBeTruthy();
    expect(getByRole(document.body, "button", { name: "デモを閉じる" })).toBeTruthy();
  },
};

export const SubmitStep: Story = {
  args: {
    initialStep: "submit",
  },
};

export const AdjustStep: Story = {
  args: {
    initialStep: "adjust",
  },
};

export const ShareStep: Story = {
  args: {
    initialStep: "share",
  },
};
