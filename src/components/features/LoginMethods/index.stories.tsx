import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { LoginMethodsView } from "./LoginMethodsView";
import { buildLoginMethodsViewModel, DISABLED_LOGIN_METHOD_CAPABILITIES } from "./script";
import type {
  EmailPasswordDialogState,
  LoginMethodCapabilities,
  LoginMethodsCardState,
  LoginMethodsController,
  LoginMethodsUserSnapshot,
} from "./types";

type Scenario = "googleOnly" | "passwordOnly" | "bothSame" | "bothDifferent" | "pendingEmail";

type PreviewProps = {
  scenario: Scenario;
  enableOperations?: boolean;
  showErrors?: boolean;
  showEmailVerificationDialog?: boolean;
};

const ENABLED_CAPABILITIES: LoginMethodCapabilities = {
  connectGoogle: true,
  reconnectGoogle: true,
  disconnectGoogle: true,
  setPassword: true,
  changePassword: true,
  removePassword: true,
  removeEmailAddress: true,
};

function LoginMethodsPreview({
  scenario,
  enableOperations = false,
  showErrors = false,
  showEmailVerificationDialog = false,
}: PreviewProps) {
  const [dialog, setDialog] = useState<EmailPasswordDialogState>(
    showEmailVerificationDialog
      ? {
          isOpen: true,
          step: "verification",
          targetEmailAddressId: "email-pending",
          targetMaskedEmail: "lo***@yahoo.co.jp",
          passwordMode: "set",
        }
      : { isOpen: false },
  );
  const [googleState, setGoogleState] = useState<LoginMethodsCardState>(
    showErrors
      ? { status: "error", message: "Google連携を確認できませんでした。もう一度読み込んでください。" }
      : idle(),
  );
  const [emailState, setEmailState] = useState<LoginMethodsCardState>(
    showErrors
      ? { status: "error", message: "メールとパスワードを確認できませんでした。もう一度読み込んでください。" }
      : showEmailVerificationDialog
        ? { status: "success", message: "確認コードを送信しました。" }
        : idle(),
  );
  const capabilities = enableOperations ? ENABLED_CAPABILITIES : DISABLED_LOGIN_METHOD_CAPABILITIES;
  const viewModel = useMemo(
    () => buildLoginMethodsViewModel(snapshotForScenario(scenario), capabilities),
    [capabilities, scenario],
  );

  const controller: LoginMethodsController = {
    viewModel,
    isLoaded: true,
    googleState,
    emailPasswordState: emailState,
    emailPasswordDialog: dialog,
    reload: async () => {
      setGoogleState({ status: "success", message: "最新のGoogle連携を確認しました。" });
      setEmailState({ status: "success", message: "最新のメールとパスワードを確認しました。" });
      return true;
    },
    connectGoogle: async () => {
      setGoogleState({ status: "success", message: "Googleの確認画面へ進みます。" });
      return true;
    },
    reconnectGoogle: async () => true,
    prepareGoogleDisconnect: async () => true,
    disconnectGoogle: async () => true,
    openEmailPasswordSetup: () => {
      setEmailState(idle());
      setDialog({
        isOpen: true,
        step: "email",
        targetEmailAddressId: null,
        targetMaskedEmail: null,
        passwordMode: "set",
      });
    },
    continueEmailVerification: async () => {
      setEmailState({ status: "success", message: "確認コードを送信しました。" });
      setDialog({
        isOpen: true,
        step: "verification",
        targetEmailAddressId: "email-pending",
        targetMaskedEmail: "lo***@yahoo.co.jp",
        passwordMode: "set",
      });
      return true;
    },
    openPasswordChange: () => {
      setEmailState(idle());
      setDialog({
        isOpen: true,
        step: "password",
        targetEmailAddressId: null,
        targetMaskedEmail: null,
        passwordMode: "change",
      });
    },
    closeEmailPasswordDialog: () => setDialog({ isOpen: false }),
    startEmailVerification: async () => {
      setEmailState({ status: "success", message: "確認コードを送信しました。" });
      setDialog({
        isOpen: true,
        step: "verification",
        targetEmailAddressId: "email-new",
        targetMaskedEmail: "lo***@example.com",
        passwordMode: "set",
      });
      return true;
    },
    verifyEmailCode: async () => {
      setEmailState({ status: "success", message: "メールアドレスを確認しました。" });
      setDialog({
        isOpen: true,
        step: "password",
        targetEmailAddressId: "email-new",
        targetMaskedEmail: "lo***@example.com",
        passwordMode: "set",
      });
      return true;
    },
    resendEmailCode: async () => {
      setEmailState({ status: "success", message: "新しい確認コードを送りました。" });
      return true;
    },
    updatePassword: async () => {
      setDialog({ isOpen: false });
      setEmailState({ status: "success", message: "メールアドレスとパスワードを設定しました。" });
      return true;
    },
    removePassword: async () => true,
    removeEmailAddress: async () => true,
  };

  return (
    <Box bg="gray.50" minH="100vh" p={{ base: 4, md: 8 }}>
      <Box maxW="760px" mx="auto">
        <LoginMethodsView controller={controller} />
      </Box>
    </Box>
  );
}

