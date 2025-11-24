import type { Meta, StoryObj } from "@storybook/react-vite";
import { useDialog } from "@/src/components/ui/Dialog";
import { CancelInviteModal } from "./index";

const meta = {
  title: "Features/Shop/Invite/ManageTab/CancelInviteModal",
  component: CancelInviteModal,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof CancelInviteModal>;

export default meta;
type Story = StoryObj<typeof CancelInviteModal>;

// 招待取り消し（有効な招待）
const CancelActiveExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <CancelInviteModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={close}
      onSubmit={close}
      isLoading={false}
      displayName="山田太郎"
      isExpired={false}
    />
  );
};

export const CancelActive: Story = {
  render: () => <CancelActiveExample />,
};

// 招待削除（期限切れ）
const DeleteExpiredExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <CancelInviteModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={close}
      onSubmit={close}
      isLoading={false}
      displayName="佐藤花子"
      isExpired={true}
    />
  );
};

export const DeleteExpired: Story = {
  render: () => <DeleteExpiredExample />,
};

// ローディング状態
const LoadingExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <CancelInviteModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={close}
      onSubmit={close}
      isLoading={true}
      displayName="田中一郎"
      isExpired={false}
    />
  );
};

export const Loading: Story = {
  render: () => <LoadingExample />,
};
