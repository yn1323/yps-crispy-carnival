import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
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
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByRole("button", { name: "キャンセル" })).not.toBeInTheDocument();
    expect(canvas.queryByRole("button", { name: "次へ" })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "募集をつくる" }));
    await expect(await canvas.findByText("シフトを提出してみよう")).toBeInTheDocument();
  },
};

export const ShareCompleteCtaBehavior: Story = {
  args: {
    initialStep: "share",
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);
    const emailFrame = (await canvas.findByTitle("確定シフトメール")) as HTMLIFrameElement;
    const emailBody = await waitFor(() => {
      const body = emailFrame.contentDocument?.body;
      if (!body) throw new Error("確定シフトメールが読み込まれていません");
      return body;
    });
    const emailLink = await within(emailBody).findByRole("link", { name: "全員のシフトを確認する" });

    await userEvent.click(emailLink);

    await expect(await screen.findByRole("link", { name: /無料ではじめる/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "もう1回試す" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "デモを閉じる" })).toBeInTheDocument();
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
