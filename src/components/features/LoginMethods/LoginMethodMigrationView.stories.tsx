import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { LoginMethodMigrationView } from "./LoginMethodMigrationView";
import type {
  EmailPasswordMigrationPhase,
  GoogleConnectionPhase,
  GoogleReplacementPhase,
  LoginMethodMigrationFeedback,
  LoginMethodMigrationFlow,
} from "./migrationTypes";
import type { LoginMethodReverificationController, LoginMethodReverificationFactor } from "./reverificationTypes";
import { IDLE_LOGIN_METHOD_REVERIFICATION_STATE } from "./reverificationTypes";
import type {
  EmailPasswordMigrationController,
  EmailPasswordMigrationState,
} from "./useEmailPasswordMigrationController";
import type { GoogleConnectionController, GoogleConnectionState } from "./useGoogleConnectionController";
import type { GoogleReplacementController, GoogleReplacementState } from "./useGoogleReplacementController";

type FeedbackStatus = LoginMethodMigrationFeedback["status"];

type PreviewProps = {
  flow: LoginMethodMigrationFlow;
  phase: EmailPasswordMigrationPhase | GoogleConnectionPhase | GoogleReplacementPhase;
  fallbackPhase?: EmailPasswordMigrationPhase;
  feedbackStatus?: FeedbackStatus;
  feedbackMessage?: string;
  showReverification?: boolean;
  canRequestPreviousMethodRemoval: boolean;
  onBackToOverview: () => void;
  onRequestPreviousMethodRemoval: () => void;
};

function LoginMethodMigrationPreview({
  flow,
  phase,
  fallbackPhase,
  feedbackStatus = "idle",
  feedbackMessage,
  showReverification = false,
  canRequestPreviousMethodRemoval,
  onBackToOverview,
  onRequestPreviousMethodRemoval,
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
            onRequestPreviousMethodRemoval={onRequestPreviousMethodRemoval}
            canRequestPreviousMethodRemoval={canRequestPreviousMethodRemoval}
          />
        ) : null}
        {flow === "connect-google" ? (
          <GoogleConnectionPreview
            initialPhase={phase as GoogleConnectionPhase}
            initialFeedback={feedback}
            reverification={reverification}
            onBackToOverview={onBackToOverview}
            onRequestPreviousMethodRemoval={onRequestPreviousMethodRemoval}
            canRequestPreviousMethodRemoval={canRequestPreviousMethodRemoval}
          />
        ) : null}
        {flow === "replace-google" ? (
          <GoogleReplacementPreview
            initialPhase={phase as GoogleReplacementPhase}
            initialFallbackPhase={fallbackPhase}
            initialFeedback={feedback}
            reverification={reverification}
            onBackToOverview={onBackToOverview}
            onRequestPreviousMethodRemoval={onRequestPreviousMethodRemoval}
          />
        ) : null}
      </Box>
    </Box>
  );
}

function EmailPasswordPreview({
  initialPhase,
  initialFeedback,
  reverification,
  onBackToOverview,
  onRequestPreviousMethodRemoval,
  canRequestPreviousMethodRemoval,
}: {
  initialPhase: EmailPasswordMigrationPhase;
  initialFeedback: LoginMethodMigrationFeedback;
  reverification: LoginMethodReverificationController;
  onBackToOverview: () => void;
  onRequestPreviousMethodRemoval: () => void;
  canRequestPreviousMethodRemoval: boolean;
}) {
  const [state, setState] = useState<EmailPasswordMigrationState>(() =>
    emailPasswordState(initialPhase, initialFeedback),
  );
  const controller = buildEmailPasswordController(state, setState);

  return (
    <LoginMethodMigrationView
      flow="add-email-password"
      controller={controller}
      reverification={reverification}
      onBackToOverview={onBackToOverview}
      onRequestPreviousMethodRemoval={onRequestPreviousMethodRemoval}
      canRequestPreviousMethodRemoval={canRequestPreviousMethodRemoval}
    />
  );
}

function GoogleConnectionPreview({
  initialPhase,
  initialFeedback,
  reverification,
  onBackToOverview,
  onRequestPreviousMethodRemoval,
  canRequestPreviousMethodRemoval,
}: {
  initialPhase: GoogleConnectionPhase;
  initialFeedback: LoginMethodMigrationFeedback;
  reverification: LoginMethodReverificationController;
  onBackToOverview: () => void;
  onRequestPreviousMethodRemoval: () => void;
  canRequestPreviousMethodRemoval: boolean;
}) {
  const [state, setState] = useState<GoogleConnectionState>(() => googleConnectionState(initialPhase, initialFeedback));
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
      onRequestPreviousMethodRemoval={onRequestPreviousMethodRemoval}
      canRequestPreviousMethodRemoval={canRequestPreviousMethodRemoval}
    />
  );
}

