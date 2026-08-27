import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { showSuccessToast } from "@/src/components/shared/feedback";
import { Toaster, toaster } from "@/src/components/ui/toaster";
import { LoginMethodMigrationView } from "./LoginMethodMigrationView";
import type {
  EmailPasswordMigrationPhase,
  GoogleConnectionPhase,
  LoginMethodMigrationFeedback,
  LoginMethodMigrationFlow,
} from "./migrationTypes";
import type { LoginMethodReverificationController, LoginMethodReverificationFactor } from "./reverificationTypes";
import { IDLE_LOGIN_METHOD_REVERIFICATION_STATE } from "./reverificationTypes";
import type {
  EmailPasswordMigrationController,
  EmailPasswordMigrationState,
} from "./useEmailPasswordMigrationController";
import type {
  GoogleConnectionController,
  GoogleConnectionErrorKind,
  GoogleConnectionState,
} from "./useGoogleConnectionController";

type FeedbackStatus = LoginMethodMigrationFeedback["status"];

type PreviewProps = {
  flow: LoginMethodMigrationFlow;
  phase: EmailPasswordMigrationPhase | GoogleConnectionPhase;
  feedbackStatus?: FeedbackStatus;
  feedbackMessage?: string;
  googleErrorKind?: GoogleConnectionErrorKind;
  showReverification?: boolean;
  onBackToOverview: () => void;
};

function LoginMethodMigrationPreview({
  flow,
  phase,
  feedbackStatus = "idle",
  feedbackMessage,
  googleErrorKind,
  showReverification = false,
  onBackToOverview,
}: PreviewProps) {
  const feedback = buildFeedback(feedbackStatus, feedbackMessage);
  const reverification = showReverification ? REVERIFICATION_CONTROLLER : IDLE_REVERIFICATION_CONTROLLER;

  return (
    <Box bg="gray.50" minH="100vh" p={{ base: 4, md: 8 }}>
      <Box maxW="760px" mx="auto">
        {flow === "add-email-password" ? (
          <EmailPasswordPreview
            initialPhase={phase as EmailPasswordMigrationPhase}
            initialFeedback={feedback}
            reverification={reverification}
            onBackToOverview={onBackToOverview}
          />
        ) : (
          <GoogleConnectionPreview
            initialPhase={phase as GoogleConnectionPhase}
            initialFeedback={feedback}
            initialErrorKind={googleErrorKind}
            reverification={reverification}
            onBackToOverview={onBackToOverview}
          />
        )}
      </Box>
    </Box>
  );
}

function EmailPasswordPreview({
  initialPhase,
  initialFeedback,
  reverification,
  onBackToOverview,
}: {
  initialPhase: EmailPasswordMigrationPhase;
  initialFeedback: LoginMethodMigrationFeedback;
  reverification: LoginMethodReverificationController;
  onBackToOverview: () => void;
}) {
  const [completed, setCompleted] = useState(false);
  const [state, setState] = useState<EmailPasswordMigrationState>(() =>
    emailPasswordState(initialPhase, initialFeedback),
  );
  const controller = buildEmailPasswordController(state, setState, () => {
    setCompleted(true);
    showSuccessToast({
      title: "メインのメールアドレスとパスワードを設定しました",
      description: "Google認証とシフト通知先メールアドレスは変わりません。",
    });
  });

  if (completed) return null;

  return (
    <LoginMethodMigrationView
      flow="add-email-password"
      controller={controller}
      reverification={reverification}
      onBackToOverview={onBackToOverview}
    />
  );
}

function GoogleConnectionPreview({
  initialPhase,
  initialFeedback,
  initialErrorKind,
  reverification,
  onBackToOverview,
}: {
  initialPhase: GoogleConnectionPhase;
  initialFeedback: LoginMethodMigrationFeedback;
  initialErrorKind?: GoogleConnectionErrorKind;
  reverification: LoginMethodReverificationController;
  onBackToOverview: () => void;
}) {
  const [state, setState] = useState<GoogleConnectionState>(() =>
    googleConnectionState(initialPhase, initialFeedback, initialErrorKind),
  );
  const controller: GoogleConnectionController = {
    state,
    start: async () => {
      setState(
        googleConnectionState("redirecting", {
          status: "loading",
          message: "Googleのアカウント選択画面を開いています。",
        }),
      );
      return true;
    },
    refresh: async () => {
      setState(
        googleConnectionState("readyToConnect", {
          status: "success",
          message: "最新のGoogle連携を確認しました。",
        }),
      );
      return true;
    },
  };

  return (
    <LoginMethodMigrationView
      flow="connect-google"
      controller={controller}
      reverification={reverification}
      onBackToOverview={onBackToOverview}
    />
  );
}

