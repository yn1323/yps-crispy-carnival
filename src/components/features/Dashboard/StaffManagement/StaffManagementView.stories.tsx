import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import type { StaffInvitationMethod, StaffInvitationViewModel } from "./StaffInvitationDialog";
import { StaffManagementView } from "./StaffManagementView";

const noop = () => {};
const lazyBodyWait = { timeout: 5_000 };

const closedDetail = {
  staff: null,
  dialog: { isOpen: false, onOpenChange: noop },
  onOpenChange: noop,
  onClose: noop,
  onEdit: noop,
  isEditing: false,
  onDelete: noop,
  isDeleting: false,
  onShowLineQr: noop,
  lineQrState: { staffId: null, authorizeUrl: null, isLoading: false },
  onSendLineInvite: noop,
  isSendingLineInvite: false,
  onSendRecruitments: noop,
  isSendingRecruitments: false,
  onSendCurrentShift: noop,
  isSendingCurrentShift: false,
  notificationHistory: null,
  onChangeShiftTarget: noop,
  isChangingShiftTarget: false,
  onInviteManager: async () => false,
  isInvitingManager: false,
};

const meta = {
  title: "Features/Dashboard/StaffManagementView/StaffInvitation",
  component: ProductionStaffInvitationHarness,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ProductionStaffInvitationHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 本番と同じStaffManagementView、DeferredDialogBoundary、lazy本文の合成を描画する。 */
export const ProductionComposition: Story = {
  render: () => <ProductionStaffInvitationHarness />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole("dialog", { name: "スタッフを追加" });
    await page.findByRole("button", { name: "スタッフ本人に登録してもらう" }, lazyBodyWait);
  },
};

export const MethodNavigationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ProductionStaffInvitationHarness />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    const linkCard = await page.findByRole("button", { name: "スタッフ本人に登録してもらう" }, lazyBodyWait);
    await waitFor(() => expect(linkCard).toHaveFocus());
    const initialActionArea = getActionArea(page.getByRole("dialog", { name: "スタッフを追加" }));
    await expect(initialActionArea).toHaveAttribute("data-layout", "standard");
    await expect(within(initialActionArea).getAllByRole("button")).toHaveLength(1);
    await expect(within(initialActionArea).getByRole("button", { name: "閉じる" })).toBeInTheDocument();
    await userEvent.click(linkCard);
    const linkHeading = await page.findByRole("heading", { name: "スタッフ本人に登録してもらう" });
    await waitFor(() => expect(linkHeading).toHaveFocus());
    const linkActionArea = getActionArea(page.getByRole("dialog", { name: "スタッフを追加" }));
    await expect(linkActionArea.querySelector('[data-dialog-action="start"]')).toBeInTheDocument();
    await expect(linkActionArea.querySelector('[data-dialog-action="end"]')).toBeInTheDocument();
    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    await waitFor(() => expect(page.getByRole("button", { name: "スタッフ本人に登録してもらう" })).toHaveFocus());

    const manualCard = page.getByRole("button", { name: "管理者が情報を入力して追加する" });
    await userEvent.click(manualCard);
    const manualHeading = await page.findByRole("heading", { name: "管理者が情報を入力して追加する" });
    await waitFor(() => expect(manualHeading).toHaveFocus());
    await expect(page.getByRole("button", { name: "スタッフを登録する" })).toHaveAttribute("form", "add-staff-form");
    const manualDialog = page.getByRole("dialog", { name: "スタッフを追加" });
    const manualActionArea = getActionArea(manualDialog);
    await expect(manualActionArea).toHaveAttribute("data-mobile-layout", "stacked");
    await expect(manualActionArea.querySelector('[data-dialog-action="start"]')).toBeInTheDocument();
    await expect(manualActionArea.querySelector('[data-dialog-action="end"]')).toBeInTheDocument();
    await expect(within(manualActionArea).getAllByRole("button")).toHaveLength(2);
    await expect(within(manualActionArea).getByRole("button", { name: "戻る" })).toBeInTheDocument();
    await expect(within(manualActionArea).getByRole("button", { name: "スタッフを登録する" })).toBeInTheDocument();
    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    await waitFor(() => expect(page.getByRole("button", { name: "管理者が情報を入力して追加する" })).toHaveFocus());

    const organizationCard = page.getByRole("button", { name: "別店舗のスタッフを追加する" });
    await userEvent.click(organizationCard);
    const organizationHeading = await page.findByRole("heading", { name: "別店舗のスタッフを追加する" });
    await waitFor(() => expect(organizationHeading).toHaveFocus());
    await page.findByLabelText("他店舗スタッフを読み込み中");
    const organizationDialog = page.getByRole("dialog", { name: "スタッフを追加" });
    const organizationActionArea = getActionArea(organizationDialog);
    const organizationActions = within(organizationActionArea).getAllByRole("button");
    await expect(organizationActionArea.querySelector('[data-dialog-action="start"]')).toBeInTheDocument();
    await expect(organizationActionArea.querySelector('[data-dialog-action="end"]')).not.toBeInTheDocument();
    await expect(organizationActions).toHaveLength(1);
    await expect(organizationActions[0]).toHaveAccessibleName("戻る");
    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    await waitFor(() => expect(page.getByRole("button", { name: "別店舗のスタッフを追加する" })).toHaveFocus());
  },
};

export const ManualDraftRetentionAndCloseResetBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ProductionStaffInvitationHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(await page.findByRole("button", { name: "管理者が情報を入力して追加する" }, lazyBodyWait));
    const [nameInput] = await page.findAllByPlaceholderText("例：田中 花子");
    await userEvent.type(nameInput, "入力途中のスタッフ");

    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    await userEvent.click(await page.findByRole("button", { name: "スタッフ本人に登録してもらう" }));
    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    await userEvent.click(await page.findByRole("button", { name: "管理者が情報を入力して追加する" }));

    const [retainedNameInput] = await page.findAllByPlaceholderText("例：田中 花子");
    await expect(retainedNameInput).toHaveValue("入力途中のスタッフ");

    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    const dialog = page.getByRole("dialog", { name: "スタッフを追加" });
    await userEvent.click(within(getActionArea(dialog)).getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "スタッフを追加" })).not.toBeInTheDocument());

    const [openButton] = canvas.getAllByRole("button", { name: "スタッフを追加する" });
    await userEvent.click(openButton);
    await page.findByRole("button", { name: "スタッフ本人に登録してもらう" }, lazyBodyWait);
    await userEvent.click(await page.findByRole("button", { name: "管理者が情報を入力して追加する" }, lazyBodyWait));
    const [resetNameInput] = await page.findAllByPlaceholderText("例：田中 花子");
    await expect(resetNameInput).toHaveValue("");
  },
};

