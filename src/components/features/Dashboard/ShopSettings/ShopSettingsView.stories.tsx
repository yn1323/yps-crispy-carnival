import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/src/components/ui/Button";
import { createDeferred } from "@/src/devtools/createDeferred";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { ShopSettingsView } from "./ShopSettingsView";

const shop = {
  name: "居酒屋たなか",
  regularClosedDays: ["sun" as const],
  submissionPattern: { kind: "dateOnly" as const },
};

const closedDialog = {
  isOpen: false,
  onOpenChange: () => {},
  close: () => {},
};

const meta = {
  title: "Features/Dashboard/ShopSettings",
  component: ShopSettingsView,
  parameters: { layout: "fullscreen" },
  args: {
    children: null,
    shop,
    dialog: { ...closedDialog, isOpen: true },
    isReadOnly: false,
    isUpdating: false,
    onUpdate: () => {},
  },
} satisfies Meta<typeof ShopSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DialogReady: Story = {};

export const DialogReadyMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const SubmitCloseLockBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ShopSettingsHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "店舗設定を開く" }));
    const dialogElement = await body.findByRole("dialog", { name: "店舗設定" });
    const dialog = within(dialogElement);

    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));
    await dialog.findByText("シフトの提出方法");
    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));
    await dialog.findByText("現在の設定: 毎週 日");

    const submit = dialog.getByRole("button", { name: "変更を保存" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await expect(await canvas.findByTestId("shop-settings-submit-count")).toHaveTextContent("1");
    await expect(dialogElement).toHaveAttribute("aria-busy", "true");
    await expect(submit).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "戻る" })).toBeDisabled();
    await expect(dialog.queryByLabelText("閉じる")).not.toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    fireEvent.pointerDown(canvasElement.ownerDocument.body);
    fireEvent.click(canvasElement.ownerDocument.body);
    await expect(dialogElement).toBeVisible();

    fireEvent.click(canvas.getByTestId("release-shop-settings-submission"));
    await waitFor(() => expect(body.queryByRole("dialog", { name: "店舗設定" })).not.toBeInTheDocument());
  },
};

function ShopSettingsHarness() {
  const [isOpen, setIsOpen] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const pendingSubmission = useRef<ReturnType<typeof createDeferred> | null>(null);
  const { run: updateSettings, isRunning: isUpdating } = useSingleFlight(async () => {
    setSubmitCount((count) => count + 1);
    const submission = createDeferred();
    pendingSubmission.current = submission;
    await submission.promise;
    if (pendingSubmission.current === submission) pendingSubmission.current = null;
    setIsOpen(false);
  });
  const close = () => setIsOpen(false);

  return (
    <>
      <output hidden data-testid="shop-settings-submit-count">
        {submitCount}
      </output>
      <button
        type="button"
        hidden
        data-testid="release-shop-settings-submission"
        onClick={() => pendingSubmission.current?.resolve()}
      >
        店舗設定の更新を完了する
      </button>
      <ShopSettingsView
        shop={shop}
        dialog={{ isOpen, onOpenChange: ({ open }) => setIsOpen(open), close }}
        isReadOnly={false}
        isUpdating={isUpdating}
        onUpdate={updateSettings}
      >
        <Button type="button" onClick={() => setIsOpen(true)}>
          店舗設定を開く
        </Button>
      </ShopSettingsView>
    </>
  );
}
