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
  showCardErrors?: boolean;
  disconnectGoogleError?: boolean;
  showLoginEmailChangeDialog?: "input" | "verification";
  onStartFlow: (flow: LoginMethodMigrationFlow) => void;
};

type EmailChangeTargetStatus = "absent" | "unverified" | "verified";

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
  isLoaded = true,
  showCardErrors = false,
  disconnectGoogleError = false,
  showLoginEmailChangeDialog,
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
  const [googleState, setGoogleState] = useState<LoginMethodsCardState>(
    showCardErrors
      ? { status: "error", message: "Google連携を確認できませんでした。もう一度読み込んでください。" }
      : idle(),
  );
  const [emailPasswordState, setEmailPasswordState] = useState<LoginMethodsCardState>(
    showCardErrors
      ? {
          status: "error",
          message: "メールアドレスとパスワードを確認できませんでした。もう一度読み込んでください。",
        }
      : idle(),
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
      description: "以前のメールアドレスも登録されたままです。",
    });
  };

  const controller: LoginMethodsController = {
    viewModel,
    isLoaded,
    googleState,
    emailPasswordState,
    emailChangeDialog,
    reload: async () => {
      setGoogleState(idle());
      setEmailPasswordState(idle());
      return true;
    },
    prepareGoogleDisconnect: async () => true,
    disconnectGoogle: async () => {
      if (disconnectGoogleError) {
        setGoogleState({ status: "error", message: "Google連携を解除できませんでした。もう一度お試しください。" });
        return false;
      }
      setGoogleState(idle());
      showSuccessToast({ title: "Google連携を解除しました" });
      return true;
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

  return (
    <Box bg="gray.50" minH="100vh" p={{ base: 4, md: 8 }}>
      <Box maxW="760px" mx="auto">
        <LoginMethodsView
          controller={controller}
          onStartFlow={onStartFlow}
          reverification={IDLE_REVERIFICATION_CONTROLLER}
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

export const CardErrors: Story = {
  args: { scenario: "bothDifferentEmail", showCardErrors: true },
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

export const GoogleDisconnectDialog: Story = {
  args: { scenario: "bothDifferentEmail" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "連携を解除" }));

    const dialog = await body.findByRole("alertdialog", { name: "Google連携を解除" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "解除する" })).toBeVisible());
  },
};

export const MobileGoogleDisconnectDialog: Story = {
  args: { scenario: "bothDifferentEmail" },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "連携を解除" }));

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

    await userEvent.click(canvas.getByRole("button", { name: "連携を解除" }));
    const dialog = within(await body.findByRole("alertdialog", { name: "Google連携を解除" }));
    await userEvent.click(dialog.getByRole("button", { name: "解除する" }));

    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Google連携を解除できませんでした。もう一度お試しください。",
    );
    await waitFor(() => expect(dialog.getByRole("button", { name: "解除する" })).toBeVisible());
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

export const GoogleOnlyPrimaryEmailChangeBehavior: Story = {
  args: { scenario: "googleOnly" },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await primaryEmailChangeBehavior(canvasElement, "google@gmail.com", ["メールアドレスとパスワードを設定"]);
  },
};

export const PasswordOnlyPrimaryEmailChangeBehavior: Story = {
  args: { scenario: "passwordOnly" },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await primaryEmailChangeBehavior(canvasElement, "login@example.com", ["連携する"]);
  },
};

export const BothPrimaryEmailChangeBehavior: Story = {
  args: { scenario: "bothDifferentEmail" },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await primaryEmailChangeBehavior(canvasElement, "login@example.com", ["連携を解除"]);
  },
};

async function primaryEmailChangeBehavior(
  canvasElement: HTMLElement,
  previousPrimaryEmail: string,
  preservedActions: readonly string[],
) {
  toaster.dismiss();
  const canvas = within(canvasElement);
  const body = within(document.body);

  await userEvent.click(canvas.getByRole("button", { name: "変更する" }));
  const inputDialog = within(await body.findByRole("dialog", { name: "メインのメールアドレスを変更" }));
  await userEvent.type(
    inputDialog.getByRole("textbox", { name: "新しいメインメールアドレス" }),
    "new-login@example.com",
  );
  await userEvent.click(inputDialog.getByRole("button", { name: "次へ" }));

  const codeDialogElement = await body.findByRole("dialog", { name: "確認コードを入力" });
  const codeDialog = within(codeDialogElement);
  const instruction = await codeDialog.findByText(
    "ne***@example.comに確認コードを送りました。メールに届いたコードを入力してください。",
  );
  await expect(instruction.closest('[data-scope="alert"]')).toBeNull();
  await expect(codeDialog.queryByText(/new-login@example\.com/)).not.toBeInTheDocument();
  await userEvent.type(codeDialog.getByRole("textbox", { name: "確認コード" }), "123456");
  await userEvent.click(codeDialog.getByRole("button", { name: "メールを確認" }));

  await waitFor(() => expect(body.queryByRole("dialog", { name: "確認コードを入力" })).not.toBeInTheDocument());
  const toastTitle = await body.findByText("メインのメールアドレスを変更しました");
  await waitFor(() => expect(toastTitle).toBeVisible());
  await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
  const emailSection = canvas.getByRole("region", { name: "メールアドレス" });
  await expect(await within(emailSection).findByText("new-login@example.com")).toBeVisible();
  await expect(within(emailSection).queryByText(previousPrimaryEmail)).not.toBeInTheDocument();
  await expect(canvas.queryByRole("button", { name: "パスワードを変更" })).not.toBeInTheDocument();
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
