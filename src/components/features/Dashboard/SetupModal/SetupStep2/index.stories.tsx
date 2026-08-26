import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import type { SetupCompletionResult } from "../types";
import { SetupStep2, type Step2Data } from "./index.tsx";

const completeSetup = async (_data: Step2Data): Promise<SetupCompletionResult> => ({ kind: "completed" });

const meta = {
  title: "Features/Dashboard/SetupModal/SetupStep2",
  component: SetupStep2,
  parameters: {
    layout: "padded",
  },
  args: {
    onSubmit: completeSetup,
    onVerifyPromotionCode: async () => true,
  },
} satisfies Meta<typeof SetupStep2>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const PrefilledFromAuth: Story = {
  args: {
    defaultValues: {
      name: "山田 太郎",
      email: "yamada@example.com",
    },
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  args: {
    defaultValues: {
      name: "山田 太郎",
      email: "yamada@example.com",
    },
  },
};

const applyPromotionCode = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "プロモーションコードお持ちの方はこちら" }));
  const input = canvas.getByRole("textbox", { name: "プロモーションコード（任意）" });
  await userEvent.type(input, "ab12cd");
  await userEvent.click(canvas.getByRole("button", { name: "適用" }));
  await expect(await canvas.findByText("無料のProプランを適用")).toBeVisible();
};

export const PromotionCodeApplied: Story = {
  args: {
    defaultValues: {
      name: "山田 太郎",
      email: "yamada@example.com",
    },
  },
  play: async ({ canvasElement }) => applyPromotionCode(canvasElement),
};

export const PromotionCodeAppliedMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  args: {
    defaultValues: {
      name: "山田 太郎",
      email: "yamada@example.com",
    },
  },
  play: async ({ canvasElement }) => applyPromotionCode(canvasElement),
};
