import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { showSuccessToast } from "@/src/components/shared/feedback";
import { Toaster, toaster } from "@/src/components/ui/toaster";
import { LoginMethodsView } from "./LoginMethodsView";
import type { LoginMethodMigrationFlow } from "./migrationTypes";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import { IDLE_LOGIN_METHOD_REVERIFICATION_STATE } from "./reverificationTypes";
import { buildLoginMethodsViewModel } from "./script";
import type {
  LoginEmailChangeDialogState,
  LoginMethodsCardState,
  LoginMethodsController,
  LoginMethodsEmailSnapshot,
  LoginMethodsExternalAccountSnapshot,
  LoginMethodsUserSnapshot,
} from "./types";
import type { PasswordChangeController, PasswordChangeState } from "./usePasswordChangeController";

type Scenario =
  | "googleOnly"
  | "passwordOnly"
  | "bothSameEmail"
  | "bothDifferentEmail"
  | "pendingGoogle"
  | "longAddresses"
  | "unavailable";

type PreviewProps = {
  scenario: Scenario;
  isLoaded?: boolean;
  disconnectGoogleError?: boolean;
  showLoginEmailChangeDialog?: "input" | "verification";
  showPasswordChangeDialog?: "input" | "error";
  showReverification?: boolean;
  isMigrationDialogOpen?: boolean;
  onStartFlow: (flow: LoginMethodMigrationFlow) => void;
};

type EmailChangeTargetStatus = "absent" | "unverified" | "verified";

const GOOGLE_DISCONNECT_EMAIL_REQUIRED_MESSAGE =
  "メールアドレス未設定時はGoogle認証を解除できません。先にメールアドレスとパスワードを設定してください。";

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

const STARTING_REVERIFICATION_CONTROLLER: LoginMethodReverificationController = {
  ...IDLE_REVERIFICATION_CONTROLLER,
  state: {
    ...IDLE_LOGIN_METHOD_REVERIFICATION_STATE,
    status: "starting",
    operationId: 1,
  },
};