function GoogleReplacementPreview({
  initialPhase,
  initialFallbackPhase = "choosingEmail",
  initialFeedback,
  reverification,
  onBackToOverview,
  onRequestPreviousMethodRemoval,
}: {
  initialPhase: GoogleReplacementPhase;
  initialFallbackPhase?: EmailPasswordMigrationPhase;
  initialFeedback: LoginMethodMigrationFeedback;
  reverification: LoginMethodReverificationController;
  onBackToOverview: () => void;
  onRequestPreviousMethodRemoval: () => void;
}) {
  const feedbackBelongsToFallback = initialPhase === "ensuringFallback";
  const feedbackBelongsToNewGoogle = initialPhase === "connectingNewGoogle" || initialPhase === "newGoogleReady";
  const [state, setState] = useState<GoogleReplacementState>(() => ({
    phase: initialPhase,
    oldGoogleAccountId:
      initialPhase === "connectingNewGoogle" || initialPhase === "newGoogleReady" ? null : "google-old",
    feedback: feedbackBelongsToFallback || feedbackBelongsToNewGoogle ? idleFeedback() : initialFeedback,
  }));
  const [fallbackState, setFallbackState] = useState<EmailPasswordMigrationState>(() =>
    emailPasswordState(
      initialPhase === "ensuringFallback" ? initialFallbackPhase : "methodReady",
      feedbackBelongsToFallback ? initialFeedback : idleFeedback(),
      true,
    ),
  );
  const [newGoogleState, setNewGoogleState] = useState<GoogleConnectionState>(() =>
    googleConnectionState(
      initialPhase === "newGoogleReady" ? "methodReady" : "readyToConnect",
      feedbackBelongsToNewGoogle ? initialFeedback : idleFeedback(),
    ),
  );
  const baseFallbackController = buildEmailPasswordController(fallbackState, setFallbackState);
  const fallback: EmailPasswordMigrationController = {
    ...baseFallbackController,
    setPassword: async (values) => {
      await baseFallbackController.setPassword(values);
      setState({ phase: "fallbackReady", oldGoogleAccountId: "google-old", feedback: idleFeedback() });
      return true;
    },
  };
  const newGoogle: GoogleConnectionController = {
    state: newGoogleState,
    start: async () => {
      setNewGoogleState(googleConnectionState("redirecting", { status: "loading", message: null }));
      return true;
    },
    refresh: async () => true,
  };
  const controller: GoogleReplacementController = {
    state,
    fallback,
    newGoogle,
    refresh: async () => {
      setState({
        phase: "ensuringFallback",
        oldGoogleAccountId: "google-old",
        feedback: { status: "success", message: "最新のログイン方法を確認しました。" },
      });
      setFallbackState(emailPasswordState("choosingEmail", idleFeedback(), true));
      return true;
    },
    removeOldGoogle: async () => {
      setState({
        phase: "connectingNewGoogle",
        oldGoogleAccountId: null,
        feedback: {
          status: "success",
          message: "以前のGoogleを解除しました。メールアドレスとパスワードでログインできる状態は維持しています。",
        },
      });
      return true;
    },
    startNewGoogle: async () => {
      setNewGoogleState(
        googleConnectionState("methodReady", {
          status: "success",
          message: "Googleログインを利用できる状態になりました。",
        }),
      );
      setState({
        phase: "newGoogleReady",
        oldGoogleAccountId: null,
        feedback: { status: "success", message: "新しいGoogleアカウントを確認しました。" },
      });
      return true;
    },
  };

  return (
    <LoginMethodMigrationView
      flow="replace-google"
      controller={controller}
      reverification={reverification}
      onBackToOverview={onBackToOverview}
      onRequestPreviousMethodRemoval={onRequestPreviousMethodRemoval}
      canRequestPreviousMethodRemoval={false}
    />
  );
}

const meta = {
  title: "Features/LoginMethods/LoginMethodMigrationView",
  component: LoginMethodMigrationPreview,
  parameters: { layout: "fullscreen" },
  args: {
    flow: "add-email-password",
    phase: "choosingEmail",
    canRequestPreviousMethodRemoval: true,
    onBackToOverview: fn(),
    onRequestPreviousMethodRemoval: fn(),
  },
} satisfies Meta<typeof LoginMethodMigrationPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

