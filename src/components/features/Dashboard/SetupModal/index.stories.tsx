import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { createDeferred } from "@/src/devtools/createDeferred";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { type SetupCompletionResult, type SetupData, SetupModal } from "./index";
import { createPromotionCodeAttemptLimit } from "./promotionCodeAttemptLimit";

const completeSetup = async (_data: SetupData): Promise<SetupCompletionResult> => ({ kind: "completed" });

const meta = {
  title: "Features/Dashboard/SetupModal",
  component: SetupModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    isOpen: true,
    onOpenChange: () => {},
    onComplete: completeSetup,
    onVerifyPromotionCode: async () => true,
    managerProfileDefaults: {
      name: "山田 太郎",
      email: "yamada@example.com",
    },
  },
  beforeEach: () => {
    createPromotionCodeAttemptLimit().reset();
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
  await expect(dialog.getByRole("textbox", { name: "シフト通知先メールアドレス" })).toBeInTheDocument();
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

const showLegalValidationError = async (canvasElement: HTMLElement) => {
  const dialog = await getDialog(canvasElement);
  await inputShopName(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "次へ" }));
  await userEvent.click(dialog.getByRole("button", { name: "利用開始" }));
  await expect(await dialog.findByText("利用規約とプライバシーポリシーに同意してください。")).toBeVisible();
};

export const LegalValidationError: Story = {
  play: async ({ canvasElement }) => showLegalValidationError(canvasElement),
};

export const LegalValidationErrorMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  play: async ({ canvasElement }) => showLegalValidationError(canvasElement),
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

export const PromotionCodeValidationAndNormalization: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  args: {
    onComplete: fn(async () => ({ kind: "completed" as const })),
    onVerifyPromotionCode: fn(async () => true),
  },
  play: async ({ args, canvasElement }) => {
    const dialog = await getDialog(canvasElement);
    await inputShopName(dialog);
    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));
    await userEvent.click(dialog.getByRole("checkbox", { name: /利用規約.*プライバシーポリシー.*同意/ }));
    await expect(dialog.queryByRole("textbox", { name: "プロモーションコード（任意）" })).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "プロモーションコードお持ちの方はこちら" }));

    const promotionCode = dialog.getByRole("textbox", { name: "プロモーションコード（任意）" });
    await userEvent.type(promotionCode, "ABC-12");
    await expect(dialog.getByRole("button", { name: "利用開始" })).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "適用" }));
    await expect(await dialog.findByText("プロモーションコードは6桁の英数字で入力してください。")).toBeVisible();
    await expect(args.onVerifyPromotionCode).not.toHaveBeenCalled();
    await expect(args.onComplete).not.toHaveBeenCalled();

    await userEvent.clear(promotionCode);
    await userEvent.type(promotionCode, " ab12cd ");
    await userEvent.click(dialog.getByRole("button", { name: "適用" }));
    await expect(args.onVerifyPromotionCode).toHaveBeenCalledWith("AB12CD");
    await expect(promotionCode).toHaveValue("AB12CD");
    await expect(promotionCode).toHaveAttribute("readonly");
    await expect(dialog.getByText("無料のProプランを適用")).toBeVisible();
    await expect(dialog.queryByRole("button", { name: "入力をやめる" })).not.toBeInTheDocument();

    await userEvent.click(dialog.getByRole("button", { name: "戻る" }));
    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));
    await expect(dialog.getByText("無料のProプランを適用")).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "プロモーションコード（任意）" })).toHaveAttribute("readonly");
    await expect(dialog.queryByRole("button", { name: "入力をやめる" })).not.toBeInTheDocument();

    await userEvent.click(dialog.getByRole("button", { name: "変更する" }));
    await expect(dialog.getByRole("textbox", { name: "プロモーションコード（任意）" })).not.toHaveAttribute("readonly");
    await expect(dialog.getByRole("button", { name: "利用開始" })).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "適用" }));
    await userEvent.click(dialog.getByRole("button", { name: "利用開始" }));
    await expect(args.onComplete).toHaveBeenCalledWith(expect.objectContaining({ promotionCode: "AB12CD" }));
  },
};