function LoginMethodsPreview({
  scenario,
  isLoaded = true,
  disconnectGoogleError = false,
  showLoginEmailChangeDialog,
  showPasswordChangeDialog,
  showReverification = false,
  isMigrationDialogOpen = false,
  onStartFlow,
}: PreviewProps) {
  const [emailChangeDialog, setEmailChangeDialog] = useState<LoginEmailChangeDialogState>(
    showLoginEmailChangeDialog
      ? {
          isOpen: true,
          step: showLoginEmailChangeDialog,
          currentEmailAddress: primaryEmailForScenario(scenario),
          targetEmailAddressId: showLoginEmailChangeDialog === "verification" ? "email-new" : null,
          targetEmailAddress: showLoginEmailChangeDialog === "verification" ? "new-login@example.com" : null,
        }
      : { isOpen: false },
  );
  const [emailChangeTargetStatus, setEmailChangeTargetStatus] = useState<EmailChangeTargetStatus>(
    showLoginEmailChangeDialog === "verification" ? "unverified" : "absent",
  );
  const [emailChangeCompleted, setEmailChangeCompleted] = useState(false);
  const [googleState, setGoogleState] = useState<LoginMethodsCardState>(idle());
  const [googleDisconnectPendingCleanup, setGoogleDisconnectPendingCleanup] = useState(false);
  const [emailPasswordState, setEmailPasswordState] = useState<LoginMethodsCardState>(idle());
  const [passwordChangeState, setPasswordChangeState] = useState<PasswordChangeState>(
    showPasswordChangeDialog
      ? {
          isOpen: true,
          status: showPasswordChangeDialog === "error" ? "error" : "idle",
          message:
            showPasswordChangeDialog === "error"
              ? "現在のパスワードが正しくありません。\n入力内容を確認してください。"
              : null,
        }
      : { isOpen: false, status: "idle", message: null },
  );
  const viewModel = useMemo(
    () => buildLoginMethodsViewModel(snapshotForScenario(scenario, emailChangeTargetStatus, emailChangeCompleted)),
    [emailChangeCompleted, emailChangeTargetStatus, scenario],
  );

  const completeEmailChange = () => {
    setEmailChangeTargetStatus("verified");
    setEmailChangeCompleted(true);
    setEmailPasswordState(idle());
    setEmailChangeDialog({ isOpen: false });
    showSuccessToast({
      title: "メインのメールアドレスを変更しました",
    });
  };

  const controller: LoginMethodsController = {
    viewModel,
    isLoaded,
    googleState,
    googleDisconnectPendingCleanup,
    emailPasswordState,
    emailChangeDialog,
    reload: async () => {
      setGoogleState(idle());
      setEmailPasswordState(idle());
      return true;
    },
    prepareGoogleDisconnect: async () => {
      if (scenario === "googleOnly") {
        toaster.create({
          title: GOOGLE_DISCONNECT_EMAIL_REQUIRED_MESSAGE,
          type: "error",
          duration: Number.POSITIVE_INFINITY,
        });
        return false;
      }
      setGoogleDisconnectPendingCleanup(false);
      return {
        mode: scenario === "bothSameEmail" ? "externalOnly" : "externalAndEmail",
        googleEmailAddress: viewModel.google.accounts[0]?.emailAddress ?? "google@gmail.com",
      };
    },
    disconnectGoogle: async () => {
      if (disconnectGoogleError && !googleDisconnectPendingCleanup) {
        setGoogleDisconnectPendingCleanup(true);
        setGoogleState({
          status: "error",
          message:
            "Google連携は解除されましたが、関連するメールアドレスの削除を完了できませんでした。この画面を閉じずに、もう一度お試しください。",
        });
        return false;
      }
      setGoogleDisconnectPendingCleanup(false);
      setGoogleState(idle());
      showSuccessToast({ title: "Google連携を解除しました" });
      return true;
    },
    closeGoogleDisconnect: () => {
      setGoogleDisconnectPendingCleanup(false);
      setGoogleState(idle());
    },
    openLoginEmailChange: () => {
      setEmailPasswordState(idle());
      setEmailChangeDialog({
        isOpen: true,
        step: "input",
        currentEmailAddress: viewModel.emailPassword.primaryEmail?.emailAddress ?? primaryEmailForScenario(scenario),
        targetEmailAddressId: null,
        targetEmailAddress: null,
      });
    },
    closeLoginEmailChangeDialog: () => {
      setEmailChangeDialog({ isOpen: false });
      setEmailPasswordState(idle());
    },
    backToLoginEmailInput: () => {
      setEmailPasswordState(idle());
      setEmailChangeDialog({
        isOpen: true,
        step: "input",
        currentEmailAddress: viewModel.emailPassword.primaryEmail?.emailAddress ?? primaryEmailForScenario(scenario),
        targetEmailAddressId: null,
        targetEmailAddress: null,
      });
    },
    startLoginEmailChange: async () => {
      setEmailChangeTargetStatus("unverified");
      setEmailPasswordState({ status: "success", message: "確認コードを送信しました。" });
      setEmailChangeDialog({
        isOpen: true,
        step: "verification",
        currentEmailAddress: viewModel.emailPassword.primaryEmail?.emailAddress ?? primaryEmailForScenario(scenario),
        targetEmailAddressId: "email-new",
        targetEmailAddress: "new-login@example.com",
      });
      return true;
    },
    verifyLoginEmailCode: async () => {
      completeEmailChange();
      return true;
    },
    resendLoginEmailCode: async () => {
      setEmailPasswordState({ status: "success", message: "新しい確認コードを送りました。" });
      return true;
    },
  };
  const passwordChangeController: PasswordChangeController = {
    state: passwordChangeState,
    open: () => setPasswordChangeState({ isOpen: true, status: "idle", message: null }),
    close: () => setPasswordChangeState({ isOpen: false, status: "idle", message: null }),
    changePassword: async () => {
      setPasswordChangeState({ isOpen: true, status: "loading", message: null });
      await Promise.resolve();
      setPasswordChangeState({ isOpen: false, status: "idle", message: null });
      showSuccessToast({ title: "パスワードを変更しました" });
      return true;
    },
  };

  return (
    <Box bg="gray.50" minH="100vh" p={{ base: 4, md: 8 }}>
      <Box maxW="760px" mx="auto">
        <LoginMethodsView
          controller={controller}
          passwordChangeController={passwordChangeController}
          onStartFlow={onStartFlow}
          reverification={showReverification ? STARTING_REVERIFICATION_CONTROLLER : IDLE_REVERIFICATION_CONTROLLER}
          isMigrationDialogOpen={isMigrationDialogOpen}
        />
      </Box>
    </Box>
  );
}

