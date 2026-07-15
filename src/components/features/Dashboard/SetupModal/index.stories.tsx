import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { SetupModal } from "./index";

const meta = {
  title: "Features/Dashboard/SetupModal",
  component: SetupModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    isOpen: true,
    onOpenChange: () => {},
    onComplete: () => {},
    managerProfileDefaults: {
      name: "山田 太郎",
      email: "yamada@example.com",
    },
  },
} satisfies Meta<typeof SetupModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Step1: Story = {};

const getDialog = async (canvasElement: HTMLElement) => {
  const screen = within(canvasElement.ownerDocument.body);
  return within(await screen.findByRole("dialog"));
};

const inputShopName = async (dialog: ReturnType<typeof within>) => {
  await userEvent.type(await dialog.findByRole("textbox", { name: "お店の名前" }), "居酒屋たなか");
};

export const DateOnlySkipsSettings: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const dialog = await getDialog(canvasElement);
    const dateOnlyButton = dialog.getByRole("button", { pressed: true });
    await expect(dateOnlyButton).toHaveAttribute("aria-pressed", "true");
    await inputShopName(dialog);

    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));

    await expect(await dialog.findByRole("textbox", { name: "あなたの名前" })).toBeInTheDocument();
  },
};

export const TimeSettingsStep: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const dialog = await getDialog(canvasElement);
    await inputShopName(dialog);
    const timeButton = dialog.getByRole("button", { name: /時間指定/ });
    await userEvent.click(timeButton);
    await expect(timeButton).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));

    await expect(await dialog.findByRole("combobox", { name: "シフト開始時間" })).toBeInTheDocument();
  },
};

export const ShiftTypeSettingsStep: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const dialog = await getDialog(canvasElement);
    await inputShopName(dialog);
    const shiftTypeButton = dialog.getByRole("button", { name: /勤務区分/ });
    await userEvent.click(shiftTypeButton);
    await expect(shiftTypeButton).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));

    await expect(await dialog.findAllByRole("textbox", { name: "区分名" })).toHaveLength(2);
  },
};

export const InteractiveDoubleSubmitGuard: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: () => <GuardedSetupModalStory />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const dialog = await getDialog(canvasElement);
    await inputShopName(dialog);
    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));

    await dialog.findByRole("textbox", { name: "あなたの名前" });
    await userEvent.click(dialog.getByRole("checkbox", { name: /利用規約.*プライバシーポリシー.*同意/ }));
    await userEvent.dblClick(dialog.getByRole("button", { name: "お店を登録する" }));

    await waitFor(() => expect(screen.getByTestId("setup-complete-count")).toHaveTextContent("1"));
  },
};

function GuardedSetupModalStory() {
  const [completeCount, setCompleteCount] = useState(0);
  const { run: handleComplete, isRunning: isSubmitting } = useSingleFlight(async () => {
    setCompleteCount((count) => count + 1);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  return (
    <>
      <SetupModal
        isOpen={true}
        onOpenChange={() => {}}
        onComplete={handleComplete}
        isSubmitting={isSubmitting}
        managerProfileDefaults={{
          name: "山田 太郎",
          email: "yamada@example.com",
        }}
      />
      <output data-testid="setup-complete-count" hidden>
        {completeCount}
      </output>
    </>
  );
}
