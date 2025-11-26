import type { Meta, StoryObj } from "@storybook/react-vite";
import { Accepted, AlreadyAccepted, ErrorView, Loading, LoggedIn, RequireLogin } from "./index";

const mockInvitation = {
  shopName: "カフェ本店",
  displayName: "山田太郎",
  role: "general",
  invitedByName: "鈴木店長",
};

const meta = {
  title: "Features/User/Join",
  component: LoggedIn,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof LoggedIn>;

export default meta;
type Story = StoryObj<typeof meta>;

// ログイン済み - 正常系
export const Basic: Story = {
  args: {
    invitation: mockInvitation,
    token: "mock-token-123",
  },
};

// ローディング
export const LoadingStory: StoryObj<typeof Loading> = {
  render: () => <Loading />,
};

// エラー系
export const ErrorInvalidLink: StoryObj<typeof ErrorView> = {
  render: () => <ErrorView title="無効なリンク" message="招待リンクが正しくありません。" />,
};

export const ErrorNotFound: StoryObj<typeof ErrorView> = {
  render: () => (
    <ErrorView title="招待が見つかりません" message="この招待リンクは無効か、既にキャンセルされています。" />
  ),
};

export const ErrorExpired: StoryObj<typeof ErrorView> = {
  render: () => (
    <ErrorView
      title="招待の有効期限切れ"
      message="この招待リンクの有効期限が切れています。"
      subMessage="招待者に再送をお願いしてください。"
      iconColor="orange.400"
    />
  ),
};

export const ErrorCancelled: StoryObj<typeof ErrorView> = {
  render: () => <ErrorView title="招待がキャンセルされました" message="この招待はキャンセルされています。" />,
};

// 既に参加済み
export const AlreadyAcceptedStory: StoryObj<typeof AlreadyAccepted> = {
  render: () => <AlreadyAccepted />,
};

// 承認完了
export const AcceptedStory: StoryObj<typeof Accepted> = {
  render: () => <Accepted shopId="shop_123" shopName="カフェ本店" />,
};

// ログインが必要
export const RequireLoginStory: StoryObj<typeof RequireLogin> = {
  render: () => <RequireLogin />,
};

// マネージャー役割
export const ManagerRole: Story = {
  args: {
    invitation: {
      ...mockInvitation,
      role: "manager",
    },
    token: "mock-token-manager",
  },
};