export const PromotionCodeRevalidationFailure: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  args: {
    onComplete: fn(async () => ({ kind: "promotionCodeInvalid" as const })),
    onVerifyPromotionCode: fn(async () => true),
  },
  play: async ({ canvasElement }) => {
    const dialog = await getDialog(canvasElement);
    await inputShopName(dialog);
    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));
    await userEvent.click(dialog.getByRole("checkbox", { name: /利用規約.*プライバシーポリシー.*同意/ }));
    await userEvent.click(dialog.getByRole("button", { name: "プロモーションコードお持ちの方はこちら" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "プロモーションコード（任意）" }), "ABC123");
    await userEvent.click(dialog.getByRole("button", { name: "適用" }));
    await expect(await dialog.findByText("無料のProプランを適用")).toBeVisible();
    const submit = dialog.getByRole("button", { name: "利用開始" });
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.click(submit);

    const promotionCode = dialog.getByRole("textbox", { name: "プロモーションコード（任意）" });
    await expect(await dialog.findByText("コードが誤っています。")).toBeVisible();
    await expect(promotionCode).not.toHaveAttribute("readonly");
    await waitFor(() => expect(submit).toBeDisabled());

    // 最終照合で失敗しても、同じ画面で再適用できる。
    await userEvent.click(dialog.getByRole("button", { name: "適用" }));
    await expect(await dialog.findByText("無料のProプランを適用")).toBeVisible();
  },
};

export const PromotionCodeAttemptLockout: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  args: {
    onComplete: fn(async () => ({ kind: "completed" as const })),
    onVerifyPromotionCode: fn(async () => false),
  },
  play: async ({ args, canvasElement }) => {
    const dialog = await getDialog(canvasElement);
    await inputShopName(dialog);
    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));
    await userEvent.click(dialog.getByRole("checkbox", { name: /利用規約.*プライバシーポリシー.*同意/ }));
    await userEvent.click(dialog.getByRole("button", { name: "プロモーションコードお持ちの方はこちら" }));

    const promotionCode = dialog.getByRole("textbox", { name: "プロモーションコード（任意）" });
    await userEvent.type(promotionCode, "ZZ9999");
    const apply = dialog.getByRole("button", { name: "適用" });
    await userEvent.click(apply);
    await expect(await dialog.findByText("コードが誤っています。")).toBeVisible();
    await waitFor(() => expect(promotionCode).toBeEnabled());
    await expect(dialog.queryByText(/残り\d+回/)).not.toBeInTheDocument();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await userEvent.click(apply);
      await waitFor(() => {
        expect(args.onVerifyPromotionCode).toHaveBeenCalledTimes(attempt + 2);
        expect(promotionCode).toBeEnabled();
      });
    }
    await expect(dialog.getByText("コードが誤っています。")).toBeVisible();
    await expect(dialog.queryByText(/残り\d+回/)).not.toBeInTheDocument();

    await userEvent.click(apply);

    await expect(
      await dialog.findByText("プロモーションコードの確認回数が上限に達しました。10分後にもう一度お試しください。"),
    ).toBeVisible();
    await expect(promotionCode).toBeDisabled();
    await expect(promotionCode).toHaveValue("");
    const storage = canvasElement.ownerDocument.defaultView?.sessionStorage;
    const storedEntries = Array.from({ length: storage?.length ?? 0 }, (_, index) => {
      const key = storage?.key(index) ?? "";
      return `${key}:${storage?.getItem(key) ?? ""}`;
    });
    await expect(storedEntries.join("\n")).not.toContain("ZZ9999");
    await expect(args.onVerifyPromotionCode).toHaveBeenCalledTimes(10);
    await expect(args.onComplete).not.toHaveBeenCalled();

    await userEvent.click(dialog.getByRole("button", { name: "入力をやめる" }));
    await expect(dialog.queryByRole("textbox", { name: "プロモーションコード（任意）" })).not.toBeInTheDocument();
    await expect(dialog.getByRole("button", { name: "プロモーションコードお持ちの方はこちら" })).toHaveFocus();
    await userEvent.click(dialog.getByRole("button", { name: "利用開始" }));
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
    await expect(args.onComplete).toHaveBeenLastCalledWith(expect.objectContaining({ promotionCode: undefined }));
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
    const submit = dialog.getByRole("button", { name: "利用開始" });
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
    return { kind: "completed" } as const;
  });

  return (
    <>
      <SetupModal
        isOpen={true}
        onOpenChange={() => {}}
        onComplete={handleComplete}
        onVerifyPromotionCode={async () => true}
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
