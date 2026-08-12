import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ManagerInvitationDialog } from "./ManagerInvitationDialog";
import type { ManagerInvitationStaffCandidate, ManagerInvitationSubmitInput } from "./types";

const staffCandidates = [
  {
    id: "person-staff",
    name: "鈴木 次郎",
    email: "suzuki@sakura.example.com",
    shopNames: ["渋谷店", "新宿店"],
    isResend: false,
  },
  {
    id: "person-staff-2",
    name: "山田 美咲",
    email: "yamada@sakura.example.com",
    shopNames: ["池袋店"],
    isResend: true,
  },
];

const meta = {
  id: "features-organizationsettings-managerinvitationdialog",
  title: "Features/OrganizationSettings/3. ダイアログ/管理者招待",
  component: ManagerInvitationDialog,
  parameters: { layout: "fullscreen" },
  args: {
    isOpen: true,
    managerInvitationMode: "addition",
    staffCandidates,
    peopleCapacityResolution: null,
    isRunning: false,
    onClose: () => undefined,
    onSubmit: () => undefined,
  },
} satisfies Meta<typeof ManagerInvitationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Addition: Story = { name: "既存スタッフから追加" };

export const ManualInput: Story = {
  name: "名前とメールを入力",
  args: { defaultTab: "external" },
};

export const NoEligibleStaff: Story = {
  name: "招待できるスタッフなし",
  args: { staffCandidates: [] },
};

export const FreeManagerExchange: Story = {
  name: "Freeの管理者交代",
  args: {
    managerInvitationMode: "freeManagerExchange",
    staffCandidates: staffCandidates.map((candidate) => ({ ...candidate, isResend: false })),
  },
};

export const FreeManualInputUnavailable: Story = {
  name: "Freeの外部招待不可",
  args: {
    ...FreeManagerExchange.args,
    defaultTab: "external",
  },
};

export const MobileFreeManagerExchange: Story = {
  name: "Freeの管理者交代・モバイル",
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: FreeManagerExchange.args,
};

export const FreeManagerExchangeConfirmation: Story = {
  name: "Freeの管理者交代確認",
  render: () => (
    <InteractiveManagerInvitationDialog
      managerInvitationMode="freeManagerExchange"
      candidates={staffCandidates.map((candidate) => ({ ...candidate, isResend: false }))}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "鈴木 次郎を選択" }));
    await userEvent.click(canvas.getByRole("button", { name: "交代内容を確認" }));
    await canvas.findByRole("alertdialog", { name: "鈴木 次郎さんへ管理者交代の案内を送りますか？" });
  },
};

export const MobileFreeManagerExchangeConfirmation: Story = {
  ...FreeManagerExchangeConfirmation,
  name: "Freeの管理者交代確認・モバイル",
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const SelectCurrentStaff: Story = {
  name: "既存スタッフを選ぶ（操作確認）",
  parameters: { screenshot: { skip: true } },
  render: () => <InteractiveManagerInvitationDialog />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "鈴木 次郎を選択" }));
    await userEvent.click(canvas.getByRole("button", { name: "管理者招待を送る" }));
    await expect(canvas.getByTestId("manager-invitation-submission")).toHaveTextContent(
      JSON.stringify({ kind: "person", personId: "person-staff" }),
    );
  },
};

export const EnterNameAndEmail: Story = {
  name: "名前とメールを入力（操作確認）",
  parameters: { screenshot: { skip: true } },
  render: () => <InteractiveManagerInvitationDialog />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("tab", { name: "名前・メールを入力" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "名前" }), "佐藤 花子");
    await userEvent.type(canvas.getByRole("textbox", { name: "メールアドレス" }), "sato@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "管理者招待を送る" }));
    await expect(canvas.getByTestId("manager-invitation-submission")).toHaveTextContent(
      JSON.stringify({ kind: "external", name: "佐藤 花子", email: "sato@example.com" }),
    );
  },
};

