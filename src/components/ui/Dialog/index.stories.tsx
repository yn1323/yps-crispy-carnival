import { Box, Input, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/src/components/ui/Button";
import { DeferredDialogBoundary } from "./DeferredDialogBoundary";
import { Dialog, DialogActionArea, useDialog } from "./index";

const meta = {
  title: "UI/Dialog",
  component: Dialog,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof Dialog>;

const DesktopStandardExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <Dialog
      title="所属スタッフを変更"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={close}
      onSubmit={close}
      submitLabel="変更する"
      actionLayout="standard"
    >
      <Text>選択したスタッフの所属を変更します。</Text>
    </Dialog>
  );
};

export const DesktopStandard: Story = {
  render: () => <DesktopStandardExample />,
};

const DesktopFlowExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <Dialog
      title="設定を確認"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={close}
      onSubmit={close}
      closeLabel="戻る"
      submitLabel="次へ"
      actionLayout="flow"
    >
      <Text>前の手順へ戻るか、確認を終えて次へ進みます。</Text>
    </Dialog>
  );
};

export const DesktopFlow: Story = {
  render: () => <DesktopFlowExample />,
};

const DesktopFlowStartOnlyExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <Dialog
      title="追加するスタッフを選択"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={close}
      footer={
        <DialogActionArea
          layout="flow"
          startAction={
            <Button type="button" variant="outline" onClick={close}>
              戻る
            </Button>
          }
        />
      }
    >
      <Text>追加操作は各スタッフ行で行うため、フッターには戻る操作だけを左端に置きます。</Text>
    </Dialog>
  );
};

export const DesktopFlowStartOnly: Story = {
  render: () => <DesktopFlowStartOnlyExample />,
};

const DestructiveExample = () => {
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
      actionLayout="standard"
    >
      <Text mb={2}>本当にこのアイテムを削除しますか？</Text>
      <Text fontSize="sm" color="gray.600">
        この操作は取り消せません。
      </Text>
    </Dialog>
  );
};

export const Destructive: Story = {
  render: () => <DestructiveExample />,
};

const ReadOnlyCloseExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <Dialog title="変更内容" isOpen={isOpen} onOpenChange={onOpenChange} onClose={close}>
      <Text>追加 0名・外す 2名</Text>
      <Text fontSize="sm" color="gray.600" mt={2}>
        送信操作がないため、右端にはsecondary配色の「閉じる」だけを表示します。
      </Text>
    </Dialog>
  );
};

export const ReadOnlyClose: Story = {
  render: () => <ReadOnlyCloseExample />,
};

const MobileActionExample = ({ longLabels = false }: { longLabels?: boolean }) => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <Dialog
      title={longLabels ? "公開範囲の変更を確認" : "店舗名を変更"}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={close}
      onSubmit={close}
      closeLabel={longLabels ? "変更せずにキャンセルする" : "キャンセル"}
      submitLabel={longLabels ? "選択した内容で変更を確定する" : "保存"}
    >
      <Text>
        {longLabels
          ? "ラベルが長い場合も、320px幅で省略せず折り返し、二つの操作を同幅の横並びに保ちます。"
          : "短いラベルも二つの操作を同幅の横並びにします。"}
      </Text>
    </Dialog>
  );
};

export const MobileInlineShort: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <MobileActionExample />,
};

export const MobileInlineLong: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <MobileActionExample longLabels />,
};

export const MobileReadOnlyClose: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <ReadOnlyCloseExample />,
};

const MobileFullScreenScrollingExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <Dialog
      title="スタッフの所属を確認"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={close}
      onSubmit={close}
      submitLabel="変更する"
      mobileFullScreen
    >
      <Stack gap={4}>
        <Text>本文だけがスクロールし、ヘッダーとsafe-areaを含むaction footerは画面内に残ります。</Text>
        {Array.from({ length: 12 }, (_, index) => (
          <Box key={index} borderWidth={1} borderColor="border.default" borderRadius="md" p={4}>
            <Text fontWeight="semibold">スタッフ {index + 1}</Text>
            <Text fontSize="sm" color="fg.muted">
              所属店舗と権限の確認項目
            </Text>
          </Box>
        ))}
      </Stack>
    </Dialog>
  );
};

export const MobileFullScreenScrolling: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <MobileFullScreenScrollingExample />,
};

const ActionOrderAndFocusExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <Dialog
      title="アクション順序"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={close}
      onSubmit={() => {}}
      submitLabel="保存する"
    >
      <Text>DOMとTab順は、secondaryからprimaryの順です。</Text>
    </Dialog>
  );
};

export const ActionOrderAndFocusBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ActionOrderAndFocusExample />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "アクション順序" });
    const actionArea = dialog.querySelector("[data-dialog-action-area]");
    if (!(actionArea instanceof HTMLElement)) throw new Error("Dialog action area was not found");

    const actions = within(actionArea).getAllByRole("button");
    await expect(actions).toHaveLength(2);
    await expect(actions[0]).toHaveTextContent("キャンセル");
    await expect(actions[1]).toHaveTextContent("保存する");
    await waitFor(() => expect(dialog.contains(canvasElement.ownerDocument.activeElement)).toBe(true));

    actions[0]?.focus();
    await expect(actions[0]).toHaveFocus();
    await userEvent.tab();
    await expect(actions[1]).toHaveFocus();
    await userEvent.tab();
    await expect(within(dialog).getByLabelText("閉じる")).toHaveFocus();
    await userEvent.tab();
    await expect(actions[0]).toHaveFocus();
  },
};

const BusyCloseLockExample = () => {
  const router = useRouter();
  const [closeRequestCount, setCloseRequestCount] = useState(0);
  const recordCloseRequest = () => setCloseRequestCount((count) => count + 1);

  return (
    <Dialog
      title="保存処理中"
      role="alertdialog"
      isOpen={true}
      onOpenChange={({ open }) => {
        if (!open) recordCloseRequest();
      }}
      onClose={recordCloseRequest}
      onSubmit={() => {}}
      submitLabel="保存中"
      isLoading
    >
      <button type="button" hidden data-testid="simulate-browser-back" onClick={() => router.history.back()} />
      <Stack gap={3}>
        <Text>処理が完了するまでDialogを閉じられません。</Text>
        <Text>閉じる要求: {closeRequestCount}</Text>
      </Stack>
    </Dialog>
  );
};

export const BusyCloseLockBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <BusyCloseLockExample />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("alertdialog", { name: "保存処理中" });

    await waitFor(() => expect(dialog).toBeVisible());
    await waitFor(() => expect(dialog).toHaveFocus());
    await expect(dialog).toHaveAttribute("aria-busy", "true");
    await expect(within(dialog).getByRole("button", { name: "キャンセル" })).toBeDisabled();
    await expect(within(dialog).getByRole("button", { name: "保存中" })).toBeDisabled();
    await expect(within(dialog).queryByLabelText("閉じる")).not.toBeInTheDocument();
    await expect(within(dialog).getByText("閉じる要求: 0")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await expect(dialog).toBeVisible();
    fireEvent.pointerDown(canvasElement.ownerDocument.body);
    fireEvent.click(canvasElement.ownerDocument.body);
    await expect(dialog).toBeVisible();
    fireEvent.click(page.getByTestId("simulate-browser-back"));
    await expect(dialog).toBeVisible();
    await expect(within(dialog).getByText("閉じる要求: 0")).toBeInTheDocument();
  },
};

const BusyCloseUnlockExample = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [isBusy, setIsBusy] = useState(true);
  const close = () => setIsOpen(false);

  return (
    <Dialog
      title="保存状態の切替"
      role="alertdialog"
      isOpen={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
      onClose={close}
      onSubmit={() => {}}
      submitLabel="保存する"
      isLoading={isBusy}
    >
      <button type="button" hidden data-testid="simulate-completion" onClick={() => setIsBusy(false)} />
      <Text>処理が完了すると、終了操作を再び利用できます。</Text>
    </Dialog>
  );
};

export const BusyCloseUnlockBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <BusyCloseUnlockExample />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("alertdialog", { name: "保存状態の切替" });
    await expect(dialog).toHaveAttribute("aria-busy", "true");
    await expect(within(dialog).getByRole("button", { name: "キャンセル" })).toBeDisabled();

    fireEvent.click(page.getByTestId("simulate-completion"));
    await waitFor(() => expect(dialog).not.toHaveAttribute("aria-busy"));
    const cancel = await within(dialog).findByRole("button", { name: "キャンセル" });
    await expect(cancel).toBeEnabled();
    await expect(within(dialog).getByLabelText("閉じる")).toBeInTheDocument();
    await userEvent.click(cancel);
    await waitFor(() => expect(page.queryByRole("alertdialog", { name: "保存状態の切替" })).not.toBeInTheDocument());
  },
};

