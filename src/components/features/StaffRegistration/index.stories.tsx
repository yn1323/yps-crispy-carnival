import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { VERIFICATION_REQUIRED_MESSAGE } from "@/src/components/shared/TurnstileWidget";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { createDeferred } from "@/src/devtools/createDeferred";
import { installTurnstileMock, type TurnstileMock } from "@/src/devtools/turnstileMock";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { StaffRegistrationFlow } from "./StaffRegistrationFlow";
import type { StaffRegistrationCodeStep } from "./types";

const documents = {
  terms: { title: "スタッフ向け利用規約", path: "/terms/staff" },
  privacy: { title: "スタッフ向けプライバシーポリシー", path: "/privacy/staff" },
};

const meta = {
  title: "Features/StaffRegistration",
  component: StaffRegistrationFlow,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <StaffLayout shopName="居酒屋たなか">
        <Story />
      </StaffLayout>
    ),
  ],
} satisfies Meta<typeof StaffRegistrationFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Form: Story = {
  args: {
    data: {
      status: "ok",
      shopName: "居酒屋たなか",
      documents,
    },
    onSubmit: () => {},
  },
};

export const Confirm: Story = {
  args: {
    ...Form.args,
    initialConfirmData: {
      name: "田中 花子",
      email: "hanako@example.com",
      acceptedLegal: true,
    },
  },
};

const confirmTurnstile = {
  widgetKey: 0,
  siteKey: "test-site-key",
  onError: () => {},
  onVerify: () => {},
};
let turnstileMock: TurnstileMock;
const withTurnstileMock = () => {
  turnstileMock = installTurnstileMock();
  return turnstileMock.restore;
};

/** 申請内容の確認中に、裏でセキュリティ確認が進んでいる状態。 */
export const ConfirmVerifying: Story = {
  tags: ["vrt-mobile1"],
  args: { ...Confirm.args, turnstile: confirmTurnstile },
  beforeEach: withTurnstileMock,
};

/** セキュリティ確認が終わる前に、確認に進むを押した状態。 */
export const ConfirmVerificationRequired: Story = {
  tags: ["vrt-mobile1"],
  args: { ...ConfirmVerifying.args, verificationError: VERIFICATION_REQUIRED_MESSAGE },
  beforeEach: withTurnstileMock,
};

/** セキュリティ確認が失敗し、再試行と別の手段を案内している状態。 */
export const ConfirmVerificationFailed: Story = {
  tags: ["vrt-mobile1"],
  args: ConfirmVerifying.args,
  beforeEach: withTurnstileMock,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(turnstileMock.renders).toHaveLength(1));
    turnstileMock.latestRender()["error-callback"]("300030");
    await within(canvasElement).findByRole("alert");
  },
};

const codeStep: StaffRegistrationCodeStep = {
  email: "hanako@example.com",
  // 残り秒数は時刻で変わるため、見た目を撮るStoryでは再送できる状態に固定する。
  resendAvailableAt: 0,
  codeError: null,
  isConfirming: false,
  isResending: false,
  onConfirmCode: () => {},
  onResend: () => {},
  onReviseEmail: () => {},
  onCodeChange: () => {},
};

/** 確認コードのメールを送り、入力を待っている状態。 */
export const CodeEntry: Story = {
  tags: ["vrt-mobile1"],
  args: { ...Form.args, codeStep },
};

/** 入力した確認コードが違っていた状態。 */
export const CodeEntryMismatch: Story = {
  tags: ["vrt-mobile1"],
  args: {
    ...Form.args,
    codeStep: {
      ...codeStep,
      codeError: "確認コードが違います。\nメールに届いた6桁の数字を確認してください。",
    },
  },
};

export const Submitted: Story = {
  args: {
    ...Form.args,
    isSubmitted: true,
  },
};

export const Expired: Story = {
  args: {
    data: {
      status: "expired",
      documents,
    },
    onSubmit: () => {},
  },
};

export const InteractiveFormFlow: Story = {
  parameters: { screenshot: { skip: true } },
  args: Form.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "確認へ" }));
    await expect(await canvas.findByText("名前を入力してください")).toBeInTheDocument();
    await expect(await canvas.findByText("メールアドレスを入力してください")).toBeInTheDocument();
    await expect(await canvas.findByText("利用規約とプライバシーポリシーに同意してください。")).toBeInTheDocument();

    await userEvent.type(canvas.getByRole("textbox", { name: "名前" }), "田中 花子");
    await userEvent.type(canvas.getByRole("textbox", { name: "メールアドレス" }), "hanako@gmai.com");
    await userEvent.click(await canvas.findByRole("button", { name: "hanako@gmail.comに直す" }));
    await expect(canvas.getByRole("textbox", { name: "メールアドレス" })).toHaveValue("hanako@gmail.com");
    await userEvent.click(canvas.getByRole("checkbox"));
    await userEvent.click(canvas.getByRole("button", { name: "確認へ" }));

    await expect(await canvas.findByText("申請内容を確認してください")).toBeInTheDocument();
    await expect(canvas.getByText("田中 花子")).toBeInTheDocument();
    await expect(canvas.getByText("hanako@gmail.com")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "修正する" }));
    await expect(await canvas.findByRole("textbox", { name: "名前" })).toHaveValue("田中 花子");
    await expect(canvas.getByRole("textbox", { name: "メールアドレス" })).toHaveValue("hanako@gmail.com");
    await expect(canvas.getByRole("checkbox")).toBeChecked();
  },
};

