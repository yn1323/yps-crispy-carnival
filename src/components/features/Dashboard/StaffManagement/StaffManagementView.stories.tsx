import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import type { StaffInvitationMethod, StaffInvitationViewModel } from "./StaffInvitationDialog";
import { StaffManagementView } from "./StaffManagementView";

const noop = () => {};
const lazyBodyWait = { timeout: 15_000 };

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

    const manualCard = page.getByRole("button", { name: "あなたが情報を入力する" });
    await userEvent.click(manualCard);
    const manualHeading = await page.findByRole("heading", { name: "管理者が情報を入力して追加する" });
    await waitFor(() => expect(manualHeading).toHaveFocus());
    await expect(page.getByRole("button", { name: "スタッフを登録する" })).toHaveAttribute("form", "add-staff-form");
    const manualDialog = page.getByRole("dialog", { name: "スタッフを追加" });
    const manualActionArea = getActionArea(manualDialog);
    await expect(manualActionArea.querySelector('[data-dialog-action="start"]')).toBeInTheDocument();
    await expect(manualActionArea.querySelector('[data-dialog-action="end"]')).toBeInTheDocument();
    const manualActions = within(manualActionArea).getAllByRole("button");
    await expect(manualActions).toHaveLength(2);
    await expect(manualActions[0]).toHaveAccessibleName("戻る");
    await expect(manualActions[1]).toHaveAccessibleName("スタッフを登録する");
    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    await waitFor(() => expect(page.getByRole("button", { name: "あなたが情報を入力する" })).toHaveFocus());

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

    await userEvent.click(await page.findByRole("button", { name: "あなたが情報を入力する" }, lazyBodyWait));
    const [nameInput] = await page.findAllByPlaceholderText("サンプル スタッフ");
    await userEvent.type(nameInput, "入力途中のスタッフ");

    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    await userEvent.click(await page.findByRole("button", { name: "スタッフ本人に登録してもらう" }));
    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    await userEvent.click(await page.findByRole("button", { name: "あなたが情報を入力する" }));

    const [retainedNameInput] = await page.findAllByPlaceholderText("サンプル スタッフ");
    await expect(retainedNameInput).toHaveValue("入力途中のスタッフ");

    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    const dialog = page.getByRole("dialog", { name: "スタッフを追加" });
    await userEvent.click(within(getActionArea(dialog)).getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "スタッフを追加" })).not.toBeInTheDocument());

    const [openButton] = canvas.getAllByRole("button", { name: "スタッフを追加する" });
    await userEvent.click(openButton);
    await page.findByRole("button", { name: "スタッフ本人に登録してもらう" }, lazyBodyWait);
    await userEvent.click(await page.findByRole("button", { name: "あなたが情報を入力する" }, lazyBodyWait));
    const [resetNameInput] = await page.findAllByPlaceholderText("サンプル スタッフ");
    await expect(resetNameInput).toHaveValue("");
  },
};

function getActionArea(dialog: HTMLElement) {
  const actionArea = dialog.querySelector<HTMLElement>("[data-dialog-action-area]");
  if (!actionArea) throw new Error("Dialog action area was not rendered");
  return actionArea;
}

function ProductionStaffInvitationHarness() {
  const [selectedMethod, setSelectedMethod] = useState<StaffInvitationMethod | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  const closeDialog = () => {
    setIsOpen(false);
    setSelectedMethod(null);
  };
  const openDialog = () => {
    setSelectedMethod(null);
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
    registrationLinkId: "registration-link-1" as Id<"shopRegistrationLinks">,
    registrationUrl: "https://shiftori.example.com/staff/register/shop_123",
    registrationUrlError: false,
    peopleCapacityResolution: null,
    isRegistrationUrlLoading: false,
    isConfirmingRegistrationLinkRotation: false,
    isRotatingRegistrationLink: false,
    isAddingStaffs: false,
    addingOrganizationPersonId: null,
    isAddingOrganizationPerson: false,
    onOpen: openDialog,
    onClose: closeDialog,
    onSelectMethod: setSelectedMethod,
    onBackToMethods: () => setSelectedMethod(null),
    onRetryRegistrationUrl: noop,
    onRequestRegistrationLinkRotation: noop,
    onCancelRegistrationLinkRotation: noop,
    onRotateRegistrationLink: noop,
    onAddStaffs: noop,
    onAddOrganizationPerson: noop,
  };

  return (
    <StaffManagementView
      staffs={[]}
      status="Exhausted"
      canLoadMore={false}
      onLoadMore={noop}
      onOpenDetail={noop}
      invitation={invitation}
    />
  );
}
