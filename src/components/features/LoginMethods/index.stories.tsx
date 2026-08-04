import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { LoginMethodsView } from "./LoginMethodsView";
import type { LoginMethodMigrationFlow } from "./migrationTypes";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import { IDLE_LOGIN_METHOD_REVERIFICATION_STATE } from "./reverificationTypes";
import { buildLoginMethodsViewModel, DISABLED_LOGIN_METHOD_CAPABILITIES } from "./script";
import type {
  LoginEmailChangeDialogState,
  LoginMethodCapabilities,
  LoginMethodsCardState,
  LoginMethodsController,
  LoginMethodsUserSnapshot,
  PendingLoginMethodRemovalKind,
} from "./types";

type Scenario =
  | "googleOnly"
  | "passwordOnly"
  | "passwordWithVerifiedSecondary"
  | "bothSame"
  | "bothDifferent"
  | "pendingEmail"
  | "longAddresses"
  | "unavailable";

type PreviewProps = {
  scenario: Scenario;
  enableOperations?: boolean;
  showErrors?: boolean;
  showPasswordDialog?: boolean;
  showLoginEmailChangeDialog?: "input" | "verification";
  onStartFlow: (flow: LoginMethodMigrationFlow) => void;
  pendingRemovalKind?: PendingLoginMethodRemovalKind;
  onPendingRemovalClaimed: () => void;
};

type EmailChangeTargetStatus = "absent" | "unverified" | "verified";

const ENABLED_CAPABILITIES: LoginMethodCapabilities = {
  connectGoogle: true,
  reconnectGoogle: true,
  disconnectGoogle: true,
  setPassword: true,
  changePassword: true,
  removePassword: true,
  removeEmailAddress: true,
  replaceGoogleAccount: true,
};

// LoginMethodsViewのStoryでは本人確認UI自体を駆動しない。専用Storyで検証し、ここでは同一参照を渡す。
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