// Googleのみからメールアドレスとパスワードを追加するflow。
export const EmailPasswordChooseEmail: Story = {};

export const EmailPasswordVerifyEmail: Story = {
  args: { phase: "verifyingEmail" },
};

export const EmailPasswordSetPassword: Story = {
  args: { phase: "settingPassword" },
};

export const EmailPasswordMethodReady: Story = {
  args: { phase: "methodReady" },
};

export const EmailPasswordLoading: Story = {
  args: { phase: "choosingEmail", feedbackStatus: "loading" },
};

export const EmailPasswordError: Story = {
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
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

// メールアドレスとパスワードからGoogleを追加するflow。
export const GoogleConnectionReady: Story = {
  args: { flow: "connect-google", phase: "readyToConnect" },
};

export const GoogleConnectionRedirecting: Story = {
  args: { flow: "connect-google", phase: "redirecting", feedbackStatus: "loading" },
};

export const GoogleConnectionSettling: Story = {
  args: { flow: "connect-google", phase: "settling", feedbackStatus: "loading" },
};

export const GoogleConnectionMethodReady: Story = {
  args: { flow: "connect-google", phase: "methodReady" },
};

export const GoogleConnectionLoading: Story = {
  args: { flow: "connect-google", phase: "readyToConnect", feedbackStatus: "loading" },
};

export const GoogleConnectionError: Story = {
  args: {
    flow: "connect-google",
    phase: "unavailable",
    feedbackStatus: "error",
    feedbackMessage: "このGoogleアカウントを接続できませんでした。現在のログイン方法は変更されていません。",
  },
};

export const MobileGoogleConnectionSettling: Story = {
  args: { flow: "connect-google", phase: "settling", feedbackStatus: "loading" },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

// Googleから別のGoogleへ変更するflow。退避方法の内側のstepも個別に固定する。
export const GoogleReplacementChooseFallbackEmail: Story = {
  args: { flow: "replace-google", phase: "ensuringFallback", fallbackPhase: "choosingEmail" },
};

export const GoogleReplacementVerifyFallbackEmail: Story = {
  args: { flow: "replace-google", phase: "ensuringFallback", fallbackPhase: "verifyingEmail" },
};

export const GoogleReplacementSetFallbackPassword: Story = {
  args: { flow: "replace-google", phase: "ensuringFallback", fallbackPhase: "settingPassword" },
};

export const GoogleReplacementFallbackReady: Story = {
  args: { flow: "replace-google", phase: "fallbackReady" },
};

export const GoogleReplacementRemovingOldGoogle: Story = {
  args: { flow: "replace-google", phase: "removingOldGoogle", feedbackStatus: "loading" },
};

export const GoogleReplacementConnectingNewGoogle: Story = {
  args: { flow: "replace-google", phase: "connectingNewGoogle" },
};

export const GoogleReplacementMethodReady: Story = {
  args: { flow: "replace-google", phase: "newGoogleReady" },
};

export const GoogleReplacementFallbackError: Story = {
  args: {
    flow: "replace-google",
    phase: "ensuringFallback",
    fallbackPhase: "verifyingEmail",
    feedbackStatus: "error",
    feedbackMessage: "確認コードを確認できませんでした。もう一度入力してください。",
  },
};

export const GoogleReplacementError: Story = {
  args: {
    flow: "replace-google",
    phase: "unavailable",
    feedbackStatus: "error",
    feedbackMessage: "Googleアカウントの変更結果を確認できませんでした。退避方法は削除していません。",
  },
};

export const MobileGoogleReplacementFallbackReady: Story = {
  args: { flow: "replace-google", phase: "fallbackReady" },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const AddEmailPasswordBehavior: Story = {
  args: { flow: "add-email-password", phase: "choosingEmail" },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole("textbox", { name: "別のメールアドレス" }), "login@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "このメールを使う" }));

    await expect(canvas.getByRole("heading", { name: "メールアドレスとパスワードを設定" })).toHaveFocus();
    let codeInput = await canvas.findByRole("textbox", { name: "確認コード" });
    await userEvent.click(canvas.getByRole("button", { name: "確認コードを再送" }));
    const [resendMessage] = await canvas.findAllByText("新しい確認コードを送信しました。");
    await expect(resendMessage).toBeVisible();
    codeInput = await canvas.findByRole("textbox", { name: "確認コード" });
    await userEvent.type(codeInput, "123456");
    await userEvent.click(canvas.getByRole("button", { name: "メールを確認" }));

    await userEvent.type(await canvas.findByLabelText("新しいパスワード"), "safe-password");
    await userEvent.type(canvas.getByLabelText("新しいパスワード（確認）"), "safe-password");
    await userEvent.click(canvas.getByRole("button", { name: "パスワードを設定" }));

    await expect(await canvas.findByText("新しいログイン方法を設定しました")).toBeVisible();
    await expect(
      canvas.getByText(
        "現在は2つのログイン方法を利用できます。ログイン時にGoogleかメールアドレス・パスワードのどちらか一方を選べます。",
      ),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "以前の方法を停止して切替を完了" }));
    await expect(args.onRequestPreviousMethodRemoval).toHaveBeenCalledOnce();
    await expect(canvas.getByLabelText("現在のログイン方法")).toBeVisible();
  },
};

