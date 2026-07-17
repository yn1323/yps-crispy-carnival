import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { ManagerInvitationDialog } from "./ManagerInvitationDialog";
import type { ManagerInvitationSubmitInput } from "./types";

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
  title: "Features/OrganizationSettings/ManagerInvitationDialog",
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

export const Addition: Story = {};

export const ManualInput: Story = {
  args: { defaultTab: "external" },
};

export const NoEligibleStaff: Story = {
  args: { staffCandidates: [] },
};

export const FreeManagerExchange: Story = {
  args: {
    managerInvitationMode: "freeManagerExchange",
    staffCandidates: staffCandidates.map((candidate) => ({ ...candidate, isResend: false })),
  },
};

export const FreeManualInputUnavailable: Story = {
  args: {
    ...FreeManagerExchange.args,
    defaultTab: "external",
  },
};

export const MobileFreeManagerExchange: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: FreeManagerExchange.args,
};

export const SelectCurrentStaff: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractiveManagerInvitationDialog />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "鈴木 次郎を選択" }));
    await userEvent.click(canvas.getByRole("button", { name: "ログイン案内を送る" }));
    await expect(canvas.getByTestId("manager-invitation-submission")).toHaveTextContent(
      JSON.stringify({ kind: "person", personId: "person-staff" }),
    );
  },
};

export const EnterNameAndEmail: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractiveManagerInvitationDialog />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("tab", { name: "名前・メールを入力" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "名前" }), "佐藤 花子");
    await userEvent.type(canvas.getByRole("textbox", { name: "メールアドレス" }), "sato@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "ログイン案内を送る" }));
    await expect(canvas.getByTestId("manager-invitation-submission")).toHaveTextContent(
      JSON.stringify({ kind: "external", name: "佐藤 花子", email: "sato@example.com" }),
    );
  },
};

function InteractiveManagerInvitationDialog() {
  const [submission, setSubmission] = useState<ManagerInvitationSubmitInput | null>(null);

  return (
    <>
      <ManagerInvitationDialog
        isOpen
        managerInvitationMode="addition"
        staffCandidates={staffCandidates}
        peopleCapacityResolution={null}
        isRunning={false}
        onClose={() => undefined}
        onSubmit={setSubmission}
      />
      <output data-testid="manager-invitation-submission">{submission ? JSON.stringify(submission) : ""}</output>
    </>
  );
}
