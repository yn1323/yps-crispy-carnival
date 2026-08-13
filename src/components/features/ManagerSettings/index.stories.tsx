import { Box, Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, screen, userEvent, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { ManagerCandidateListView } from "./ManagerCandidateListView";
import { ManagerCandidatePageContent } from "./ManagerCandidatePageContent";
import { ManagerExternalInviteFormView } from "./ManagerExternalInviteForm";
import { ManagerIssueConfirmationDialog } from "./ManagerIssueConfirmationDialog";
import { ManagerSettingsConfirmationDialog } from "./ManagerSettingsConfirmationDialog";
import {
  ManagerCandidatePageSkeleton,
  ManagerExternalInvitePageSkeleton,
  ManagerSettingsSkeleton,
} from "./ManagerSettingsSkeleton";
import { ManagerSettingsView } from "./ManagerSettingsView";
import type {
  ManagerInvitationIssueConfirmation,
  ManagerSettingsCandidate,
  ManagerSettingsConfirmation,
  ReadyManagerSettingsOverview,
} from "./types";

const personId = "person-manager" as Id<"organizationPeople">;
const secondPersonId = "person-manager-second" as Id<"organizationPeople">;
const candidateId = "person-candidate" as Id<"organizationPeople">;
const disabledCandidateId = "person-disabled" as Id<"organizationPeople">;
const invitationId = "invitation-manager" as Id<"organizationInvitations">;
const shopId = "shop-shibuya";
const requestId = "00000000-0000-4000-8000-000000000001";
const noop = () => undefined;

const overview: ReadyManagerSettingsOverview = {
  kind: "ready",
  organizationName: "株式会社さくらダイニング",
  mode: "managerAddition",
  usage: {
    activeManagers: 2,
    activeInvitationCount: 1,
    pendingAdditions: 1,
    pendingExchanges: 0,
    projectedManagers: 3,
    maxManagers: 5,
  },
  actions: {
    canInviteExistingStaff: true,
    canInviteExternal: true,
  },
  managers: [
    {
      personId,
      name: "田中 太郎",
      contactEmail: "tanaka@sakura.example.com",
      role: "active",
      isSelf: true,
      canRemoveRole: true,
    },
    {
      personId: secondPersonId,
      name: "佐藤 花子",
      contactEmail: "sato@sakura.example.com",
      role: "active",
      isSelf: false,
      canRemoveRole: true,
    },
  ],
  invitations: [
    {
      invitationId,
      name: "鈴木 次郎",
      invitedEmail: "suzuki@sakura.example.com",
      purpose: "managerAddition",
      status: "pending",
      expiresAt: Date.UTC(2026, 7, 20, 9, 0),
      canResend: true,
      canRevoke: true,
    },
  ],
};

const candidates: ManagerSettingsCandidate[] = [
  {
    personId: candidateId,
    name: "山田 一郎",
    contactEmail: "yamada@sakura.example.com",
    canSelect: true,
  },
  {
    personId: disabledCandidateId,
    name: "高橋 美咲",
    contactEmail: "takahashi@sakura.example.com",
    canSelect: false,
    disabledReason: "管理者招待の承認待ちです。",
  },
];

const meta = {
  title: "Features/ManagerSettings",
  component: ManagerSettingsView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Box bg="gray.50" minH="100dvh" p={{ base: 4, md: 8 }}>
        <Box maxW="1024px" mx="auto">
          <Story />
        </Box>
      </Box>
    ),
  ],
  args: {
    overview,
    shopId,
    onBack: noop,
    onRequestResend: noop,
    onRequestRevoke: noop,
    onRequestRemoveRole: noop,
  },
} satisfies Meta<typeof ManagerSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "管理者設定" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "既存スタッフを管理者として招待" })).toBeInTheDocument();
    await expect(canvas.getByRole("article", { name: "鈴木 次郎さんへの管理者招待" })).toBeInTheDocument();
  },
};