const meta = {
  title: "Features/LoginMethods",
  component: LoginMethodsPreview,
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    ),
  ],
  parameters: { layout: "fullscreen" },
  args: { scenario: "googleOnly", onStartFlow: () => {} },
} satisfies Meta<typeof LoginMethodsPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GoogleOnly: Story = {};

export const GoogleOnlyEmailNotSetBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const emailSection = within(canvasElement).getByRole("region", { name: "メールアドレス" });
    await expect(await within(emailSection).findByText("未設定")).toBeVisible();
    await expect(within(emailSection).getByRole("button", { name: "設定する" })).toBeVisible();
    await expect(
      within(emailSection).queryByRole("button", { name: "メールアドレスとパスワードを設定" }),
    ).not.toBeInTheDocument();
    await expect(within(emailSection).queryByText("google@gmail.com")).not.toBeInTheDocument();
    await expect(within(canvasElement).queryByRole("region", { name: "パスワード" })).not.toBeInTheDocument();

    const googleSection = within(canvasElement).getByRole("region", { name: "Google認証" });
    await expect(within(googleSection).getByRole("button", { name: "解除する" })).toBeVisible();
    await userEvent.click(within(googleSection).getByRole("button", { name: "解除する" }));
    const toastTitle = await within(document.body).findByText(GOOGLE_DISCONNECT_EMAIL_REQUIRED_MESSAGE);
    const toastRoot = toastTitle.closest('[data-scope="toast"][data-part="root"]');
    if (!(toastRoot instanceof HTMLElement)) throw new Error("Toast root was not found");
    await expect(toastRoot).toHaveAttribute("data-type", "error");
  },
};

export const GoogleOnlySetEmailPasswordBehavior: Story = {
  args: { scenario: "googleOnly", onStartFlow: fn() },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "設定する" }));
    await expect(args.onStartFlow).toHaveBeenCalledWith("add-email-password");
  },
};

export const PasswordOnly: Story = {
  args: { scenario: "passwordOnly" },
};

export const GoogleAndPasswordSameEmail: Story = {
  args: { scenario: "bothSameEmail" },
};

export const GoogleAndPasswordDifferentEmails: Story = {
  args: { scenario: "bothDifferentEmail" },
};