function LoginMethodsPreview({
  scenario,
  enableOperations = false,
  showErrors = false,
  showPasswordDialog = false,
  showLoginEmailChangeDialog,
  onStartFlow,
  pendingRemovalKind,
  onPendingRemovalClaimed,
}: PreviewProps) {
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(showPasswordDialog);
  const [emailChangeDialog, setEmailChangeDialog] = useState<LoginEmailChangeDialogState>(
    showLoginEmailChangeDialog
      ? {
          isOpen: true,
          step: showLoginEmailChangeDialog,
          currentMaskedEmail: "login@example.com",
          targetEmailAddressId: showLoginEmailChangeDialog === "input" ? null : "email-new",
          targetMaskedEmail: showLoginEmailChangeDialog === "input" ? null : "new-login@example.com",
        }
      : { isOpen: false },
  );
  const [emailChangeTargetStatus, setEmailChangeTargetStatus] = useState<EmailChangeTargetStatus>(
    showLoginEmailChangeDialog === "verification" ? "unverified" : "absent",
  );
  const [emailChangeCompleted, setEmailChangeCompleted] = useState(false);
  const [googleState, setGoogleState] = useState<LoginMethodsCardState>(
    showErrors
      ? { status: "error", message: "Google連携を確認できませんでした。もう一度読み込んでください。" }
      : idle(),
  );
  const [emailState, setEmailState] = useState<LoginMethodsCardState>(() => {
    if (showErrors) {
      return { status: "error", message: "メールとパスワードを確認できませんでした。もう一度読み込んでください。" };
    }
    if (showLoginEmailChangeDialog === "verification") {
      return { status: "success", message: "確認コードを送信しました。" };
    }
    return idle();
  });
  const capabilities = enableOperations ? ENABLED_CAPABILITIES : DISABLED_LOGIN_METHOD_CAPABILITIES;
  const viewModel = useMemo(
    () =>
      buildLoginMethodsViewModel(
        snapshotForScenario(scenario, emailChangeTargetStatus, emailChangeCompleted),
        capabilities,
      ),
    [capabilities, emailChangeCompleted, emailChangeTargetStatus, scenario],
  );

  const controller: LoginMethodsController = {
    viewModel,
    isLoaded: true,
    googleState,
    emailPasswordState: emailState,
    emailPasswordDialog: { isOpen: passwordDialogOpen },
    emailChangeDialog,
    reload: async () => {
      setGoogleState(idle());
      setEmailState(idle());
      return true;
    },
    reconnectGoogle: async () => {
      setGoogleState({ status: "success", message: "Googleを再接続しました。" });
      return true;
    },
    prepareGoogleDisconnect: async () => true,
    preparePasswordRemoval: async () => true,
    disconnectGoogle: async () => {
      setGoogleState({ status: "success", message: "Google連携を解除しました。" });
      return true;
    },
    openPasswordChange: () => {
      setEmailState(idle());
      setPasswordDialogOpen(true);
    },
    closeEmailPasswordDialog: () => {
      setPasswordDialogOpen(false);
      setEmailState(idle());
    },
    updatePassword: async () => {
      setPasswordDialogOpen(false);
      setEmailState({ status: "success", message: "パスワードを変更しました。" });
      return true;
    },
    removePassword: async () => {
      setEmailState({ status: "success", message: "パスワードを削除しました。" });
      return true;
    },
    removeEmailAddress: async () => {
      setEmailState({ status: "success", message: "メールアドレスを削除しました。" });
      return true;
    },
    openLoginEmailChange: () => {
      setPasswordDialogOpen(false);
      setEmailState(idle());
      setEmailChangeDialog({
        isOpen: true,
        step: "input",
        currentMaskedEmail: viewModel.emailPassword.primaryEmail?.maskedEmail ?? "login@example.com",
        targetEmailAddressId: null,
        targetMaskedEmail: null,
      });
    },
    continueLoginEmailChange: async (emailAddressId) => {
      const target = [...viewModel.emailPassword.verifiedEmails, ...viewModel.emailPassword.unverifiedEmails].find(
        (emailAddress) => emailAddress.id === emailAddressId,
      );
      const verified = target?.verificationStatus === "verified";
      if (verified) {
        setEmailChangeTargetStatus("verified");
        setEmailChangeCompleted(true);
        setEmailChangeDialog({ isOpen: false });
        setEmailState(idle());
        return true;
      }
      setEmailState({
        status: "success",
        message: "確認コードを送信しました。",
      });
      setEmailChangeDialog({
        isOpen: true,
        step: "verification",
        currentMaskedEmail: viewModel.emailPassword.primaryEmail?.maskedEmail ?? "login@example.com",
        targetEmailAddressId: emailAddressId,
        targetMaskedEmail: target?.maskedEmail ?? "new-login@example.com",
      });
      return true;
    },
    closeLoginEmailChangeDialog: () => {
      setEmailChangeDialog({ isOpen: false });
      setEmailState(idle());
    },
    backToLoginEmailInput: () => {
      setEmailState(idle());
      setEmailChangeDialog({
        isOpen: true,
        step: "input",
        currentMaskedEmail: viewModel.emailPassword.primaryEmail?.maskedEmail ?? "login@example.com",
        targetEmailAddressId: null,
        targetMaskedEmail: null,
      });
    },
    startLoginEmailChange: async () => {
      setEmailChangeTargetStatus("unverified");
      setEmailState({ status: "success", message: "確認コードを送信しました。" });
      setEmailChangeDialog({
        isOpen: true,
        step: "verification",
        currentMaskedEmail: viewModel.emailPassword.primaryEmail?.maskedEmail ?? "login@example.com",
        targetEmailAddressId: "email-new",
        targetMaskedEmail: "new-login@example.com",
      });
      return true;
    },
    verifyLoginEmailCode: async () => {
      setEmailChangeTargetStatus("verified");
      setEmailChangeCompleted(true);
      setEmailState(idle());
      setEmailChangeDialog({ isOpen: false });
      return true;
    },
    resendLoginEmailCode: async () => {
      setEmailState({ status: "success", message: "新しい確認コードを送りました。" });
      return true;
    },
    confirmLoginEmailChange: async () => {
      setEmailChangeTargetStatus("verified");
      setEmailChangeCompleted(true);
      setEmailState(idle());
      setEmailChangeDialog({ isOpen: false });
      return true;
    },
  };

  return (
    <Box bg="gray.50" minH="100vh" p={{ base: 4, md: 8 }}>
      <Box maxW="760px" mx="auto">
        <LoginMethodsView
          controller={controller}
          onStartFlow={onStartFlow}
          reverification={IDLE_REVERIFICATION_CONTROLLER}
          pendingRemovalKind={pendingRemovalKind}
          onPendingRemovalClaimed={onPendingRemovalClaimed}
        />
      </Box>
    </Box>
  );
}

const meta = {
  title: "Features/LoginMethods",
  component: LoginMethodsPreview,
  parameters: { layout: "fullscreen" },
  args: { scenario: "googleOnly", onStartFlow: fn(), onPendingRemovalClaimed: fn() },
} satisfies Meta<typeof LoginMethodsPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GoogleOnly: Story = {};

export const PasswordOnly: Story = {
  args: { scenario: "passwordOnly" },
};

export const GoogleAndPasswordSameEmail: Story = {
  args: { scenario: "bothSame" },
};

export const GoogleAndPasswordDifferentEmails: Story = {
  args: { scenario: "bothDifferent" },
};

export const OperationsEnabled: Story = {
  args: { scenario: "bothDifferent", enableOperations: true },
};

