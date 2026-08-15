import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { createDeferred } from "@/src/devtools/createDeferred";
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

const openDateOnlyManagerStep = async (canvasElement: HTMLElement) => {
  const dialog = await getDialog(canvasElement);
  const dateOnlyButton = dialog.getByRole("button", { pressed: true });
  await expect(dateOnlyButton).toHaveAttribute("aria-pressed", "true");
  await inputShopName(dialog);

  await userEvent.click(dialog.getByRole("button", { name: "次へ" }));

  await expect(await dialog.findByText("あなたの情報")).toBeInTheDocument();
  await expect(dialog.getByText(/最初の組織に支払い不要のBusinessが適用されます/)).toBeInTheDocument();
  const pricingLink = dialog.getByRole("link", { name: "料金とプランを確認する（新しいタブ）" });
  await expect(pricingLink).toHaveAttribute("href", "/pricing");
  await expect(pricingLink).toHaveAttribute("target", "_blank");
  await expect(pricingLink).toHaveAttribute("rel", "noreferrer");
  await expect(dialog.getByRole("textbox", { name: "シフト連絡先メールアドレス" })).toBeInTheDocument();
};

export const DateOnlySkipsSettings: Story = {
  play: async ({ canvasElement }) => openDateOnlyManagerStep(canvasElement),
};

export const DateOnlySkipsSettingsMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  play: async ({ canvasElement }) => openDateOnlyManagerStep(canvasElement),
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
    const dialogElement = screen.getByRole("dialog", { name: "初回登録" });
    await inputShopName(dialog);
    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));

    await dialog.findByRole("textbox", { name: "あなたの名前" });
    await userEvent.click(dialog.getByRole("checkbox", { name: /利用規約.*プライバシーポリシー.*同意/ }));
    const submit = dialog.getByRole("button", { name: "お店を登録して利用を開始" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await expect(await screen.findByTestId("setup-complete-count")).toHaveTextContent("1");
    await expect(dialogElement).toHaveAttribute("aria-busy", "true");
    await expect(submit).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "戻る" })).toBeDisabled();
    await expect(dialog.queryByLabelText("閉じる")).not.toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    fireEvent.pointerDown(canvasElement.ownerDocument.body);
    fireEvent.click(canvasElement.ownerDocument.body);
    await expect(dialogElement).toBeVisible();

    fireEvent.click(screen.getByTestId("release-setup-completion"));
    await waitFor(() => {
      expect(submit).toBeEnabled();
      expect(dialog.getByRole("button", { name: "戻る" })).toBeEnabled();
      expect(dialogElement).not.toHaveAttribute("aria-busy");
    });
  },
};

function GuardedSetupModalStory() {
  const [completeCount, setCompleteCount] = useState(0);
  const pendingCompletion = useRef<ReturnType<typeof createDeferred> | null>(null);
  const { run: handleComplete, isRunning: isSubmitting } = useSingleFlight(async () => {
    setCompleteCount((count) => count + 1);
    const completion = createDeferred();
    pendingCompletion.current = completion;
    await completion.promise;
    if (pendingCompletion.current === completion) pendingCompletion.current = null;
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
      {completeCount > 0 ? (
        <output data-testid="setup-complete-count" hidden>
          {completeCount}
        </output>
      ) : null}
      <button
        type="button"
        hidden
        data-testid="release-setup-completion"
        onClick={() => pendingCompletion.current?.resolve()}
      >
        店舗登録処理を完了する
      </button>
    </>
  );
}
