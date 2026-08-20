import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { AccountDeletionDialog } from "./AccountDeletionDialog";
import { AccountDeletionSectionView } from "./AccountDeletionSection";
import type { AccountDeletionPreview } from "./types";

type PreviewProps = {
  preview?: AccountDeletionPreview;
};

function AccountDeletionSectionPreview({ preview }: PreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const readyPreview = preview?.status === "ready" ? preview : null;

  return (
    <Box bg="gray.50" minH="100vh" p={{ base: 4, md: 8 }}>
      <AccountDeletionSectionView preview={preview} onOpen={() => setIsOpen(true)} />
      <AccountDeletionDialog
        isOpen={isOpen}
        isRunning={false}
        preview={readyPreview}
        error={null}
        onClose={() => setIsOpen(false)}
        onOpenChange={({ open }) => setIsOpen(open)}
        onSubmit={() => undefined}
      />
    </Box>
  );
}

const meta = {
  title: "Features/AccountDeletion/AccountDeletionSection",
  component: AccountDeletionSectionPreview,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AccountDeletionSectionPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const AccountOnly: Story = {
  args: {
    preview: {
      status: "ready",
      action: "accountOnly",
      previewFingerprint: "preview-account-only",
    },
  },
};

export const LeaveOrganization: Story = {
  args: {
    preview: {
      status: "ready",
      action: "leaveOrganization",
      previewFingerprint: "preview-leave",
      organization: { name: "サンプル運営会社", shopCount: 3 },
      futureAssignmentCount: 4,
    },
  },
};

export const DeleteOrganization: Story = {
  args: {
    preview: {
      status: "ready",
      action: "deleteOrganization",
      previewFingerprint: "preview-delete",
      organization: { name: "サンプル運営会社", shopCount: 3 },
    },
  },
};

export const MultipleOrganizationsBlocked: Story = {
  args: {
    preview: { status: "blocked", reason: "multipleOrganizations" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByText(
        /複数の組織に所属しているため、この画面からは削除できません。\s*組織設定で組織を一つずつ削除するか、別の管理者へ引き継ぎ、組織の所属を1つ以下にしてください。/,
      ),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "削除内容を確認" })).toBeDisabled();
  },
};

export const BillingContactTransferRequiredBlocked: Story = {
  args: {
    preview: { status: "blocked", reason: "billingContactTransferRequired" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("請求連絡先を別の管理者へ変更してから、もう一度お試しください。")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "削除内容を確認" })).toBeDisabled();
  },
};

export const RecoveryManagerTransferRequiredBlocked: Story = {
  args: {
    preview: { status: "blocked", reason: "recoveryManagerTransferRequired" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("復旧担当者を別の管理者へ変更してから、もう一度お試しください。")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "削除内容を確認" })).toBeDisabled();
  },
};

export const TooManyAssociatedRecordsBlocked: Story = {
  args: {
    preview: { status: "blocked", reason: "tooManyAssociatedRecords" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByText("関連する履歴・アクセス情報が多いため、この画面からは削除できません。"),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "削除内容を確認" })).toBeDisabled();
  },
};

export const TooManyFutureAssignmentsBlocked: Story = {
  args: {
    preview: { status: "blocked", reason: "tooManyFutureAssignments" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByText(
        "将来のシフト割り当てが多いため、この画面からは削除できません。先に将来の割り当てを整理してください。",
      ),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "削除内容を確認" })).toBeDisabled();
  },
};

export const OrganizationDeletionUnavailableBlocked: Story = {
  args: {
    preview: { status: "blocked", reason: "organizationDeletionUnavailable" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("組織または店舗の終了手続きをこの画面から進められません。")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "削除内容を確認" })).toBeDisabled();
  },
};

export const InconsistentAssociationBlocked: Story = {
  args: {
    preview: { status: "blocked", reason: "inconsistentAssociation" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("所属情報を確認できないため、この画面からは削除できません。")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "削除内容を確認" })).toBeDisabled();
  },
};

export const DeleteOrganizationMobile: Story = {
  args: DeleteOrganization.args,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const OpenLeaveOrganizationBehavior: Story = {
  args: LeaveOrganization.args,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "削除内容を確認" }));

    const dialog = await body.findByRole("alertdialog", { name: "組織から退出してアカウントを削除" });
    await expect(within(dialog).getByRole("button", { name: "退出して削除" })).toBeEnabled();
  },
};
