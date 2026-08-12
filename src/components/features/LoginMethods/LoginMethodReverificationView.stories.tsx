import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Dialog } from "@/src/components/ui/Dialog";
import {
  isLoginMethodReverificationBusy,
  LoginMethodReverificationActions,
  LoginMethodReverificationView,
} from "./LoginMethodReverificationView";
import type {
  LoginMethodReverificationController,
  LoginMethodReverificationFactor,
  LoginMethodReverificationState,
} from "./reverificationTypes";

const passwordFactor = factor({ key: "first-password", strategy: "password", input: "password" });
const emailFactor = factor({
  key: "first-email",
  strategy: "email_code",
  input: "code",
  displayIdentifier: "login@example.com",
  canResend: true,
});
const phoneFactor = factor({
  key: "first-phone",
  strategy: "phone_code",
  input: "code",
  displayIdentifier: "+81 *** **12",
  canResend: true,
});
const secondPhoneFactor = factor({
  key: "second-phone",
  strategy: "phone_code",
  stage: "second",
  input: "code",
  displayIdentifier: "+81 *** **34",
  canResend: true,
});
const totpFactor = factor({ key: "second-totp", strategy: "totp", stage: "second", input: "code" });
const backupCodeFactor = factor({
  key: "second-backup",
  strategy: "backup_code",
  stage: "second",
  input: "code",
});

const firstFactors = [passwordFactor, emailFactor, phoneFactor];
const secondFactors = [secondPhoneFactor, totpFactor, backupCodeFactor];

const meta = {
  title: "features/LoginMethods/LoginMethodReverificationView",
  component: ReverificationDialogPreview,
  decorators: [
    (Story) => (
      <Box maxW="560px" mx="auto" p={{ base: 4, md: 8 }}>
        <Story />
      </Box>
    ),
  ],
  args: {
    controller: staticController(selectingState("first", firstFactors)),
  },
} satisfies Meta<typeof ReverificationDialogPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

// Static stories are VRT fixtures. Interactive contracts live in the Behavior stories below.
export const FactorSelection: Story = {};

export const PasswordInput: Story = {
  args: {
    controller: staticController(inputState(passwordFactor, firstFactors)),
  },
};

export const EmailOtpInput: Story = {
  args: {
    controller: staticController(inputState(emailFactor, firstFactors, "新しい確認コードを送信しました。")),
  },
};

export const PhoneOtpInput: Story = {
  args: {
    controller: staticController(inputState(phoneFactor, firstFactors)),
  },
};

export const SecondFactorSelection: Story = {
  args: {
    controller: staticController(selectingState("second", secondFactors)),
  },
};

export const TotpInput: Story = {
  args: {
    controller: staticController(inputState(totpFactor, secondFactors)),
  },
};

export const BackupCodeInput: Story = {
  args: {
    controller: staticController(inputState(backupCodeFactor, secondFactors)),
  },
};

export const StartingSkeletonBehavior: Story = {
  args: {
    controller: {
      ...staticController({
        status: "starting",
        operationId: 1,
        level: "first_factor",
        stage: null,
        factors: [],
        selectedFactor: null,
        message: null,
      }),
      cancel: fn(),
    },
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ args }) => {
    const canvas = within(await within(document.body).findByRole("dialog", { name: "確認が必要です" }));

    const skeleton = await canvas.findByLabelText("本人確認フォームを読み込み中");
    await waitFor(() => expect(skeleton).toBeVisible());
    await expect(canvas.queryByText("本人確認方法を確認しています。")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "閉じる" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await expect(args.controller.cancel).not.toHaveBeenCalled();
  },
};

export const NoSupportedFactorError: Story = {
  args: {
    controller: staticController({
      status: "error",
      operationId: 1,
      level: "multi_factor",
      stage: null,
      factors: [],
      selectedFactor: null,
      message: "このアカウントで利用できる本人確認方法がありません。変更は行っていません。",
    }),
  },
};

export const MobileEmailOtpInput: Story = {
  tags: ["vrt-mobile1"],
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  args: {
    controller: staticController(inputState(emailFactor, firstFactors)),
  },
};

export const SelectFactorBehavior: Story = {
  render: () => <InteractiveReverificationPreview initialState={selectingState("first", firstFactors)} />,
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);
    const canvas = within(await body.findByRole("dialog", { name: "確認が必要です" }));

    await userEvent.click(await canvas.findByRole("button", { name: "メールで確認（login@example.com）" }));

    const codeInput = await canvas.findByRole("textbox", { name: "確認コード" });
    await waitFor(() => expect(codeInput).toBeVisible());
    await expect(await canvas.findByText("login@example.comに届いた確認コードを入力してください。")).toBeVisible();
    await expect(body.getAllByRole("dialog")).toHaveLength(1);
  },
};

export const FactorCooldownBehavior: Story = {
  args: {
    controller: staticController({
      ...inputState(emailFactor, [emailFactor]),
      message: "確認コードを送信した直後です。あと30秒ほど待ってから再送してください。",
    }),
  },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const canvas = within(await within(document.body).findByRole("dialog", { name: "確認が必要です" }));

    const cooldownMessage = await canvas.findByText(
      "確認コードを送信した直後です。あと30秒ほど待ってから再送してください。",
    );
    await waitFor(() => expect(cooldownMessage).toBeVisible());
    await expect(canvas.queryByText("確認コードを入力")).not.toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "確認コード" })).toBeVisible();
  },
};

