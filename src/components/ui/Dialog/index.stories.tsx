import { Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
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