const meta = {
  title: "Features/LoginMethods/LoginMethodMigrationView",
  component: LoginMethodMigrationPreview,
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    ),
  ],
  parameters: { layout: "fullscreen" },
  args: {
    flow: "add-email-password",
    phase: "choosingEmail",
    onBackToOverview: () => {},
  },
} satisfies Meta<typeof LoginMethodMigrationPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmailPasswordInput: Story = {};

export const EmailPasswordLoading: Story = {
  args: { phase: "loading", feedbackStatus: "loading", onBackToOverview: fn() },
  parameters: { screenshot: { skip: true } },
  play: async ({ args }) => {
    const body = within(document.body);

    await expect(await body.findByLabelText("メールアドレス設定フォームを読み込み中")).toBeInTheDocument();
    await expect(body.queryByText("最新のログイン方法を確認しています")).not.toBeInTheDocument();
    await expect(body.getAllByRole("button", { name: "閉じる" })).toHaveLength(2);
    await userEvent.keyboard("{Escape}");
    await expect(args.onBackToOverview).toHaveBeenCalledOnce();
  },
};

export const EmailPasswordSending: Story = {
  args: { feedbackStatus: "loading" },
};

export const EmailPasswordVerification: Story = {
  args: { phase: "verifyingEmail" },
};

export const EmailPasswordCodeMismatch: Story = {
  args: {
    phase: "verifyingEmail",
    feedbackStatus: "error",
    feedbackMessage: "確認コードが一致しません。もう一度入力してください。",
  },
};

export const EmailPasswordSetPassword: Story = {
  args: { phase: "settingPassword" },
};

export const EmailPasswordUnavailable: Story = {
  args: {
    phase: "unavailable",
    feedbackStatus: "error",
    feedbackMessage: "ログイン方法を確認できませんでした。画面を再読み込みしてください。",
  },
};

export const EmailPasswordReverification: Story = {
  args: { phase: "settingPassword", showReverification: true },
};

export const MobileEmailPasswordVerification: Story = {
  args: { phase: "verifyingEmail" },
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const GoogleConnectionReady: Story = {
  args: { flow: "connect-google", phase: "readyToConnect" },
};

export const GoogleConnectionSending: Story = {
  args: { flow: "connect-google", phase: "readyToConnect", feedbackStatus: "loading" },
};

export const GoogleOAuthOpening: Story = {
  args: { flow: "connect-google", phase: "redirecting", feedbackStatus: "loading" },
};

export const GoogleOAuthWaiting: Story = {
  args: { flow: "connect-google", phase: "settling", feedbackStatus: "loading" },
};

export const GoogleOAuthCancelled: Story = {
  args: {
    flow: "connect-google",
    phase: "unavailable",
    feedbackStatus: "error",
    googleErrorKind: "providerCancelled",
    feedbackMessage: "Googleアカウントの追加をキャンセルしました。現在のログイン方法は変更されていません。",
  },
};

export const GoogleAccountCollision: Story = {
  args: {
    flow: "connect-google",
    phase: "unavailable",
    feedbackStatus: "error",
    googleErrorKind: "accountCollision",
    feedbackMessage: "このGoogleアカウントは追加できません。別のGoogleアカウントを選んでください。",
  },
};

export const GoogleAlreadyConnected: Story = {
  args: {
    flow: "connect-google",
    phase: "unavailable",
    feedbackStatus: "error",
    googleErrorKind: "alreadyConnected",
    feedbackMessage: "このGoogleアカウントはすでに接続済みです。画面を再読み込みして最新の状態を確認してください。",
  },
};

export const GoogleClerkConflict: Story = {
  args: {
    flow: "connect-google",
    phase: "unavailable",
    feedbackStatus: "error",
    googleErrorKind: "clerkConflict",
    feedbackMessage: "Google連携の状態が変わりました。画面を再読み込みしてからやり直してください。",
  },
};

export const GoogleRetryableError: Story = {
  args: {
    flow: "connect-google",
    phase: "unavailable",
    feedbackStatus: "error",
    googleErrorKind: "retryable",
    feedbackMessage: "Googleログインを追加できませんでした。",
  },
};

export const GoogleRetryFromErrorBehavior: Story = {
  args: {
    flow: "connect-google",
    phase: "unavailable",
    feedbackStatus: "error",
    googleErrorKind: "retryable",
    feedbackMessage: "Googleログインを追加できませんでした。",
  },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);
    const dialog = within(await body.findByRole("dialog", { name: "Googleログインを追加" }));

    await userEvent.click(dialog.getByRole("button", { name: "再実行する" }));

    const skeleton = await dialog.findByLabelText("Googleログイン画面を読み込み中");
    await waitFor(() => expect(skeleton).toBeVisible());
    await expect(dialog.queryByText("Googleの画面を開いています")).not.toBeInTheDocument();
  },
};