export const ResendBehavior: Story = {
  render: () => <InteractiveReverificationPreview initialState={inputState(emailFactor, firstFactors)} />,
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const canvas = within(await within(document.body).findByRole("dialog", { name: "確認が必要です" }));

    await userEvent.click(await canvas.findByRole("button", { name: "確認コードを再送" }));
    const resendMessage = await canvas.findByText("新しい確認コードを送信しました。");
    await waitFor(() => expect(resendMessage).toBeVisible());
    await expect(canvas.queryByRole("button", { name: "別の方法を使う" })).not.toBeInTheDocument();
  },
};

export const PasswordSubmitBehavior: Story = {
  render: () => <InteractiveReverificationPreview initialState={inputState(passwordFactor, firstFactors)} />,
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const canvas = within(await within(document.body).findByRole("dialog", { name: "確認が必要です" }));
    const password = await canvas.findByLabelText("現在のパスワード");
    const cancelButton = await canvas.findByRole("button", { name: "キャンセル" });
    const continueButton = await canvas.findByRole("button", { name: "続ける" });

    await expect(cancelButton.compareDocumentPosition(continueButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    cancelButton.focus();
    await userEvent.tab();
    await expect(continueButton).toHaveFocus();

    await userEvent.type(password, "current-password");
    await userEvent.click(continueButton);

    await expect(await canvas.findByLabelText("本人確認フォームを読み込み中")).toBeInTheDocument();
    await expect(canvas.queryByText("本人確認が完了しました。変更処理を続けています。")).not.toBeInTheDocument();
  },
};

function InteractiveReverificationPreview({ initialState }: { initialState: LoginMethodReverificationState }) {
  const [state, setState] = useState(initialState);
  const controller: LoginMethodReverificationController = {
    state,
    onNeedsReverification: () => {},
    runOperation: async <T,>(operation: () => Promise<T>) => operation(),
    selectFactor: async (factorKey) => {
      const selectedFactor = state.factors.find((candidate) => candidate.key === factorKey);
      if (selectedFactor) setState(inputState(selectedFactor, state.factors));
    },
    submit: async () => {
      setState({
        status: "completing",
        operationId: state.operationId,
        level: state.level,
        stage: null,
        factors: [],
        selectedFactor: null,
        message: "本人確認が完了しました。変更処理を続けています。",
      });
    },
    resend: async () => {
      if (state.selectedFactor) {
        setState(inputState(state.selectedFactor, state.factors, "新しい確認コードを送信しました。"));
      }
    },
    useAnotherFactor: () => {
      if (state.stage) setState(selectingState(state.stage, state.factors));
    },
    cancel: () => {
      setState({
        status: "idle",
        operationId: null,
        level: null,
        stage: null,
        factors: [],
        selectedFactor: null,
        message: null,
      });
    },
  };

  return <ReverificationDialogPreview controller={controller} />;
}

function ReverificationDialogPreview({ controller }: { controller: LoginMethodReverificationController }) {
  const isBusy = isLoginMethodReverificationBusy(controller);
  return (
    <Dialog
      title="確認が必要です"
      isOpen
      onOpenChange={({ open }) => {
        if (!open && !isBusy) controller.cancel();
      }}
      onClose={controller.cancel}
      onBackGuardRemoved={controller.cancel}
      preventClose={isBusy}
      isLoading={isBusy}
      footer={<LoginMethodReverificationActions controller={controller} />}
      mobileFullScreen
      maxW={{ md: "560px" }}
      maxH={{ md: "86dvh" }}
    >
      <LoginMethodReverificationView controller={controller} />
    </Dialog>
  );
}

function staticController(state: LoginMethodReverificationState): LoginMethodReverificationController {
  return {
    state,
    onNeedsReverification: () => {},
    runOperation: async <T,>(operation: () => Promise<T>) => operation(),
    selectFactor: async () => {},
    submit: async () => {},
    resend: async () => {},
    useAnotherFactor: () => {},
    cancel: () => {},
  };
}

function selectingState(
  stage: "first" | "second",
  factors: readonly LoginMethodReverificationFactor[],
): LoginMethodReverificationState {
  return {
    status: "selecting_factor",
    operationId: 1,
    level: stage === "first" ? "first_factor" : "multi_factor",
    stage,
    factors,
    selectedFactor: null,
    message: null,
  };
}

function inputState(
  selectedFactor: LoginMethodReverificationFactor,
  factors: readonly LoginMethodReverificationFactor[],
  message: string | null = null,
): LoginMethodReverificationState {
  return {
    status: "awaiting_input",
    operationId: 1,
    level: selectedFactor.stage === "first" ? "first_factor" : "multi_factor",
    stage: selectedFactor.stage,
    factors,
    selectedFactor,
    message,
  };
}

function factor({
  key,
  strategy,
  stage = "first",
  input,
  displayIdentifier = null,
  canResend = false,
}: Omit<LoginMethodReverificationFactor, "stage" | "displayIdentifier" | "canResend"> &
  Partial<
    Pick<LoginMethodReverificationFactor, "stage" | "displayIdentifier" | "canResend">
  >): LoginMethodReverificationFactor {
  return { key, strategy, stage, input, displayIdentifier, canResend };
}
