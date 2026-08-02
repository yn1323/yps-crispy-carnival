import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import {
  OrganizationPeopleCandidateListView,
  type OrganizationPersonCandidate,
} from "./OrganizationPeopleCandidateList";
import {
  StaffInvitationDialogView,
  type StaffInvitationTab,
  type StaffInvitationViewModel,
} from "./StaffInvitationDialog";

const personId = (value: string) => value as Id<"organizationPeople">;

const candidates: OrganizationPersonCandidate[] = [
  {
    personId: personId("person-1"),
    name: "佐藤 真由美",
    email: "mayumi.sato@example.com",
    shopNames: ["新宿店", "渋谷店"],
    isManager: true,
  },
  {
    personId: personId("person-2"),
    name: "高橋 健太",
    email: "kenta.takahashi@example.com",
    shopNames: ["新宿店"],
    isManager: false,
  },
];

const noop = () => {};

function createInvitation(
  activeTab: StaffInvitationTab,
  overrides: Partial<StaffInvitationViewModel> = {},
): StaffInvitationViewModel {
  return {
    dialog: { isOpen: true, onOpenChange: noop },
    activeTab,
    showOrganizationPeopleAddition: true,
    registrationUrl: "https://shiftori.example.com/staff/register/shop_123",
    peopleCapacityResolution: null,
    isRegistrationUrlLoading: false,
    isAddingStaffs: false,
    addingOrganizationPersonId: null,
    isAddingOrganizationPerson: false,
    onOpen: noop,
    onClose: noop,
    onTabChange: noop,
    onAddStaffs: noop,
    onAddOrganizationPerson: noop,
    reactivationConfirmation: {
      dialog: { isOpen: false, onOpenChange: noop },
      candidates: [],
      isConfirming: false,
      onConfirm: noop,
      onClose: noop,
    },
    ...overrides,
  };
}

const candidateList = (
  <OrganizationPeopleCandidateListView candidates={candidates} addingPersonId={null} isAdding={false} onAdd={noop} />
);

const meta = {
  title: "Features/Dashboard/StaffInvitationDialog",
  component: StaffInvitationDialogView,
  parameters: { layout: "fullscreen" },
  args: {
    invitation: createInvitation("link"),
    organizationPeopleContent: candidateList,
  },
} satisfies Meta<typeof StaffInvitationDialogView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkInvitation: Story = {};

export const ManualRegistration: Story = {
  args: {
    invitation: createInvitation("manual"),
  },
};

export const OrganizationPeople: Story = {
  args: {
    invitation: createInvitation("organization"),
  },
};

export const OrganizationPeopleDarkLaunchBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    invitation: createInvitation("organization", { showOrganizationPeopleAddition: false }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await expect(page.queryByRole("tab", { name: "他店舗スタッフを招待" })).not.toBeInTheDocument();
    await expect(page.queryByRole("button", { name: "佐藤 真由美をこの店舗に追加" })).not.toBeInTheDocument();
    await expect(await page.findByRole("tab", { name: "リンクから招待" })).toHaveAttribute("aria-selected", "true");
  },
};

export const OrganizationPersonAdding: Story = {
  args: {
    invitation: createInvitation("organization"),
    organizationPeopleContent: (
      <OrganizationPeopleCandidateListView
        candidates={candidates}
        addingPersonId={personId("person-1")}
        isAdding
        onAdd={noop}
      />
    ),
  },
};

export const OrganizationPeopleEmpty: Story = {
  args: {
    invitation: createInvitation("organization"),
    organizationPeopleContent: (
      <OrganizationPeopleCandidateListView candidates={[]} addingPersonId={null} isAdding={false} onAdd={noop} />
    ),
  },
};

export const OrganizationPeopleLoading: Story = {
  args: {
    invitation: createInvitation("organization"),
    organizationPeopleContent: (
      <OrganizationPeopleCandidateListView
        candidates={[]}
        isLoading
        addingPersonId={null}
        isAdding={false}
        onAdd={noop}
      />
    ),
  },
};

export const OrganizationPeopleError: Story = {
  args: {
    invitation: createInvitation("organization"),
    organizationPeopleContent: (
      <OrganizationPeopleCandidateListView
        candidates={[]}
        errorMessage="モーダルを閉じて、もう一度お試しください。"
        addingPersonId={null}
        isAdding={false}
        onAdd={noop}
      />
    ),
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    invitation: createInvitation("organization"),
  },
};

export const LinkInvitationMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    invitation: createInvitation("link"),
  },
};

export const ManualRegistrationMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    invitation: createInvitation("manual"),
  },
};

export const TabSwitchBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractiveDialog initialTab="link" onAdd={noop} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await expect(page.queryByRole("button", { name: "スタッフを登録する" })).not.toBeInTheDocument();
    await expect(page.queryByRole("button", { name: "佐藤 真由美をこの店舗に追加" })).not.toBeInTheDocument();
    await userEvent.click(await page.findByRole("tab", { name: "管理者が登録" }));
    await expect(await page.findByRole("button", { name: "スタッフを登録する" })).toBeInTheDocument();

    await userEvent.click(await page.findByRole("tab", { name: "他店舗スタッフを招待" }));
    await expect(await page.findByRole("button", { name: "佐藤 真由美をこの店舗に追加" })).toBeInTheDocument();
  },
};

export const LinkTabCloseBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractiveDialog initialTab="link" onAdd={noop} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(await page.findByRole("button", { name: "スタッフ招待を閉じる" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "スタッフを招待" })).not.toBeInTheDocument());
  },
};

export const CandidateAdditionClosesDialog: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractiveDialog initialTab="organization" onAdd={noop} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(await page.findByRole("button", { name: "佐藤 真由美をこの店舗に追加" }));

    await waitFor(() => expect(page.queryByRole("dialog", { name: "スタッフを招待" })).not.toBeInTheDocument());
  },
};

function InteractiveDialog({
  initialTab,
  onAdd,
}: {
  initialTab: StaffInvitationTab;
  onAdd: (personId: Id<"organizationPeople">) => void | Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isOpen, setIsOpen] = useState(true);
  const invitation = createInvitation(activeTab, {
    dialog: {
      isOpen,
      onOpenChange: ({ open }) => setIsOpen(open),
    },
    onClose: () => setIsOpen(false),
    onTabChange: setActiveTab,
    onAddOrganizationPerson: async (targetPersonId) => {
      await onAdd(targetPersonId);
      setIsOpen(false);
    },
  });

  return (
    <StaffInvitationDialogView
      invitation={invitation}
      organizationPeopleContent={
        <OrganizationPeopleCandidateListView
          candidates={candidates}
          addingPersonId={null}
          isAdding={false}
          onAdd={invitation.onAddOrganizationPerson}
        />
      }
    />
  );
}