export const MobileGoogleOAuthWaiting: Story = {
  args: { flow: "connect-google", phase: "settling", feedbackStatus: "loading" },
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const MobileGoogleConnectionReady: Story = {
  args: { flow: "connect-google", phase: "readyToConnect" },
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const AddEmailPasswordBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  play: async () => {
    toaster.dismiss();
    const body = within(document.body);

    const inputDialog = within(await body.findByRole("dialog", { name: "メールアドレスとパスワードを設定" }));
    const emailInput = inputDialog.getByRole("textbox", { name: "メールアドレス" });
    await expect(emailInput).toHaveValue("google@gmail.com");
    const cancelButton = inputDialog.getByRole("button", { name: "キャンセル" });
    await expect(cancelButton).toBeInTheDocument();
    const submitButton = inputDialog.getByRole("button", { name: "続ける" });
    await expect(submitButton).toBeInTheDocument();
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, "login@example.com");
    await userEvent.click(inputDialog.getByRole("button", { name: "続ける" }));

    const codeDialog = within(await body.findByRole("dialog", { name: "メールアドレスとパスワードを設定" }));
    await expect(await codeDialog.findByText("login@example.comに確認コードを送りました。")).toBeVisible();
    await userEvent.type(codeDialog.getByRole("textbox", { name: "確認コード" }), "123456");
    await userEvent.click(codeDialog.getByRole("button", { name: "決定する" }));

    const passwordDialog = within(await body.findByRole("dialog", { name: "パスワード設定" }));
    await expect(
      passwordDialog.queryByText("確認済みのメールアドレスと組み合わせる新しいパスワードを入力してください。"),
    ).not.toBeInTheDocument();
    await expect(
      passwordDialog.queryByRole("checkbox", { name: "ほかの端末からログアウトする" }),
    ).not.toBeInTheDocument();
    await userEvent.type(passwordDialog.getByLabelText("新しいパスワード"), "safe-password");
    await userEvent.type(passwordDialog.getByLabelText("新しいパスワード（確認）"), "safe-password");
    await userEvent.click(passwordDialog.getByRole("button", { name: "パスワードを設定" }));

    await waitFor(() => expect(body.queryByRole("dialog", { name: "パスワード設定" })).not.toBeInTheDocument());
    const toastTitle = await body.findByText("メインのメールアドレスとパスワードを設定しました");
    await waitFor(() => expect(toastTitle).toBeVisible());
    await expect(await body.findByText("Google認証とシフト通知先メールアドレスは変わりません。")).toBeVisible();
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
  },
};

export const AddEmailPasswordCancelBehavior: Story = {
  args: { onBackToOverview: fn() },
  parameters: { screenshot: { skip: true } },
  play: async ({ args }) => {
    const body = within(document.body);
    const dialog = within(await body.findByRole("dialog", { name: "メールアドレスとパスワードを設定" }));

    await userEvent.click(dialog.getByRole("button", { name: "キャンセル" }));

    await expect(args.onBackToOverview).toHaveBeenCalledOnce();
  },
};

export const EmailVerificationBackBehavior: Story = {
  args: { phase: "verifyingEmail" },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);
    const dialog = within(await body.findByRole("dialog", { name: "メールアドレスとパスワードを設定" }));
    const backButton = dialog.getByRole("button", { name: "戻る" });
    const verifyButton = dialog.getByRole("button", { name: "決定する" });

    await expect(backButton.compareDocumentPosition(verifyButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await userEvent.click(backButton);
    const emailInput = await dialog.findByRole("textbox", { name: "メールアドレス" });
    await waitFor(() => expect(emailInput).toBeVisible());
    await expect(body.getAllByRole("dialog")).toHaveLength(1);
  },
};

export const MigrationReverificationSingleDialogBehavior: Story = {
  args: { phase: "settingPassword", showReverification: true },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);
    const dialog = within(await body.findByRole("dialog", { name: "確認が必要です" }));

    const codeInput = dialog.getByRole("textbox", { name: "確認コード" });
    await waitFor(() => expect(codeInput).toBeVisible());
    await expect(dialog.getByRole("button", { name: "続ける" })).toBeVisible();
    await expect(body.getAllByRole("dialog")).toHaveLength(1);
  },
};

export const EmailPasswordCodeMismatchBehavior: Story = {
  args: { phase: "verifyingEmail" },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);
    const dialog = within(await body.findByRole("dialog", { name: "メールアドレスとパスワードを設定" }));

    await userEvent.type(dialog.getByRole("textbox", { name: "確認コード" }), "000000");
    await userEvent.click(dialog.getByRole("button", { name: "メールを確認" }));

    await expect(await dialog.findByText("確認コードが一致しません。もう一度入力してください。")).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "確認コード" })).toBeEnabled();
  },
};

