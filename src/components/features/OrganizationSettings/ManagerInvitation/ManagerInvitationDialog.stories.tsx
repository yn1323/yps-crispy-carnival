import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
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

    await userEvent.click(canvas.getByRole("button", { name: "鈴木 次郎を選択" }));
    await userEvent.click(canvas.getByRole("button", { name: "交代内容を確認" }));

    await expect(submission).toHaveAttribute("data-submission-count", "0");
    await expect(
      await canvas.findByRole("heading", { name: "鈴木 次郎さんへ管理者交代の案内を送りますか？" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "鈴木 次郎さんがアカウントを連携すると、このグループの唯一の管理者になります。その時点で、あなたのこのグループの管理者権限は終了し、グループ設定と店舗情報へアクセスできなくなります。",
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "交代が完了するまでは、あなたが引き続き管理できます。現在の管理者のスタッフ所属、シフト対象、通知設定は変更されません。",
      ),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "やめる" }));
    await expect(submission).toHaveAttribute("data-submission-count", "0");
    await expect(
      canvas.queryByRole("heading", { name: "鈴木 次郎さんへ管理者交代の案内を送りますか？" }),
    ).not.toBeInTheDocument();

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
    await userEvent.click(canvas.getByRole("button", { name: "交代内容を確認" }));
    await expect(
      await canvas.findByRole("heading", { name: "鈴木 次郎さんへ管理者交代の案内を送りますか？" }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "交代の案内を送る" }));
    await expect(submission).toHaveAttribute("data-submission-count", "1");
  },
};

type InteractiveManagerInvitationDialogProps = {
  managerInvitationMode?: "addition" | "freeManagerExchange";
  candidates?: ManagerInvitationStaffCandidate[];
};

function InteractiveManagerInvitationDialog({
  managerInvitationMode = "addition",
  candidates = staffCandidates,
}: InteractiveManagerInvitationDialogProps) {
  const [submissions, setSubmissions] = useState<ManagerInvitationSubmitInput[]>([]);
  const latestSubmission = submissions.at(-1);

  return (
    <>
      <ManagerInvitationDialog
        isOpen
        managerInvitationMode={managerInvitationMode}
        staffCandidates={candidates}
        peopleCapacityResolution={null}
        isRunning={false}
        onClose={() => undefined}
        onSubmit={(input) => setSubmissions((current) => [...current, input])}
      />
      <output data-testid="manager-invitation-submission" data-submission-count={submissions.length}>
        {latestSubmission ? JSON.stringify(latestSubmission) : ""}
      </output>
    </>
  );
}