export const GoogleReplacementAvailable: Story = {
  args: { scenario: "googleOnly", enableOperations: true },
};

export const PendingEmail: Story = {
  args: { scenario: "pendingEmail", enableOperations: true },
};

export const CardErrors: Story = {
  args: { scenario: "bothDifferent", showErrors: true },
};

export const Unavailable: Story = {
  args: { scenario: "unavailable", enableOperations: true },
};

export const LongMaskedAddresses: Story = {
  args: { scenario: "longAddresses" },
};

export const Mobile: Story = {
  args: { scenario: "bothDifferent", enableOperations: true },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const PasswordChangeDialog: Story = {
  args: { scenario: "passwordOnly", enableOperations: true, showPasswordDialog: true },
};

export const MainEmailInputDialog: Story = {
  args: {
    scenario: "passwordOnly",
    showLoginEmailChangeDialog: "input",
  },
};

export const MainEmailVerificationDialog: Story = {
  args: {
    scenario: "passwordOnly",
    showLoginEmailChangeDialog: "verification",
  },
};

export const MobileMainEmailVerificationDialog: Story = {
  args: {
    scenario: "passwordOnly",
    showLoginEmailChangeDialog: "verification",
  },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const GoogleDisconnectDialog: Story = {
  args: { scenario: "bothDifferent", enableOperations: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "連携を解除" }));

    const dialog = await body.findByRole("alertdialog", { name: "Google連携を解除" });
    await waitForDialogTransition(within(dialog).getByRole("button", { name: "解除する" }));
  },
};

export const PasswordRemovalDialog: Story = {
  args: { scenario: "bothDifferent", enableOperations: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "パスワードを削除" }));

    const dialog = await body.findByRole("alertdialog", { name: "パスワードを削除" });
    await waitForDialogTransition(within(dialog).getByRole("button", { name: "削除する" }));
  },
};

export const EmailRemovalDialog: Story = {
  args: { scenario: "passwordWithVerifiedSecondary", enableOperations: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "削除" }));

    const dialog = await body.findByRole("alertdialog", { name: "メールアドレスを削除" });
    await waitForDialogTransition(within(dialog).getByRole("button", { name: "削除する" }));
  },
};

export const MobileGoogleDisconnectDialog: Story = {
  args: { scenario: "bothDifferent", enableOperations: true },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "連携を解除" }));

    const dialog = await body.findByRole("alertdialog", { name: "Google連携を解除" });
    await waitForDialogTransition(within(dialog).getByRole("button", { name: "解除する" }));
  },
};

export const StartMigrationFromOverviewBehavior: Story = {
  args: { scenario: "googleOnly", enableOperations: true, onStartFlow: fn() },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "メールアドレスとパスワードを設定" }));

    await expect(args.onStartFlow).toHaveBeenCalledOnce();
    await expect(args.onStartFlow).toHaveBeenCalledWith("add-email-password");
  },
};

export const PasswordChangeBehavior: Story = {
  args: { scenario: "passwordOnly", enableOperations: true },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "パスワードを変更" }));
    const dialog = await body.findByRole("dialog", { name: "パスワードを変更" });
    await userEvent.type(within(dialog).getByLabelText("現在のパスワード"), "current-password");
    await userEvent.type(within(dialog).getByLabelText("新しいパスワード"), "new-safe-password");
    await userEvent.type(within(dialog).getByLabelText("新しいパスワード（確認）"), "new-safe-password");
    await userEvent.click(within(dialog).getByRole("button", { name: "パスワードを変更" }));

    await waitFor(() => expect(body.queryByRole("dialog", { name: "パスワードを変更" })).not.toBeInTheDocument());
    await expect(await canvas.findByText("パスワードを変更しました。")).toBeVisible();
  },
};

export const MainEmailChangeBehavior: Story = {
  args: { scenario: "passwordOnly" },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "変更する" }));
    let dialog = await body.findByRole("dialog", { name: "メインのメールアドレスを変更" });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "新しいメインメールアドレス" }),
      "new-login@example.com",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "次へ" }));

    dialog = await body.findByRole("dialog", { name: "確認コードを入力" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "確認コード" }), "123456");
    await userEvent.click(within(dialog).getByRole("button", { name: "メールを確認" }));

    await waitFor(() => expect(body.queryByRole("dialog", { name: "確認コードを入力" })).not.toBeInTheDocument());
  },
};

export const ContinueMainEmailChangeBehavior: Story = {
  args: { scenario: "passwordWithVerifiedSecondary" },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "このメールに変更" }));

    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "メインのメールアドレスを変更" })).not.toBeInTheDocument(),
    );
  },
};