export const Mobile: Story = {
  args: { scenario: "bothDifferentEmail" },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const LongAddresses: Story = {
  args: { scenario: "longAddresses" },
};

export const Loading: Story = {
  args: { scenario: "passwordOnly", isLoaded: false },
};

export const Unavailable: Story = {
  args: { scenario: "unavailable" },
};

export const MainEmailInputDialog: Story = {
  args: { scenario: "passwordOnly", showLoginEmailChangeDialog: "input" },
};

export const MainEmailVerificationDialog: Story = {
  args: { scenario: "passwordOnly", showLoginEmailChangeDialog: "verification" },
};

export const MobileMainEmailVerificationDialog: Story = {
  args: { scenario: "passwordOnly", showLoginEmailChangeDialog: "verification" },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const PasswordChangeDialog: Story = {
  args: { scenario: "passwordOnly", showPasswordChangeDialog: "input" },
};

export const PasswordChangeErrorDialog: Story = {
  args: { scenario: "passwordOnly", showPasswordChangeDialog: "error" },
};

export const MobilePasswordChangeDialog: Story = {
  args: { scenario: "passwordOnly", showPasswordChangeDialog: "input" },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const PasswordChangeBehavior: Story = {
  args: { scenario: "passwordOnly" },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    toaster.dismiss();
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "パスワードを変更" }));
    const dialog = within(await body.findByRole("dialog", { name: "パスワードを変更" }));
    await userEvent.type(dialog.getByLabelText("現在のパスワード"), "current-password");
    await userEvent.type(dialog.getByLabelText("新しいパスワード"), "new-password");
    await userEvent.type(dialog.getByLabelText("新しいパスワード（確認）"), "new-password");
    await userEvent.click(dialog.getByRole("button", { name: "変更する" }));

    await waitFor(() => expect(body.queryByRole("dialog", { name: "パスワードを変更" })).not.toBeInTheDocument());
    await expect(await body.findByText("パスワードを変更しました")).toBeVisible();
  },
};

export const PasswordChangeValidationBehavior: Story = {
  args: { scenario: "passwordOnly" },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "パスワードを変更" }));
    const dialog = within(await body.findByRole("dialog", { name: "パスワードを変更" }));
    await userEvent.type(dialog.getByLabelText("現在のパスワード"), "current-password");
    await userEvent.type(dialog.getByLabelText("新しいパスワード"), "new-password");
    await userEvent.type(dialog.getByLabelText("新しいパスワード（確認）"), "different-password");
    await userEvent.click(dialog.getByRole("button", { name: "変更する" }));

    await expect(await dialog.findByText("確認用パスワードが一致しません。")).toBeVisible();
  },
};

export const GoogleDisconnectDialog: Story = {
  args: { scenario: "bothDifferentEmail" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "解除する" }));

    const dialog = await body.findByRole("alertdialog", { name: "Google連携を解除" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "解除する" })).toBeVisible());
    const googleEmail = within(dialog).getByText("google@gmail.com");
    await expect(googleEmail).toBeVisible();
    await expect(googleEmail.closest("p")).toHaveTextContent("削除するメールアドレス：google@gmail.com");
  },
};

export const GoogleDisconnectSameEmailDialog: Story = {
  args: { scenario: "bothSameEmail" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "解除する" }));

    const dialog = await body.findByRole("alertdialog", { name: "Google連携を解除" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "解除する" })).toBeVisible());
    const googleEmail = within(dialog).getByText("google@gmail.com");
    await expect(googleEmail).toBeVisible();
    await expect(googleEmail.closest("p")).toHaveTextContent("google@gmail.com）は削除されません");
  },
};

export const MobileGoogleDisconnectDialog: Story = {
  args: { scenario: "bothDifferentEmail" },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "解除する" }));

    const dialog = await body.findByRole("alertdialog", { name: "Google連携を解除" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "解除する" })).toBeVisible());
  },
};

export const GoogleDisconnectErrorBehavior: Story = {
  args: { scenario: "bothDifferentEmail", disconnectGoogleError: true },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "解除する" }));
    const dialog = within(await body.findByRole("alertdialog", { name: "Google連携を解除" }));
    await userEvent.click(dialog.getByRole("button", { name: "解除する" }));

    const alert = await dialog.findByRole("alert");
    await expect(alert).toHaveTextContent(
      "Google連携は解除されましたが、関連するメールアドレスの削除を完了できませんでした。この画面を閉じずに、もう一度お試しください。",
    );
    const explanation = dialog.getByText(/このGoogleアカウントのメールアドレスもログイン方法から削除します/);
    await expect(explanation.compareDocumentPosition(alert)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const retryButton = await dialog.findByRole("button", { name: "もう一度試す" });
    await expect(dialog.queryByRole("button", { name: "キャンセル" })).not.toBeInTheDocument();
    await expect(dialog.queryByRole("button", { name: "閉じる" })).not.toBeInTheDocument();
    await userEvent.click(retryButton);
    await waitFor(() => expect(body.queryByRole("alertdialog")).not.toBeInTheDocument());
  },
};

