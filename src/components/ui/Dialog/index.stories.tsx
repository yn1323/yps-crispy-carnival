import { Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { DeferredDialogBoundary } from "./DeferredDialogBoundary";
import { Dialog, useDialog } from "./index";

const meta = {
  title: "UI/Dialog",
  component: Dialog,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof Dialog>;

// 基本的なダイアログ（デフォルト表示）
const BasicExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <Dialog
      title="基本的なダイアログ"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={close}
      onSubmit={close}
      submitLabel="OK"
    >
      <Text>これは基本的なダイアログの例です。</Text>
    </Dialog>
  );
};

export const Basic: Story = {
  render: () => <BasicExample />,
};

// 確認ダイアログ（削除）
const DeleteExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <Dialog
      title="削除の確認"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={close}
      onSubmit={close}
      submitLabel="削除する"
      role="alertdialog"
      submitColorPalette="red"
    >
      <Text mb={2}>本当にこのアイテムを削除しますか？</Text>
      <Text fontSize="sm" color="gray.600">
        この操作は取り消せません。
      </Text>
    </Dialog>
  );
};

export const Delete: Story = {
  render: () => <DeleteExample />,
};

// 送信ボタンなし（閉じるだけ）
const InfoOnlyExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <Dialog title="お知らせ" isOpen={isOpen} onOpenChange={onOpenChange} onClose={close} closeLabel="閉じる">
      <Text>これは情報表示用のダイアログです。</Text>
      <Text fontSize="sm" color="gray.600" mt={2}>
        送信ボタンがない場合は閉じるボタンのみ表示されます。
      </Text>
    </Dialog>
  );
};

export const InfoOnly: Story = {
  render: () => <InfoOnlyExample />,
};

function LazyMountExample() {
  const { isOpen, open, close, onOpenChange } = useDialog(false);
  return (
    <>
      <button type="button" onClick={open}>
        遅延ダイアログを開く
      </button>
      <Dialog title="遅延mount確認" isOpen={isOpen} onOpenChange={onOpenChange} onClose={close} closeLabel="閉じる">
        <Text>初回open後にmountされる内容です。</Text>
      </Dialog>
    </>
  );
}

export const LazyMountBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <LazyMountExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await expect(page.queryByText("初回open後にmountされる内容です。")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "遅延ダイアログを開く" }));
    const dialog = await page.findByRole("dialog", { name: "遅延mount確認" });
    await expect(within(dialog).getByText("初回open後にmountされる内容です。")).toBeInTheDocument();

    const closeButtons = within(dialog).getAllByRole("button", { name: "閉じる" });
    await userEvent.click(closeButtons[closeButtons.length - 1]);
    await waitFor(() => expect(page.queryByRole("dialog", { name: "遅延mount確認" })).not.toBeInTheDocument());
    await expect(page.queryByText("初回open後にmountされる内容です。")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "遅延ダイアログを開く" }));
    const reopenedDialog = await page.findByRole("dialog", { name: "遅延mount確認" });
    await expect(within(reopenedDialog).getByText("初回open後にmountされる内容です。")).toBeInTheDocument();
  },
};

function DeferredContentExample() {
  const { isOpen, close, onOpenChange } = useDialog(true);
  const [isReady, setIsReady] = useState(false);
  const [deferred] = useState(() => {
    let resolve = () => {};
    const promise = new Promise<void>((next) => {
      resolve = next;
    });
    return { promise, resolve };
  });

  return (
    <>
      <button
        type="button"
        data-testid="complete-dialog-module-load"
        onClick={() => {
          setIsReady(true);
          deferred.resolve();
        }}
      >
        読み込みを完了
      </button>
      <DeferredDialogBoundary title="遅延ダイアログ" isOpen={isOpen} onOpenChange={onOpenChange} onClose={close}>
        <DeferredContent isReady={isReady} promise={deferred.promise} />
      </DeferredDialogBoundary>
    </>
  );
}

function DeferredContent({ isReady, promise }: { isReady: boolean; promise: Promise<void> }) {
  if (!isReady) throw promise;
  return <Text>遅延内容を表示しました。</Text>;
}

export const DeferredLoadingBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <DeferredContentExample />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const loadingDialog = await page.findByRole("dialog", { name: "遅延ダイアログ" });
    await expect(within(loadingDialog).getByLabelText("遅延ダイアログを読み込み中")).toBeInTheDocument();

    fireEvent.click(page.getByTestId("complete-dialog-module-load"));

    await expect(await page.findByText("遅延内容を表示しました。")).toBeInTheDocument();
    await expect(page.queryByLabelText("遅延ダイアログを読み込み中")).not.toBeInTheDocument();
  },
};

function DeferredErrorExample() {
  const { isOpen, close, onOpenChange } = useDialog(true);
  return (
    <DeferredDialogBoundary title="遅延ダイアログ" isOpen={isOpen} onOpenChange={onOpenChange} onClose={close}>
      <BrokenDeferredContent />
    </DeferredDialogBoundary>
  );
}

function BrokenDeferredContent(): never {
  throw new Error("Failed to fetch dynamically imported module");
}

export const DeferredErrorBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <DeferredErrorExample />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const errorDialog = await page.findByRole("dialog", { name: "遅延ダイアログ" });
    await expect(within(errorDialog).getByText("遅延ダイアログを表示できませんでした")).toBeInTheDocument();
    await expect(within(errorDialog).getByRole("button", { name: "ページを再読み込みする" })).toBeEnabled();

    const closeButtons = within(errorDialog).getAllByRole("button", { name: "閉じる" });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    await waitFor(() => expect(page.queryByRole("dialog", { name: "遅延ダイアログ" })).not.toBeInTheDocument());
  },
};