export const FreeManagerExchangeConfirmationBehavior: Story = {
  name: "Freeの管理者交代確認（操作確認）",
  parameters: { screenshot: { skip: true } },
  render: () => (
    <InteractiveManagerInvitationDialog
      managerInvitationMode="freeManagerExchange"
      candidates={staffCandidates.map((candidate) => ({ ...candidate, isResend: false }))}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const submission = canvas.getByTestId("manager-invitation-submission");
    const normalDialog = canvas.getByRole("dialog", { name: "次の管理者を招待" });

    await userEvent.click(canvas.getByRole("button", { name: "鈴木 次郎を選択" }));
    const confirmationTrigger = canvas.getByRole("button", { name: "交代内容を確認" });
    await userEvent.click(confirmationTrigger);

    await expect(submission).toHaveAttribute("data-submission-count", "0");
    const confirmationDialog = await canvas.findByRole("alertdialog", {
      name: "鈴木 次郎さんへ管理者交代の案内を送りますか？",
    });
    await expect(confirmationDialog).toBe(normalDialog);
    await waitFor(() => expect(canvas.getByTestId("manager-invitation-confirmation-body")).toHaveFocus());
    const transferDescription = canvas.getByText(
      /鈴木 次郎さんがログインして招待を受け入れると、この組織の唯一の管理者になります。/,
    );
    await expect(transferDescription).toHaveTextContent(
      /この組織の唯一の管理者になります。\s+その時点で、あなたはこの組織の管理者ではなくなり/,
    );
    await expect(transferDescription).toHaveStyle({ whiteSpace: "pre-line" });
    await expect(
      canvas.getByText(
        "交代が完了するまでは、あなたが引き続き管理できます。現在の管理者のスタッフとしての所属、シフト対象の設定、通知設定は変更されません。",
      ),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "キャンセル" }));
    await expect(submission).toHaveAttribute("data-submission-count", "0");
    await waitFor(() =>
      expect(
        canvas.queryByRole("alertdialog", { name: "鈴木 次郎さんへ管理者交代の案内を送りますか？" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(confirmationTrigger).toHaveFocus());
    await expect(canvas.getByRole("dialog", { name: "次の管理者を招待" })).toBe(normalDialog);

    await userEvent.click(canvas.getByRole("button", { name: "交代内容を確認" }));
    await userEvent.click(await canvas.findByRole("button", { name: "交代の案内を送る" }));
    await expect(submission).toHaveAttribute("data-submission-count", "1");
    await expect(submission).toHaveTextContent(JSON.stringify({ kind: "person", personId: "person-staff" }));
  },
};

export const FreeManagerExchangeResendConfirmationBehavior: Story = {
  name: "Freeの管理者交代を再送（操作確認）",
  parameters: { screenshot: { skip: true } },
  render: () => <InteractiveManagerInvitationDialog managerInvitationMode="freeManagerExchange" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const submission = canvas.getByTestId("manager-invitation-submission");

    await userEvent.click(canvas.getByRole("button", { name: "山田 美咲を選択" }));
    await userEvent.click(canvas.getByRole("button", { name: "交代内容を確認" }));

    await expect(submission).toHaveAttribute("data-submission-count", "0");
    await expect(
      await canvas.findByRole("heading", { name: "山田 美咲さんへ管理者交代の案内を再送しますか？" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/以前のURLは利用できなくなります/)).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "交代の案内を再送" }));
    await expect(submission).toHaveAttribute("data-submission-count", "1");
    await expect(submission).toHaveTextContent(JSON.stringify({ kind: "person", personId: "person-staff-2" }));
  },
};

export const MobileFreeManagerExchangeConfirmationBehavior: Story = {
  name: "Freeの管理者交代確認・モバイル（操作確認）",
  parameters: { screenshot: { skip: true } },
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => (
    <InteractiveManagerInvitationDialog
      managerInvitationMode="freeManagerExchange"
      candidates={staffCandidates.map((candidate) => ({ ...candidate, isResend: false }))}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const submission = canvas.getByTestId("manager-invitation-submission");

    await userEvent.click(canvas.getByRole("button", { name: "鈴木 次郎を選択" }));
    const confirmationTrigger = canvas.getByRole("button", { name: "交代内容を確認" });
    await userEvent.click(confirmationTrigger);
    await canvas.findByRole("alertdialog", { name: "鈴木 次郎さんへ管理者交代の案内を送りますか？" });
    await waitFor(() => expect(canvas.getByTestId("manager-invitation-confirmation-body")).toHaveFocus());
    await userEvent.click(canvas.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(confirmationTrigger).toHaveFocus());
    await userEvent.click(confirmationTrigger);
    await userEvent.click(canvas.getByRole("button", { name: "交代の案内を送る" }));
    await expect(submission).toHaveAttribute("data-submission-count", "1");
  },
};

export const FreeManagerExchangeSubmittingBehavior: Story = {
  name: "Freeの管理者交代送信中（操作確認）",
  parameters: { screenshot: { skip: true } },
  render: () => (
    <InteractiveManagerInvitationDialog
      managerInvitationMode="freeManagerExchange"
      candidates={staffCandidates.map((candidate) => ({ ...candidate, isResend: false }))}
      keepRunningOnSubmit
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "鈴木 次郎を選択" }));
    await userEvent.click(canvas.getByRole("button", { name: "交代内容を確認" }));
    await userEvent.click(await canvas.findByRole("button", { name: "交代の案内を送る" }));

    const confirmationDialog = await canvas.findByRole("alertdialog", {
      name: "鈴木 次郎さんへ管理者交代の案内を送りますか？",
    });
    await waitFor(() => expect(confirmationDialog).toHaveAttribute("aria-busy", "true"));
    await expect(canvas.getByRole("button", { name: "キャンセル" })).toBeDisabled();
    await expect(canvas.queryByRole("button", { name: "閉じる" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await expect(confirmationDialog).toBeInTheDocument();
    await expect(canvas.getByTestId("manager-invitation-close-count")).toHaveTextContent("0");
  },
};

type InteractiveManagerInvitationDialogProps = {
  managerInvitationMode?: "addition" | "freeManagerExchange";
  candidates?: ManagerInvitationStaffCandidate[];
  keepRunningOnSubmit?: boolean;
};

function InteractiveManagerInvitationDialog({
  managerInvitationMode = "addition",
  candidates = staffCandidates,
  keepRunningOnSubmit = false,
}: InteractiveManagerInvitationDialogProps) {
  const [submissions, setSubmissions] = useState<ManagerInvitationSubmitInput[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [closeCount, setCloseCount] = useState(0);
  const latestSubmission = submissions.at(-1);

  return (
    <>
      <ManagerInvitationDialog
        isOpen={isOpen}
        managerInvitationMode={managerInvitationMode}
        staffCandidates={candidates}
        peopleCapacityResolution={null}
        isRunning={isRunning}
        onClose={() => {
          setCloseCount((current) => current + 1);
          setIsOpen(false);
        }}
        onSubmit={(input) => {
          setSubmissions((current) => [...current, input]);
          if (keepRunningOnSubmit) setIsRunning(true);
        }}
      />
      <output hidden data-testid="manager-invitation-submission" data-submission-count={submissions.length}>
        {latestSubmission ? JSON.stringify(latestSubmission) : ""}
      </output>
      <output hidden data-testid="manager-invitation-close-count">
        {closeCount}
      </output>
    </>
  );
}