export const PendingGoogleReconnectBehavior: Story = {
  args: { scenario: "pendingGoogle", onStartFlow: fn() },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Googleを再接続" }));

    await expect(args.onStartFlow).toHaveBeenCalledOnce();
    await expect(args.onStartFlow).toHaveBeenCalledWith("connect-google");
  },
};

export const StandaloneReverificationBehavior: Story = {
  args: {
    scenario: "googleOnly",
    showReverification: true,
  },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);

    const dialog = await body.findByRole("dialog", { name: "確認が必要です" });
    await waitFor(() => expect(dialog).toBeVisible());
  },
};

export const MigrationDialogOwnsReverificationBehavior: Story = {
  args: {
    scenario: "googleOnly",
    showReverification: true,
    isMigrationDialogOpen: true,
  },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);

    await expect(body.queryByRole("dialog", { name: "確認が必要です" })).not.toBeInTheDocument();
  },
};

export const PasswordOnlyPrimaryEmailChangeBehavior: Story = {
  args: { scenario: "passwordOnly" },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await primaryEmailChangeBehavior(canvasElement, "login@example.com", "new-login@example.com", ["連携する"]);
  },
};

export const BothPrimaryEmailChangeBehavior: Story = {
  args: { scenario: "bothDifferentEmail" },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await primaryEmailChangeBehavior(canvasElement, "login@example.com", "new-login@example.com", ["解除する"]);
  },
};

async function primaryEmailChangeBehavior(
  canvasElement: HTMLElement,
  previousPrimaryEmail: string,
  expectedPrimaryEmail: string,
  preservedActions: readonly string[],
) {
  toaster.dismiss();
  const canvas = within(canvasElement);
  const body = within(document.body);

  await userEvent.click(canvas.getByRole("button", { name: "変更する" }));
  const inputDialog = within(await body.findByRole("dialog", { name: "メールアドレスを変更" }));
  await expect(inputDialog.queryByText(previousPrimaryEmail)).not.toBeInTheDocument();
  await expect(
    inputDialog.getByText(
      (_, element) =>
        element?.tagName === "P" &&
        element.textContent?.includes("変更が完了すると、以前のログイン用メールアドレスは削除されます。") === true,
    ),
  ).toBeInTheDocument();
  await userEvent.type(inputDialog.getByRole("textbox", { name: "新しいメールアドレス" }), "new-login@example.com");
  await userEvent.click(inputDialog.getByRole("button", { name: "次へ" }));

  const codeDialogElement = await body.findByRole("dialog", { name: "確認コードを入力" });
  const codeDialog = within(codeDialogElement);
  const instruction = await codeDialog.findByText(
    "new-login@example.comに確認コードを送りました。メールに届いたコードを入力してください。",
  );
  await expect(instruction.closest('[data-scope="alert"]')).toBeNull();
  await expect(codeDialog.getByText(/new-login@example\.com/)).toBeVisible();
  await userEvent.type(codeDialog.getByRole("textbox", { name: "確認コード" }), "123456");
  await userEvent.click(codeDialog.getByRole("button", { name: "メールを確認" }));

  await waitFor(() => expect(body.queryByRole("dialog", { name: "確認コードを入力" })).not.toBeInTheDocument());
  const toastTitle = await body.findByText("メインのメールアドレスを変更しました");
  await waitFor(() => expect(toastTitle).toBeVisible());
  await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
  const emailSection = canvas.getByRole("region", { name: "メールアドレス" });
  await expect(await within(emailSection).findByText(expectedPrimaryEmail)).toBeVisible();
  await expect(within(emailSection).queryByText(previousPrimaryEmail)).not.toBeInTheDocument();
  await expect(canvas.getByRole("button", { name: "パスワードを変更" })).toBeVisible();
  for (const action of preservedActions) {
    await expect(canvas.getByRole("button", { name: action })).toBeVisible();
  }
}