export const DefaultMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const FreePendingExchange: Story = {
  args: {
    overview: {
      ...overview,
      mode: "freeManagerExchange",
      usage: {
        activeManagers: 1,
        activeInvitationCount: 1,
        pendingAdditions: 0,
        pendingExchanges: 1,
        projectedManagers: 1,
        maxManagers: 1,
      },
      actions: {
        canInviteExistingStaff: false,
        existingStaffDisabledReason: "次の管理者の承認待ちです。招待を取り消すと別のスタッフを選べます。",
        canInviteExternal: false,
        externalDisabledReason: "Freeでは組織内の既存スタッフと交代できます。",
      },
      managers: [
        {
          ...overview.managers[0],
          canRemoveRole: false,
          removeRoleDisabledReason: "Freeでは、次の管理者への交代招待を利用してください。",
        },
      ],
      invitations: [{ ...overview.invitations[0], purpose: "freeManagerExchange" }],
    },
  },
};

export const AtCapacity: Story = {
  args: {
    overview: {
      ...overview,
      usage: { ...overview.usage, activeManagers: 5, projectedManagers: 5, maxManagers: 5 },
      actions: {
        canInviteExistingStaff: false,
        existingStaffDisabledReason: "管理者と招待中の管理者は、組織全体で5名までです。",
        canInviteExternal: false,
        externalDisabledReason: "管理者と招待中の管理者は、組織全体で5名までです。",
      },
      invitations: [{ ...overview.invitations[0], status: "limitReached" }],
    },
  },
};

export const Restricted: Story = {
  args: {
    overview: {
      ...overview,
      mode: "restricted",
      actions: {
        canInviteExistingStaff: false,
        existingStaffDisabledReason: "契約状態を復旧してから変更できます。",
        canInviteExternal: false,
        externalDisabledReason: "契約状態を復旧してから変更できます。",
      },
      managers: [
        {
          ...overview.managers[0],
          role: "readOnly",
          canRemoveRole: false,
          removeRoleDisabledReason: "契約状態を復旧してから変更できます。",
        },
      ],
    },
  },
};

export const NoPendingInvitations: Story = {
  args: {
    overview: {
      ...overview,
      usage: { ...overview.usage, activeInvitationCount: 0, pendingAdditions: 0, projectedManagers: 2 },
      invitations: [],
    },
  },
};

export const LongContent: Story = {
  args: {
    overview: {
      ...overview,
      managers: [
        {
          ...overview.managers[0],
          name: "東日本エリア統括マネージャー兼店舗運営責任者 田中太郎",
          contactEmail: "very-long-contact-address-for-shift-notifications@example-long-domain.co.jp",
        },
      ],
      invitations: [
        {
          ...overview.invitations[0],
          name: "全国店舗運営本部 新規事業開発部門責任者 鈴木次郎",
          invitedEmail: "very-long-invitation-address@example-long-domain.co.jp",
        },
      ],
    },
  },
};

export const ConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ManagerSettingsConfirmationHarness />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const invitation = page.getByRole("article", { name: "鈴木 次郎さんへの管理者招待" });
    await userEvent.click(within(invitation).getByRole("button", { name: "取り消す" }));
    const confirmation = await page.findByRole("alertdialog", { name: "管理者招待を取り消しますか？" });
    await expect(within(confirmation).getByText(/招待用に確保していた管理者枠が空きます/)).toBeInTheDocument();
    await userEvent.click(within(confirmation).getByRole("button", { name: "招待を取り消す" }));
    await expect(page.getByTestId("manager-confirmation-count")).toHaveTextContent("1");
  },
};

export const CandidateSelectionBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ManagerCandidateHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const radio = canvas.getByRole("radio", { name: "山田 一郎を選択" });
    await expect(radio).not.toBeChecked();
    await expect(canvas.getByRole("radio", { name: "高橋 美咲を選択" })).toBeDisabled();
    await userEvent.click(radio);
    await expect(radio).toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "管理者として招待する" }));
    await expect(canvas.getByTestId("candidate-submit-count")).toHaveTextContent("1");
  },
};

export const CandidateMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => (
    <SubpageFrame title="既存スタッフを管理者として招待">
      <ManagerCandidateListView
        candidates={candidates}
        selectedPersonId={candidateId}
        isSubmitting={false}
        onSelect={noop}
        onSubmit={noop}
      />
    </SubpageFrame>
  ),
};