export const ConnectGoogleBehavior: Story = {
  args: { flow: "connect-google", phase: "readyToConnect" },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);
    const dialog = within(await body.findByRole("dialog", { name: "Googleログインを追加" }));

    await userEvent.click(dialog.getByRole("button", { name: "選択する" }));

    const skeleton = await dialog.findByLabelText("Googleログイン画面を読み込み中");
    await waitFor(() => expect(skeleton).toBeVisible());
    await expect(dialog.queryByText("Googleの画面を開いています")).not.toBeInTheDocument();
  },
};

function buildEmailPasswordController(
  state: EmailPasswordMigrationState,
  setState: (state: EmailPasswordMigrationState) => void,
  onCompleted: () => void,
): EmailPasswordMigrationController {
  return {
    state,
    refresh: async () => {
      setState(emailPasswordState("choosingEmail", { status: "success", message: "最新の状態を確認しました。" }));
      return true;
    },
    useDifferentEmail: async (emailAddress) => {
      setState({
        phase: "verifyingEmail",
        targetEmailAddressId: "email-new",
        targetEmailAddress: emailAddress,
        feedback: { status: "success", message: "確認コードを送信しました。" },
      });
      return true;
    },
    verifyEmail: async (code) => {
      if (code === "000000") {
        setState({
          ...state,
          feedback: { status: "error", message: "確認コードが一致しません。もう一度入力してください。" },
        });
        return false;
      }
      setState({ ...state, phase: "settingPassword", feedback: idleFeedback() });
      return true;
    },
    resendEmailCode: async () => {
      setState({ ...state, feedback: { status: "success", message: "新しい確認コードを送信しました。" } });
      return true;
    },
    setPassword: async (_newPassword) => {
      setState({ ...state, phase: "methodReady", feedback: { status: "success", message: "設定が完了しました。" } });
      onCompleted();
      return true;
    },
    reset: () => setState(emailPasswordState("choosingEmail", idleFeedback())),
  };
}

function emailPasswordState(
  phase: EmailPasswordMigrationPhase,
  feedback: LoginMethodMigrationFeedback,
): EmailPasswordMigrationState {
  const hasTarget = phase === "verifyingEmail" || phase === "settingPassword" || phase === "methodReady";
  return {
    phase,
    targetEmailAddressId: hasTarget ? "email-target" : null,
    targetEmailAddress: phase === "choosingEmail" ? "google@gmail.com" : hasTarget ? "login@example.com" : null,
    feedback,
  };
}

function googleConnectionState(
  phase: GoogleConnectionPhase,
  feedback: LoginMethodMigrationFeedback,
  errorKind?: GoogleConnectionErrorKind,
): GoogleConnectionState {
  return {
    phase,
    errorKind: errorKind ?? null,
    feedback,
  };
}

function buildFeedback(status: FeedbackStatus, message?: string): LoginMethodMigrationFeedback {
  if (status === "error") {
    return { status, message: message ?? "処理を完了できませんでした。現在のログイン方法は変更していません。" };
  }
  if (status === "success") return { status, message: message ?? "最新の状態を確認しました。" };
  return { status, message: null };
}

function idleFeedback(): LoginMethodMigrationFeedback {
  return { status: "idle", message: null };
}

const passwordFactor: LoginMethodReverificationFactor = {
  key: "first-password",
  strategy: "password",
  stage: "first",
  input: "password",
  displayIdentifier: null,
  canResend: false,
};
const emailFactor: LoginMethodReverificationFactor = {
  key: "first-email",
  strategy: "email_code",
  stage: "first",
  input: "code",
  displayIdentifier: "login@example.com",
  canResend: true,
};

const IDLE_REVERIFICATION_CONTROLLER: LoginMethodReverificationController = {
  state: IDLE_LOGIN_METHOD_REVERIFICATION_STATE,
  onNeedsReverification: () => {},
  runOperation: async <T,>(operation: () => Promise<T>) => operation(),
  selectFactor: async () => {},
  submit: async () => {},
  resend: async () => {},
  useAnotherFactor: () => {},
  cancel: () => {},
};

const REVERIFICATION_CONTROLLER: LoginMethodReverificationController = {
  ...IDLE_REVERIFICATION_CONTROLLER,
  state: {
    status: "awaiting_input",
    operationId: 1,
    level: "first_factor",
    stage: "first",
    factors: [passwordFactor, emailFactor],
    selectedFactor: emailFactor,
    message: null,
  },
};
