import type { Meta, StoryObj } from "@storybook/react-vite";
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
