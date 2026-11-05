import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { VERIFICATION_REQUIRED_MESSAGE } from "@/src/components/shared/TurnstileWidget";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { createDeferred } from "@/src/devtools/createDeferred";
import { installTurnstileMock, type TurnstileMock } from "@/src/devtools/turnstileMock";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { StaffRegistrationFlow } from "./StaffRegistrationFlow";

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

/** セキュリティ確認が終わる前に、申請するを押した状態。 */
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
    const submit = canvas.getByRole("button", { name: "申請する" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await expect(await canvas.findByTestId("registration-submit-count")).toHaveTextContent("1");
    await expect(submit).toBeDisabled();

    fireEvent.click(canvas.getByTestId("release-registration-submission"));
    await waitFor(() => expect(submit).toBeEnabled());
  },
};

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