export const CandidateUnavailableAtCapacity: Story = {
  render: () => (
    <SubpageFrame title="既存スタッフを管理者として招待">
      <ManagerCandidatePageContent
        overview={{
          ...overview,
          actions: {
            ...overview.actions,
            canInviteExistingStaff: false,
            existingStaffDisabledReason: "管理者と招待中の管理者は、組織全体で5名までです。",
          },
        }}
        result={{ kind: "ready", candidates }}
        shopId={shopId}
      />
    </SubpageFrame>
  ),
};

export const ExternalInvitationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ManagerExternalInviteHarness />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(page.getByRole("textbox", { name: "氏名" }), "伊藤 真理");
    await userEvent.type(page.getByRole("textbox", { name: "メールアドレス" }), "ito@example.com");
    await userEvent.click(page.getByRole("button", { name: "招待内容を確認する" }));
    const confirmation = await screen.findByRole("alertdialog", { name: "新しい管理者を招待しますか？" });
    await expect(within(confirmation).getByText("ito@example.com")).toBeInTheDocument();
    await userEvent.click(within(confirmation).getByRole("button", { name: "招待する" }));
    await expect(page.getByTestId("external-invite-count")).toHaveTextContent("1");
  },
};

export const ExternalInvitationMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => (
    <SubpageFrame title="新しいユーザーを管理者として招待">
      <ManagerExternalInviteFormView isSubmitting={false} onRequestInvite={noop} />
    </SubpageFrame>
  ),
};

export const Loading: Story = { render: () => <ManagerSettingsSkeleton /> };

export const LoadingMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <ManagerSettingsSkeleton />,
};

export const CandidateLoadingMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <ManagerCandidatePageSkeleton />,
};

export const ExternalLoadingMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <ManagerExternalInvitePageSkeleton />,
};

function ManagerSettingsConfirmationHarness() {
  const [confirmation, setConfirmation] = useState<ManagerSettingsConfirmation>(null);
  const [confirmationCount, setConfirmationCount] = useState(0);
  return (
    <>
      <output hidden data-testid="manager-confirmation-count">
        {confirmationCount}
      </output>
      <ManagerSettingsView
        overview={overview}
        shopId={shopId}
        onBack={noop}
        onRequestResend={(invitation) => setConfirmation({ kind: "resend", invitation, requestId })}
        onRequestRevoke={(invitation) => setConfirmation({ kind: "revoke", invitation, requestId })}
        onRequestRemoveRole={(manager) => setConfirmation({ kind: "removeRole", manager, requestId })}
      />
      <ManagerSettingsConfirmationDialog
        confirmation={confirmation}
        isRunning={false}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          setConfirmationCount((count) => count + 1);
          setConfirmation(null);
        }}
      />
    </>
  );
}

function ManagerCandidateHarness() {
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [submitCount, setSubmitCount] = useState(0);
  return (
    <SubpageFrame title="既存スタッフを管理者として招待">
      <output hidden data-testid="candidate-submit-count">
        {submitCount}
      </output>
      <ManagerCandidateListView
        candidates={candidates}
        selectedPersonId={selectedPersonId}
        isSubmitting={false}
        onSelect={setSelectedPersonId}
        onSubmit={() => setSubmitCount((count) => count + 1)}
      />
    </SubpageFrame>
  );
}

function ManagerExternalInviteHarness() {
  const [confirmation, setConfirmation] = useState<ManagerInvitationIssueConfirmation>(null);
  const [inviteCount, setInviteCount] = useState(0);
  return (
    <SubpageFrame title="新しいユーザーを管理者として招待">
      <output hidden data-testid="external-invite-count">
        {inviteCount}
      </output>
      <ManagerExternalInviteFormView
        isSubmitting={false}
        onRequestInvite={(invitedName, email) => setConfirmation({ kind: "external", invitedName, email, requestId })}
      />
      <ManagerIssueConfirmationDialog
        confirmation={confirmation}
        isRunning={false}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          setInviteCount((count) => count + 1);
          setConfirmation(null);
        }}
      />
    </SubpageFrame>
  );
}

function SubpageFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <DetailPageHeader title={title} onBack={noop} backAriaLabel="管理者設定へ戻る" />
      {children}
    </Stack>
  );
}