const SubmitRoutesExample = () => {
  const [mode, setMode] = useState<"callback" | "form">("callback");
  const [isOpen, setIsOpen] = useState(true);
  const [callbackCount, setCallbackCount] = useState(0);
  const [formCount, setFormCount] = useState(0);
  const onOpenChange = ({ open }: { open: boolean }) => setIsOpen(open);

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormCount((count) => count + 1);
  };

  return (
    <>
      {!isOpen && (
        <Button
          type="button"
          onClick={() => {
            setMode("form");
            setIsOpen(true);
          }}
        >
          formIdのDialogを開く
        </Button>
      )}
      {mode === "callback" ? (
        <Dialog
          title="onSubmit経路"
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          onClose={() => setIsOpen(false)}
          onSubmit={() => setCallbackCount((count) => count + 1)}
          submitLabel="コールバックを実行"
        >
          <Text>実行回数: {callbackCount}</Text>
        </Dialog>
      ) : (
        <Dialog
          title="formId経路"
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          onClose={() => setIsOpen(false)}
          formId="dialog-action-form"
          submitLabel="フォームを送信"
        >
          <form id="dialog-action-form" onSubmit={handleFormSubmit}>
            <Stack gap={3}>
              <Input aria-label="店舗名" defaultValue="シフトリ本店" />
              <Text>送信回数: {formCount}</Text>
            </Stack>
          </form>
        </Dialog>
      )}
    </>
  );
};

export const SubmitRoutesBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <SubmitRoutesExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const callbackDialog = await page.findByRole("dialog", { name: "onSubmit経路" });

    await userEvent.click(within(callbackDialog).getByRole("button", { name: "コールバックを実行" }));
    await expect(within(callbackDialog).getByText("実行回数: 1")).toBeInTheDocument();
    await userEvent.click(within(callbackDialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "onSubmit経路" })).not.toBeInTheDocument());

    await userEvent.click(canvas.getByRole("button", { name: "formIdのDialogを開く" }));
    const formDialog = await page.findByRole("dialog", { name: "formId経路" });
    await userEvent.click(within(formDialog).getByRole("button", { name: "フォームを送信" }));
    await expect(within(formDialog).getByText("送信回数: 1")).toBeInTheDocument();
  },
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
    const openButton = canvas.getByRole("button", { name: "遅延ダイアログを開く" });

    await expect(page.queryByText("初回open後にmountされる内容です。")).not.toBeInTheDocument();
    await userEvent.click(openButton);
    const dialog = await page.findByRole("dialog", { name: "遅延mount確認" });
    await expect(within(dialog).getByText("初回open後にmountされる内容です。")).toBeInTheDocument();

    const closeButtons = within(dialog).getAllByRole("button", { name: "閉じる" });
    await userEvent.click(closeButtons[closeButtons.length - 1]);
    await waitFor(() => expect(page.queryByRole("dialog", { name: "遅延mount確認" })).not.toBeInTheDocument());
    await waitFor(() => expect(openButton).toHaveFocus(), { timeout: 3_000 });
    await expect(page.queryByText("初回open後にmountされる内容です。")).toBeInTheDocument();

    await userEvent.click(openButton);
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

function DeferredContentMobileExample() {
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
        data-testid="complete-mobile-dialog-module-load"
        onClick={() => {
          setIsReady(true);
          deferred.resolve();
        }}
      >
        読み込みを完了
      </button>
      <DeferredDialogBoundary
        title="遅延ダイアログ"
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onClose={close}
        mobileFullScreen
        renderDialog={(content) => (
          <Dialog
            title="遅延ダイアログ"
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            onClose={close}
            mobileFullScreen
            bodyProps={{ pt: 0 }}
          >
            {content}
          </Dialog>
        )}
      >
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

export const DeferredLoadingMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <DeferredContentMobileExample />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const loadingDialog = await page.findByRole("dialog", { name: "遅延ダイアログ" });
    await expect(within(loadingDialog).getByLabelText("遅延ダイアログを読み込み中")).toBeInTheDocument();

    fireEvent.click(page.getByTestId("complete-mobile-dialog-module-load"));

    const resolvedDialog = page.getByRole("dialog", { name: "遅延ダイアログ" });
    await expect(within(resolvedDialog).getByText("遅延内容を表示しました。")).toBeInTheDocument();
    await expect(page.getAllByRole("dialog", { name: "遅延ダイアログ" })).toHaveLength(1);
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