export const RemovalConfirmationBehavior: Story = {
  args: { scenario: "bothDifferent", enableOperations: true },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "パスワードを削除" }));
    const dialog = await body.findByRole("alertdialog", { name: "パスワードを削除" });
    await userEvent.click(within(dialog).getByRole("button", { name: "削除する" }));

    await waitFor(() => expect(body.queryByRole("alertdialog", { name: "パスワードを削除" })).not.toBeInTheDocument());
    await expect(await canvas.findByText("パスワードを削除しました。")).toBeVisible();
  },
};

export const GoogleRemovalConfirmationBehavior: Story = {
  args: { scenario: "bothDifferent", enableOperations: true },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "連携を解除" }));
    const dialog = await body.findByRole("alertdialog", { name: "Google連携を解除" });

    await waitForDialogTransition(within(dialog).getByRole("button", { name: "解除する" }));
  },
};

export const PendingPasswordRemovalConfirmationBehavior: Story = {
  args: {
    scenario: "bothDifferent",
    enableOperations: true,
    pendingRemovalKind: "password",
    onPendingRemovalClaimed: fn(),
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ args }) => {
    const body = within(document.body);

    const dialog = await body.findByRole("alertdialog", { name: "パスワードを削除" });
    await waitForDialogTransition(within(dialog).getByRole("button", { name: "削除する" }));
    await expect(args.onPendingRemovalClaimed).toHaveBeenCalledOnce();
  },
};

export const PendingGoogleRemovalConfirmationBehavior: Story = {
  args: {
    scenario: "bothDifferent",
    enableOperations: true,
    pendingRemovalKind: "google",
    onPendingRemovalClaimed: fn(),
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ args }) => {
    const body = within(document.body);

    const dialog = await body.findByRole("alertdialog", { name: "Google連携を解除" });
    await waitForDialogTransition(within(dialog).getByRole("button", { name: "解除する" }));
    await expect(args.onPendingRemovalClaimed).toHaveBeenCalledOnce();
  },
};

function snapshotForScenario(
  scenario: Scenario,
  emailChangeTargetStatus: EmailChangeTargetStatus,
  emailChangeCompleted: boolean,
): LoginMethodsUserSnapshot {
  if (scenario === "googleOnly") {
    return snapshot({
      emailAddresses: [email("email-google", "google@gmail.com", "verified", true)],
      externalAccounts: [google("google-1", "google@gmail.com")],
      primaryEmailAddressId: "email-google",
    });
  }
  if (scenario === "passwordOnly") {
    const emailAddresses = [email("email-login", "login@example.com")];
    if (emailChangeTargetStatus !== "absent" || emailChangeCompleted) {
      emailAddresses.push(
        email(
          "email-new",
          "new-login@example.com",
          emailChangeTargetStatus === "unverified" && !emailChangeCompleted ? "unverified" : "verified",
        ),
      );
    }
    return snapshot({
      passwordEnabled: true,
      emailAddresses,
      primaryEmailAddressId: emailChangeCompleted ? "email-new" : "email-login",
    });
  }
  if (scenario === "passwordWithVerifiedSecondary") {
    return snapshot({
      passwordEnabled: true,
      emailAddresses: [email("email-login", "login@example.com"), email("email-new", "new-login@example.com")],
      primaryEmailAddressId: "email-login",
    });
  }
  if (scenario === "bothSame") {
    return snapshot({
      passwordEnabled: true,
      emailAddresses: [email("email-google", "google@gmail.com", "verified", true)],
      externalAccounts: [google("google-1", "google@gmail.com")],
      primaryEmailAddressId: "email-google",
    });
  }
  if (scenario === "pendingEmail") {
    return snapshot({
      emailAddresses: [
        email("email-google", "google@gmail.com", "verified", true),
        email("email-pending", "login@yahoo.co.jp", "unverified"),
      ],
      externalAccounts: [google("google-1", "google@gmail.com")],
      primaryEmailAddressId: "email-google",
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
    emailAddresses: [
      email("email-google", "google@gmail.com", "verified", true),
      email("email-login", "login@yahoo.co.jp"),
    ],
    externalAccounts: [google("google-1", "google@gmail.com")],
    primaryEmailAddressId: "email-google",
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

function email(id: string, emailAddress: string, status = "verified", linked = false) {
  return {
    id,
    emailAddress,
    verificationStatus: status,
    linkedTo: linked ? [{ id: `link-${id}`, type: "oauth_google" }] : [],
  };
}

function google(id: string, emailAddress: string) {
  return { id, provider: "google", emailAddress, verificationStatus: "verified" };
}

async function waitForDialogTransition(element: HTMLElement) {
  // Chakra DialogはDOMへmountされた後にopen transitionが完了するため、可視化だけを待つ。
  await waitFor(() => expect(element).toBeVisible());
}

function idle(): LoginMethodsCardState {
  return { status: "idle", message: null };
}