function snapshotForScenario(
  scenario: Scenario,
  emailChangeTargetStatus: EmailChangeTargetStatus,
  emailChangeCompleted: boolean,
): LoginMethodsUserSnapshot {
  const appendEmailChangeTarget = (emailAddresses: LoginMethodsEmailSnapshot[]) => {
    if (emailChangeTargetStatus === "absent" && !emailChangeCompleted) return emailAddresses;
    return [
      ...emailAddresses,
      email(
        "email-new",
        "new-login@example.com",
        emailChangeTargetStatus === "unverified" && !emailChangeCompleted ? "unverified" : "verified",
      ),
    ];
  };

  if (scenario === "googleOnly") {
    return snapshot({
      emailAddresses: appendEmailChangeTarget([email("email-google", "google@gmail.com", "verified")]),
      externalAccounts: [google("google-1", "google@gmail.com")],
      primaryEmailAddressId: emailChangeCompleted ? "email-new" : "email-google",
    });
  }
  if (scenario === "passwordOnly") {
    return snapshot({
      passwordEnabled: true,
      emailAddresses: appendEmailChangeTarget([email("email-login", "login@example.com")]),
      primaryEmailAddressId: emailChangeCompleted ? "email-new" : "email-login",
    });
  }
  if (scenario === "bothSameEmail") {
    return snapshot({
      passwordEnabled: true,
      emailAddresses: appendEmailChangeTarget([email("email-google", "google@gmail.com", "verified")]),
      externalAccounts: [google("google-1", "google@gmail.com")],
      primaryEmailAddressId: emailChangeCompleted ? "email-new" : "email-google",
    });
  }
  if (scenario === "pendingGoogle") {
    return snapshot({
      passwordEnabled: true,
      emailAddresses: [email("email-login", "login@example.com")],
      externalAccounts: [google("google-pending", "pending-google@example.com", "unverified")],
      primaryEmailAddressId: "email-login",
    });
  }
  if (scenario === "longAddresses") {
    return snapshot({
      passwordEnabled: true,
      emailAddresses: [email("email-long", "very-long-login-identifier@subdomain.long-example-company.co.jp")],
      externalAccounts: [google("google-long", "very-long-google-identifier@another-long-example-company.co.jp")],
      primaryEmailAddressId: "email-long",
    });
  }
  if (scenario === "unavailable") return snapshot({});
  return snapshot({
    passwordEnabled: true,
    emailAddresses: appendEmailChangeTarget([
      email("email-google", "google@gmail.com", "verified"),
      email("email-login", "login@example.com"),
    ]),
    externalAccounts: [google("google-1", "google@gmail.com")],
    primaryEmailAddressId: emailChangeCompleted ? "email-new" : "email-login",
  });
}

function snapshot(overrides: Partial<LoginMethodsUserSnapshot>): LoginMethodsUserSnapshot {
  return {
    primaryEmailAddressId: null,
    passwordEnabled: false,
    emailAddresses: [],
    externalAccounts: [],
    ...overrides,
  };
}

function email(id: string, emailAddress: string, verificationStatus = "verified"): LoginMethodsEmailSnapshot {
  return { id, emailAddress, verificationStatus };
}

function google(
  id: string,
  emailAddress: string,
  verificationStatus = "verified",
): LoginMethodsExternalAccountSnapshot {
  return { id, provider: "google", emailAddress, verificationStatus };
}

function primaryEmailForScenario(scenario: Scenario): string {
  if (scenario === "googleOnly" || scenario === "bothSameEmail") return "google@gmail.com";
  if (scenario === "longAddresses") return "very-long-login-identifier@subdomain.long-example-company.co.jp";
  return "login@example.com";
}

function idle(): LoginMethodsCardState {
  return { status: "idle", message: null };
}
