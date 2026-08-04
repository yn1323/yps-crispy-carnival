import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { LoginMethodReverificationView } from "./LoginMethodReverificationView";
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
  safeIdentifier: "lo***@example.com",
  canResend: true,
});
const phoneFactor = factor({
  key: "first-phone",
  strategy: "phone_code",
  input: "code",
  safeIdentifier: "+81 *** **12",
  canResend: true,
});
const secondPhoneFactor = factor({
  key: "second-phone",
  strategy: "phone_code",
  stage: "second",
  input: "code",
  safeIdentifier: "+81 *** **34",
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
  component: LoginMethodReverificationView,
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
} satisfies Meta<typeof LoginMethodReverificationView>;

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
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  args: {
    controller: staticController(inputState(emailFactor, firstFactors)),
  },
};

export const SelectFactorBehavior: Story = {
  render: () => <InteractiveReverificationPreview initialState={selectingState("first", firstFactors)} />,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole("button", { name: "メールで確認（lo***@example.com）" }));

    await expect(await canvas.findByRole("textbox", { name: "確認コード" })).toBeVisible();
    await expect(await canvas.findByText("lo***@example.comに届いた確認コードを入力してください。")).toBeVisible();
  },
};

export const ResendAndChangeFactorBehavior: Story = {
  render: () => <InteractiveReverificationPreview initialState={inputState(emailFactor, firstFactors)} />,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole("button", { name: "確認コードを再送" }));
    await expect(await canvas.findByText("新しい確認コードを送信しました。")).toBeVisible();

    await userEvent.click(await canvas.findByRole("button", { name: "別の方法を使う" }));
    await expect(await canvas.findByRole("button", { name: "現在のパスワード" })).toBeVisible();
    await expect(await canvas.findByRole("button", { name: "SMSで確認（+81 *** **12）" })).toBeVisible();
  },
};

export const PasswordSubmitBehavior: Story = {
  render: () => <InteractiveReverificationPreview initialState={inputState(passwordFactor, firstFactors)} />,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const password = await canvas.findByLabelText("現在のパスワード");

    await userEvent.type(password, "current-password");
    await userEvent.click(await canvas.findByRole("button", { name: "続ける" }));

    await expect(await canvas.findByText("本人確認が完了しました。変更処理を続けています。")).toBeVisible();
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

  return <LoginMethodReverificationView controller={controller} />;
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
  safeIdentifier = null,
  canResend = false,
}: Omit<LoginMethodReverificationFactor, "stage" | "safeIdentifier" | "canResend"> &
  Partial<
    Pick<LoginMethodReverificationFactor, "stage" | "safeIdentifier" | "canResend">
  >): LoginMethodReverificationFactor {
  return { key, strategy, stage, input, safeIdentifier, canResend };
}