export const ReuseLinkedGoogleEmailBehavior: Story = {
  args: {
    flow: "add-email-password",
    phase: "choosingEmail",
    onRequestPreviousMethodRemoval: fn(),
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "現在のメールを使う" }));
    await userEvent.type(await canvas.findByLabelText("新しいパスワード"), "safe-password");
    await userEvent.type(canvas.getByLabelText("新しいパスワード（確認）"), "safe-password");
    await userEvent.click(canvas.getByRole("button", { name: "パスワードを設定" }));

    await expect(await canvas.findByText("新しいログイン方法を設定しました")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "今は2つの方法を残す" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "以前の方法を停止して切替を完了" })).not.toBeInTheDocument();
    await expect(canvas.getByText(/Googleと接続していない確認済みメールアドレスが必要です/)).toBeVisible();
    await expect(args.onRequestPreviousMethodRemoval).not.toHaveBeenCalled();
  },
};

export const PreviousMethodRemovalCapabilityClosedBehavior: Story = {
  args: {
    flow: "connect-google",
    phase: "methodReady",
    canRequestPreviousMethodRemoval: false,
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole("button", { name: "以前の方法を停止して切替を完了" })).not.toBeInTheDocument();
    await expect(canvas.getByText(/パスワードを削除する操作は現在利用できません/)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "今は2つの方法を残す" })).toBeVisible();
  },
};

export const KeepBothMethodsBehavior: Story = {
  args: {
    flow: "connect-google",
    phase: "methodReady",
    onBackToOverview: fn(),
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "今は2つの方法を残す" }));

    await expect(args.onBackToOverview).toHaveBeenCalledOnce();
  },
};

export const ConnectGoogleBehavior: Story = {
  args: { flow: "connect-google", phase: "readyToConnect" },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Googleアカウントを選ぶ" }));

    await expect(await canvas.findByText("Googleの画面を開いています")).toBeVisible();
  },
};

export const ReplaceGoogleBehavior: Story = {
  args: { flow: "replace-google", phase: "ensuringFallback", fallbackPhase: "choosingEmail" },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole("textbox", { name: "別のメールアドレス" }), "fallback@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "このメールを使う" }));
    await userEvent.type(await canvas.findByRole("textbox", { name: "確認コード" }), "123456");
    await userEvent.click(canvas.getByRole("button", { name: "メールを確認" }));
    await userEvent.type(await canvas.findByLabelText("新しいパスワード"), "safe-password");
    await userEvent.type(canvas.getByLabelText("新しいパスワード（確認）"), "safe-password");
    await userEvent.click(canvas.getByRole("button", { name: "パスワードを設定" }));

    await expect(await canvas.findByText("退避方法を確認しました")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "以前のGoogleを解除して続ける" }));
    await expect(await canvas.findByText("新しいGoogleアカウントを選択します")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "新しいGoogleアカウントを選ぶ" }));

    await expect(await canvas.findByText("Googleログインを利用できます")).toBeVisible();
    await expect(canvas.getByText(/退避用のメールアドレスとパスワードは残しています/)).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "以前の方法を停止して切替を完了" })).not.toBeInTheDocument();
  },
};

export const BackToOverviewBehavior: Story = {
  args: {
    flow: "add-email-password",
    phase: "choosingEmail",
    onBackToOverview: fn(),
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "ログイン設定に戻る" }));

    await expect(args.onBackToOverview).toHaveBeenCalledOnce();
  },
};