export const ReactivationInlineConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ProductionStaffInvitationHarness reactivationOnManualSubmit />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(await page.findByRole("button", { name: "管理者が情報を入力して追加する" }, lazyBodyWait));
    const [nameInput] = await page.findAllByPlaceholderText("例：田中 花子");
    const [emailInput] = await page.findAllByPlaceholderText("例：hanako@example.com");
    await userEvent.type(nameInput, "再追加スタッフ");
    await userEvent.type(emailInput, "reactivation@example.com");
    await userEvent.click(page.getByRole("button", { name: "スタッフを登録する" }));

    const confirmation = await page.findByRole("alertdialog", { name: "削除済みの人物を再追加しますか？" });
    await expect(page.queryAllByRole("dialog")).toHaveLength(0);
    await expect(page.getAllByRole("alertdialog")).toHaveLength(1);
    const confirmationActionArea = getActionArea(confirmation);
    await expect(confirmationActionArea).toHaveAttribute("data-mobile-layout", "stacked");
    const confirmationActions = within(confirmationActionArea);
    await expect(confirmationActions.queryByRole("button", { name: "戻る" })).not.toBeInTheDocument();
    await expect(confirmationActions.queryByRole("button", { name: "スタッフを登録する" })).not.toBeInTheDocument();
    const cancelButton = confirmationActions.getByRole("button", { name: "キャンセル" });
    await waitFor(() => expect(cancelButton).toHaveFocus());
    await userEvent.click(cancelButton);

    await waitFor(() => expect(page.queryByRole("alertdialog")).not.toBeInTheDocument());
    const restoredDialog = await page.findByRole("dialog", { name: "スタッフを追加" });
    await expect(page.queryAllByRole("dialog")).toHaveLength(1);
    const restoredHeading = within(restoredDialog).getByRole("heading", {
      name: "管理者が情報を入力して追加する",
    });
    await waitFor(() => expect(restoredHeading).toHaveFocus());
    const [restoredNameInput] = within(restoredDialog).getAllByPlaceholderText("例：田中 花子");
    const [restoredEmailInput] = within(restoredDialog).getAllByPlaceholderText("例：hanako@example.com");
    await expect(restoredNameInput).toHaveValue("再追加スタッフ");
    await expect(restoredEmailInput).toHaveValue("reactivation@example.com");
  },
};

function getActionArea(dialog: HTMLElement) {
  const actionArea = dialog.querySelector<HTMLElement>("[data-dialog-action-area]");
  if (!actionArea) throw new Error("Dialog action area was not rendered");
  return actionArea;
}

function ProductionStaffInvitationHarness({
  reactivationOnManualSubmit = false,
}: {
  reactivationOnManualSubmit?: boolean;
}) {
  const [selectedMethod, setSelectedMethod] = useState<StaffInvitationMethod | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [isReactivationOpen, setIsReactivationOpen] = useState(false);

  const closeDialog = () => {
    setIsOpen(false);
    setSelectedMethod(null);
    setIsReactivationOpen(false);
  };
  const openDialog = () => {
    setSelectedMethod(null);
    setIsReactivationOpen(false);
    setIsOpen(true);
  };
  const invitation: StaffInvitationViewModel = {
    dialog: {
      isOpen,
      onOpenChange: ({ open }) => {
        if (open) openDialog();
        else closeDialog();
      },
    },
    selectedMethod,
    showOrganizationPeopleAddition: true,
    registrationUrl: "https://shiftori.example.com/staff/register/shop_123",
    registrationUrlError: false,
    peopleCapacityResolution: null,
    isRegistrationUrlLoading: false,
    isAddingStaffs: false,
    addingOrganizationPersonId: null,
    isAddingOrganizationPerson: false,
    onOpen: openDialog,
    onClose: closeDialog,
    onSelectMethod: setSelectedMethod,
    onBackToMethods: () => setSelectedMethod(null),
    onRetryRegistrationUrl: noop,
    onAddStaffs: () => {
      if (reactivationOnManualSubmit) setIsReactivationOpen(true);
    },
    onAddOrganizationPerson: noop,
    reactivationConfirmation: {
      dialog: {
        isOpen: isReactivationOpen,
        onOpenChange: ({ open }) => setIsReactivationOpen(open),
      },
      candidates: isReactivationOpen
        ? [
            {
              personId: "reactivation-person" as Id<"organizationPeople">,
              name: "再追加スタッフ",
              email: "reactivation@example.com",
            },
          ]
        : [],
      isConfirming: false,
      onConfirm: closeDialog,
      onClose: () => setIsReactivationOpen(false),
    },
  };

  return (
    <StaffManagementView
      staffs={[]}
      status="Exhausted"
      canLoadMore={false}
      onLoadMore={noop}
      openRecruitments={[]}
      currentRecruitments={[]}
      onOpenDetail={noop}
      invitation={invitation}
      detail={closedDetail}
    />
  );
}
