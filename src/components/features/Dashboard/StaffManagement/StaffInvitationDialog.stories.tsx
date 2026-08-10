import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/components/ui/Button";
import {
  OrganizationPeopleCandidateListView,
  type OrganizationPersonCandidate,
} from "./OrganizationPeopleCandidateList";
import {
  StaffInvitationDialogView,
  type StaffInvitationMethod,
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
  selectedMethod: StaffInvitationMethod | null,
  overrides: Partial<StaffInvitationViewModel> = {},
): StaffInvitationViewModel {
  return {
    dialog: { isOpen: true, onOpenChange: noop },
    selectedMethod,
    showOrganizationPeopleAddition: true,
    registrationUrl: "https://shiftori.example.com/staff/register/shop_123",
    registrationUrlError: false,
    peopleCapacityResolution: null,
    isRegistrationUrlLoading: false,
    isAddingStaffs: false,
    addingOrganizationPersonId: null,
    isAddingOrganizationPerson: false,
    onOpen: noop,
    onClose: noop,
    onSelectMethod: noop,
    onBackToMethods: noop,
    onRetryRegistrationUrl: noop,
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
    invitation: createInvitation(null),
    organizationPeopleContent: candidateList,
  },
} satisfies Meta<typeof StaffInvitationDialogView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MethodSelection: Story = {};

export const MethodSelectionWithoutOrganizationPeople: Story = {
  args: {
    invitation: createInvitation(null, { showOrganizationPeopleAddition: false }),
  },
};

export const LinkInvitation: Story = {
  args: {
    invitation: createInvitation("link"),
  },
};

export const LinkInvitationLoading: Story = {
  args: {
    invitation: createInvitation("link", {
      registrationUrl: null,
      isRegistrationUrlLoading: true,
    }),
  },
};

export const LinkInvitationError: Story = {
  args: {
    invitation: createInvitation("link", {
      registrationUrl: null,
      registrationUrlError: true,
    }),
  },
};

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

    await expect(page.queryByRole("button", { name: "別店舗のスタッフを追加する" })).not.toBeInTheDocument();
    await expect(page.queryByRole("button", { name: "佐藤 真由美をこの店舗に追加" })).not.toBeInTheDocument();
    await page.findByRole("button", { name: "スタッフ本人に登録してもらう" });
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
        errorMessage="追加方法に戻って、もう一度お試しください。"
        addingPersonId={null}
        isAdding={false}
        onAdd={noop}
      />
    ),
  },
};

export const MethodSelectionMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const OrganizationPeopleMobile: Story = {
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

export const MethodNavigationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractiveDialog onAdd={noop} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    const linkCard = await page.findByRole("button", { name: "スタッフ本人に登録してもらう" });
    await waitFor(() => expect(linkCard).toHaveFocus());
    await userEvent.click(linkCard);
    const linkHeading = await page.findByRole("heading", { name: "スタッフ本人に登録してもらう" });
    await waitFor(() => expect(linkHeading).toHaveFocus());
    await userEvent.click(await page.findByRole("button", { name: "追加方法に戻る" }));
    await waitFor(() => expect(page.getByRole("button", { name: "スタッフ本人に登録してもらう" })).toHaveFocus());

    const manualCard = page.getByRole("button", { name: "管理者が情報を入力して追加する" });
    await userEvent.click(manualCard);
    const manualHeading = await page.findByRole("heading", { name: "管理者が情報を入力して追加する" });
    await waitFor(() => expect(manualHeading).toHaveFocus());
    await userEvent.click(await page.findByRole("button", { name: "追加方法に戻る" }));
    await waitFor(() => expect(page.getByRole("button", { name: "管理者が情報を入力して追加する" })).toHaveFocus());

    const organizationCard = page.getByRole("button", { name: "別店舗のスタッフを追加する" });
    await userEvent.click(organizationCard);
    const organizationHeading = await page.findByRole("heading", { name: "別店舗のスタッフを追加する" });
    await waitFor(() => expect(organizationHeading).toHaveFocus());
    await page.findByRole("button", { name: "佐藤 真由美をこの店舗に追加" });
    await userEvent.click(await page.findByRole("button", { name: "追加方法に戻る" }));
    await waitFor(() => expect(page.getByRole("button", { name: "別店舗のスタッフを追加する" })).toHaveFocus());
  },
};

export const ManualDraftRetentionAndCloseResetBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractiveDialog onAdd={noop} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(await page.findByRole("button", { name: "管理者が情報を入力して追加する" }));
    const [nameInput] = await page.findAllByPlaceholderText("例：田中 花子");
    await userEvent.type(nameInput, "入力途中のスタッフ");

    await userEvent.click(await page.findByRole("button", { name: "追加方法に戻る" }));
    await userEvent.click(await page.findByRole("button", { name: "スタッフ本人に登録してもらう" }));
    await userEvent.click(await page.findByRole("button", { name: "追加方法に戻る" }));
    await userEvent.click(await page.findByRole("button", { name: "管理者が情報を入力して追加する" }));

    const [retainedNameInput] = await page.findAllByPlaceholderText("例：田中 花子");
    await expect(retainedNameInput).toHaveValue("入力途中のスタッフ");

    const closeButtons = await page.findAllByRole("button", { name: "閉じる" });
    await userEvent.click(closeButtons[0]);
    await waitFor(() => expect(page.queryByRole("dialog", { name: "スタッフを追加" })).not.toBeInTheDocument());

    await userEvent.click(await page.findByRole("button", { name: "スタッフ追加を再表示" }));
    await page.findByRole("button", { name: "スタッフ本人に登録してもらう" });
    await userEvent.click(await page.findByRole("button", { name: "管理者が情報を入力して追加する" }));
    const [resetNameInput] = await page.findAllByPlaceholderText("例：田中 花子");
    await expect(resetNameInput).toHaveValue("");
  },
};

export const CandidateAdditionClosesDialog: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractiveDialog initialMethod="organization" onAdd={noop} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(await page.findByRole("button", { name: "佐藤 真由美をこの店舗に追加" }));

    await waitFor(() => expect(page.queryByRole("dialog", { name: "スタッフを追加" })).not.toBeInTheDocument());
  },
};

function InteractiveDialog({
  initialMethod = null,
  onAdd,
}: {
  initialMethod?: StaffInvitationMethod | null;
  onAdd: (personId: Id<"organizationPeople">) => void | Promise<void>;
}) {
  const [selectedMethod, setSelectedMethod] = useState<StaffInvitationMethod | null>(initialMethod);
  const [isOpen, setIsOpen] = useState(true);

  const closeDialog = () => {
    setIsOpen(false);
    setSelectedMethod(null);
  };
  const invitation = createInvitation(selectedMethod, {
    dialog: {
      isOpen,
      onOpenChange: ({ open }) => {
        if (open) {
          setSelectedMethod(null);
          setIsOpen(true);
          return;
        }
        closeDialog();
      },
    },
    onClose: closeDialog,
    onSelectMethod: setSelectedMethod,
    onBackToMethods: () => setSelectedMethod(null),
    onAddOrganizationPerson: async (targetPersonId) => {
      await onAdd(targetPersonId);
      closeDialog();
    },
  });

  return (
    <>
      {!isOpen && (
        <Button type="button" onClick={() => setIsOpen(true)}>
          スタッフ追加を再表示
        </Button>
      )}
      {isOpen && (
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
      )}
    </>
  );
}