export const BusyFallbackPreventsBackBehavior: Story = {
  args: {
    flow: "replace-google",
    phase: "ensuringFallback",
    fallbackPhase: "verifyingEmail",
    feedbackStatus: "loading",
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("button", { name: "ログイン設定に戻る" })).toBeDisabled();
  },
};

export const BusyNewGooglePreventsBackBehavior: Story = {
  args: {
    flow: "replace-google",
    phase: "connectingNewGoogle",
    feedbackStatus: "loading",
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("button", { name: "ログイン設定に戻る" })).toBeDisabled();
  },
};

export const ValidationErrorFocusBehavior: Story = {
  args: { flow: "add-email-password", phase: "choosingEmail" },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const emailInput = canvas.getByRole("textbox", { name: "別のメールアドレス" });

    await userEvent.click(canvas.getByRole("button", { name: "このメールを使う" }));

    await expect(await canvas.findByText("メールアドレスを入力してください")).toBeVisible();
    await expect(emailInput).toHaveFocus();
  },
};

function buildEmailPasswordController(
  state: EmailPasswordMigrationState,
  setState: (state: EmailPasswordMigrationState) => void,
): EmailPasswordMigrationController {
  const chooseTarget = (phase: "verifyingEmail" | "settingPassword") => {
    setState({
      phase,
      targetEmailAddressId: phase === "settingPassword" ? "email-current" : "email-fallback",
      targetMaskedEmail: phase === "settingPassword" ? "go***@example.com" : "fa***@example.com",
      safeForGoogleDisconnect: false,
      feedback:
        phase === "verifyingEmail" ? { status: "success", message: "確認コードを送信しました。" } : idleFeedback(),
    });
  };

  return {
    state,
    refresh: async () => {
      setState(
        emailPasswordState("choosingEmail", { status: "success", message: "最新のログイン方法を確認しました。" }),
      );
      return true;
    },
    useCurrentEmail: async () => {
      chooseTarget("settingPassword");
      return true;
    },
    useDifferentEmail: async () => {
      chooseTarget("verifyingEmail");
      return true;
    },
    verifyEmail: async () => {
      setState({
        ...state,
        phase: "settingPassword",
        feedback: { status: "success", message: "メールアドレスを確認しました。" },
      });
      return true;
    },
    resendEmailCode: async () => {
      setState({ ...state, feedback: { status: "success", message: "新しい確認コードを送信しました。" } });
      return true;
    },
    setPassword: async () => {
      setState(
        emailPasswordState(
          "methodReady",
          { status: "success", message: "設定が完了しました。" },
          state.targetEmailAddressId === "email-fallback",
        ),
      );
      return true;
    },
    reset: () => setState(emailPasswordState("choosingEmail", idleFeedback())),
  };
}

function emailPasswordState(
  phase: EmailPasswordMigrationPhase,
  feedback: LoginMethodMigrationFeedback,
  safeForGoogleDisconnect = false,
): EmailPasswordMigrationState {
  const hasTarget = phase === "verifyingEmail" || phase === "settingPassword" || phase === "methodReady";
  return {
    phase,
    targetEmailAddressId: hasTarget ? "email-target" : null,
    targetMaskedEmail: hasTarget ? "lo***@example.com" : null,
    safeForGoogleDisconnect,
    feedback,
  };
}

function googleConnectionState(
  phase: GoogleConnectionPhase,
  feedback: LoginMethodMigrationFeedback,
): GoogleConnectionState {
  return {
    phase,
    googleAccountId: phase === "redirecting" || phase === "methodReady" ? "google-new" : null,
    maskedEmail: phase === "methodReady" ? "ve***@very-long-google-account-name.example.com" : null,
    feedback,
  };
}

function buildFeedback(status: FeedbackStatus, message?: string): LoginMethodMigrationFeedback {
  if (status === "error") {
    return { status, message: message ?? "処理を完了できませんでした。以前のログイン方法は変更していません。" };
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
  safeIdentifier: null,
  canResend: false,
};
const emailFactor: LoginMethodReverificationFactor = {
  key: "first-email",
  strategy: "email_code",
  stage: "first",
  input: "code",
  safeIdentifier: "lo***@example.com",
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
    status: "selecting_factor",
    operationId: 1,
    level: "first_factor",
    stage: "first",
    factors: [passwordFactor, emailFactor],
    selectedFactor: null,
    message: null,
  },
};