const meta = {
  title: "Features/LoginMethods",
  component: LoginMethodsPreview,
  parameters: { layout: "fullscreen" },
  args: { scenario: "googleOnly" },
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

export const CardErrors: Story = {
  args: { scenario: "bothDifferent", showErrors: true },
};

export const Mobile: Story = {
  args: { scenario: "bothDifferent" },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const MobileEmailVerificationDialog: Story = {
  args: {
    scenario: "pendingEmail",
    enableOperations: true,
    showEmailVerificationDialog: true,
  },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const MobileGoogleDisconnectDialog: Story = {
  args: { scenario: "bothDifferent", enableOperations: true },
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "解除" }));

    const dialog = await body.findByRole("alertdialog", { name: "Google連携を解除" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "削除する" })).toBeVisible());
  },
};

export const EmailAndPasswordSetupBehavior: Story = {
  args: { scenario: "googleOnly", enableOperations: true },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "メールアドレスとパスワードを設定" }));
    let dialog = await body.findByRole("dialog", { name: "メールとパスワードを設定" });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "ログインに使うメールアドレス" }),
      "login@example.com",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "確認コードを送信" }));

    dialog = await body.findByRole("dialog", { name: "メールとパスワードを設定" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "確認コード" }), "123456");
    await userEvent.click(within(dialog).getByRole("button", { name: "メールを確認" }));

    dialog = await body.findByRole("dialog", { name: "メールとパスワードを設定" });
    const passwordInputs = within(dialog).getAllByLabelText(/新しいパスワード/);
    await userEvent.type(passwordInputs[0] as HTMLInputElement, "safe-password");
    await userEvent.type(passwordInputs[1] as HTMLInputElement, "safe-password");
    await userEvent.click(within(dialog).getByRole("button", { name: "パスワードを設定" }));

    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "メールとパスワードを設定" })).not.toBeInTheDocument(),
    );
    await expect(await canvas.findByText("メールアドレスとパスワードを設定しました。")).toBeVisible();
  },
};

export const ContinueEmailVerificationBehavior: Story = {
  args: { scenario: "pendingEmail", enableOperations: true },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "メール確認を続ける" }));

    const dialog = await body.findByRole("dialog", { name: "メールとパスワードを設定" });
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "確認コード" })).toBeVisible());
    await expect(within(dialog).getByText("確認コードを送信しました。")).toBeVisible();
  },
};

export const ReloadRecoveryBehavior: Story = {
  args: { scenario: "bothDifferent", showErrors: true },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "最新の状態を読み込む" }));
    await expect(await canvas.findByText("最新のGoogle連携を確認しました。")).toBeVisible();
    await expect(await canvas.findByText("最新のメールとパスワードを確認しました。")).toBeVisible();
  },
};

function snapshotForScenario(scenario: Scenario): LoginMethodsUserSnapshot {
  if (scenario === "googleOnly") {
    return snapshot({
      emailAddresses: [email("email-google", "google@gmail.com", "verified", true)],
      externalAccounts: [google("google-1", "google@gmail.com")],
      primaryEmailAddressId: "email-google",
    });
  }
  if (scenario === "passwordOnly") {
    return snapshot({
      passwordEnabled: true,
      emailAddresses: [email("email-login", "login@example.com")],
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

function idle(): LoginMethodsCardState {
  return { status: "idle", message: null };
}
