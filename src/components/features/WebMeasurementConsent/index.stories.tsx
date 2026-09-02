import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { WebMeasurementConsentView } from "./WebMeasurementConsentView";

const meta = {
  title: "Features/WebMeasurementConsent",
  component: InteractiveConsent,
  decorators: [
    (Story) => (
      <Box minH="420px" bg="gray.50" p={6}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof InteractiveConsent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Prompt: Story = {
  args: { initialStatus: "prompt" },
};

export const Granted: Story = {
  args: { initialStatus: "granted" },
};

export const MobilePrompt: Story = {
  args: Prompt.args,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  tags: ["vrt-mobile1"],
};

function InteractiveConsent({ initialStatus = "prompt" }: { initialStatus?: "prompt" | "granted" | "denied" }) {
  const [status, setStatus] = useState<"prompt" | "granted" | "denied">(initialStatus);
  if (status === "prompt") {
    return (
      <WebMeasurementConsentView
        mode="prompt"
        onDeny={() => setStatus("denied")}
        onGrant={() => setStatus("granted")}
      />
    );
  }
  return <WebMeasurementConsentView mode="settled" decision={status} onOpenSettings={() => setStatus("prompt")} />;
}

export const ChangeDecision: Story = {
  args: Prompt.args,
  render: () => <InteractiveConsent />,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "許可する" }));
    const settings = await canvas.findByRole("button", { name: "アクセス解析設定（現在は許可）" });
    await userEvent.click(settings);
    await expect(await canvas.findByRole("region", { name: "アクセス解析の設定" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "許可しない" }));
    await expect(await canvas.findByRole("button", { name: "アクセス解析設定（現在は不許可）" })).toBeVisible();
  },
};