export const InteractiveDoubleSubmitGuard: Story = {
  parameters: { screenshot: { skip: true } },
  args: Form.args,
  render: () => <GuardedConfirmStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const submit = canvas.getByRole("button", { name: "確認に進む" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await expect(await canvas.findByTestId("registration-submit-count")).toHaveTextContent("1");
    await expect(submit).toBeDisabled();

    fireEvent.click(canvas.getByTestId("release-registration-submission"));
    await waitFor(() => expect(submit).toBeEnabled());
  },
};

export const InteractiveCodeEntry: Story = {
  parameters: { screenshot: { skip: true } },
  args: Form.args,
  render: () => <CodeEntryStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const codeInput = canvas.getByRole("spinbutton", { name: "確認コード" });

    // 送った直後は、残り秒数を出して再送を止める。
    await expect(canvas.getByRole("button", { name: /^確認コードを再送する（あと\d+秒）$/ })).toBeDisabled();

    // 桁が足りないうちは照合せず、押した場合は理由を出す。
    await userEvent.type(codeInput, "12345");
    await expect(canvas.queryByTestId("registration-confirmed-code")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "申請する" }));
    await expect(await canvas.findByText("6桁の数字を入力してください")).toBeInTheDocument();
    await expect(canvas.queryByTestId("registration-confirmed-code")).not.toBeInTheDocument();

    // 6桁そろった時点で、申請するを押さなくても照合へ渡す。
    await userEvent.type(codeInput, "6");
    await expect(await canvas.findByTestId("registration-confirmed-code")).toHaveTextContent("123456");

    await userEvent.click(canvas.getByRole("button", { name: "メールアドレスを修正する" }));
    await expect(await canvas.findByRole("textbox", { name: "名前" })).toHaveValue("田中 花子");
    await expect(canvas.getByRole("textbox", { name: "メールアドレス" })).toHaveValue("hanako@example.com");
  },
};

function CodeEntryStory() {
  const [isCodeStepOpen, setCodeStepOpen] = useState(true);
  const [confirmedCode, setConfirmedCode] = useState<string | null>(null);
  const [resendAvailableAt] = useState(() => Date.now() + 60_000);

  return (
    <>
      <StaffRegistrationFlow
        data={{ status: "ok", shopName: "居酒屋たなか", documents }}
        initialFormValues={{ name: "田中 花子", email: "hanako@example.com" }}
        codeStep={
          isCodeStepOpen
            ? {
                ...codeStep,
                resendAvailableAt,
                onConfirmCode: setConfirmedCode,
                onReviseEmail: () => setCodeStepOpen(false),
              }
            : null
        }
        onSubmit={() => {}}
      />
      {confirmedCode !== null ? (
        <output data-testid="registration-confirmed-code" hidden>
          {confirmedCode}
        </output>
      ) : null}
    </>
  );
}

function GuardedConfirmStory() {
  const [submitCount, setSubmitCount] = useState(0);
  const pendingSubmission = useRef<ReturnType<typeof createDeferred> | null>(null);
  const { run: handleSubmit, isRunning: isSubmitting } = useSingleFlight(async () => {
    setSubmitCount((count) => count + 1);
    const submission = createDeferred();
    pendingSubmission.current = submission;
    await submission.promise;
    if (pendingSubmission.current === submission) pendingSubmission.current = null;
  });

  return (
    <>
      <StaffRegistrationFlow
        data={{
          status: "ok",
          shopName: "居酒屋たなか",
          documents,
        }}
        isSubmitting={isSubmitting}
        initialConfirmData={{
          name: "田中 花子",
          email: "hanako@example.com",
          acceptedLegal: true,
        }}
        onSubmit={handleSubmit}
      />
      {submitCount > 0 ? (
        <output data-testid="registration-submit-count" hidden>
          {submitCount}
        </output>
      ) : null}
      <button
        type="button"
        hidden
        data-testid="release-registration-submission"
        onClick={() => pendingSubmission.current?.resolve()}
      >
        スタッフ登録処理を完了する
      </button>
    </>
  );
}
