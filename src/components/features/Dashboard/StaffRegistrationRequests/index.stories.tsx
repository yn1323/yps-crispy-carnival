import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import type { StaffRegistrationRequest } from "../types";
import { StaffRegistrationRequestDialog } from "./index";

const requestedAt = new Date("2026-06-22T04:30:00.000Z").getTime();

const requests = [
  {
    _id: "req-1" as Id<"staffRegistrationRequests">,
    name: "田中 花子",
    email: "hanako@example.com",
    createdAt: requestedAt,
    canApprove: true,
    approveDisabledReason: null,
  },
  {
    _id: "req-2" as Id<"staffRegistrationRequests">,
    name: "佐藤 太郎",
    email: "sato.long-address-for-mobile-check@example.com",
    createdAt: requestedAt,
    canApprove: true,
    approveDisabledReason: null,
  },
] satisfies StaffRegistrationRequest[];

const approvalUnavailableRequests = [
  {
    ...requests[0],
    canApprove: false,
    approveDisabledReason: "この申請は現在承認できません。不要な申請は却下できます。",
  },
] satisfies StaffRegistrationRequest[];

const legacyRequests = [
  {
    _id: "legacy-req" as Id<"staffRegistrationRequests">,
    name: "旧データ申請者",
    email: "legacy@example.com",
    createdAt: requestedAt,
  },
] satisfies StaffRegistrationRequest[];

const meta = {
  title: "Features/Dashboard/StaffRegistrationRequests",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const DialogOpen: Story = {
  parameters: {
    layout: "fullscreen",
  },
  render: () => <DialogOpenStory />,
};

export const ProCapacityReached: Story = {
  parameters: {
    layout: "fullscreen",
  },
  render: () => (
    <Stack minH="100vh" bg="gray.50">
      <StaffRegistrationRequestDialog
        isOpen
        onOpenChange={() => {}}
        onClose={() => {}}
        requests={requests}
        peopleCapacityResolution={{ kind: "contact", current: 30, max: 30 }}
        onApprove={() => {}}
        onReject={() => {}}
      />
    </Stack>
  ),
};

export const ApprovalUnavailable: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <StaffRegistrationRequestDialog
      isOpen
      onOpenChange={() => {}}
      onClose={() => {}}
      requests={approvalUnavailableRequests}
      onApprove={() => {}}
      onReject={() => {}}
    />
  ),
};

export const MobileDialogOpen: Story = {
  tags: ["vrt-mobile1"],
  parameters: {
    layout: "fullscreen",
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <DialogOpenStory />,
};

export const RejectConfirmation: Story = {
  parameters: { layout: "fullscreen" },
  render: () => <RejectConfirmationStory />,
};

export const MobileRejectConfirmation: Story = {
  tags: ["vrt-mobile1"],
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <RejectConfirmationStory />,
};

export const RejectConfirmationBehavior: Story = {
  parameters: { layout: "fullscreen", screenshot: { skip: true } },
  render: () => <InteractiveRejectStory />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "スタッフ登録申請" });
    const requestButton = within(dialog).getByRole("button", { name: "田中 花子を却下" });
    await userEvent.click(requestButton);

    const confirmation = await body.findByRole("alertdialog", { name: "スタッフ登録申請を却下" });
    await expect(body.getAllByRole("alertdialog")).toHaveLength(1);
    await expect(body.queryByRole("dialog", { name: "スタッフ登録申請" })).not.toBeInTheDocument();
    await expect(within(confirmation).getByTestId("registration-reject-confirmation")).toHaveFocus();
    await userEvent.click(within(confirmation).getByRole("button", { name: "キャンセル" }));

    const reopenedDialog = await body.findByRole("dialog", { name: "スタッフ登録申請" });
    const restoredButton = within(reopenedDialog).getByRole("button", { name: "田中 花子を却下" });
    await expect(restoredButton).toHaveFocus();
    await userEvent.click(restoredButton);
    const reopenedConfirmation = await body.findByRole("alertdialog", { name: "スタッフ登録申請を却下" });
    await userEvent.click(within(reopenedConfirmation).getByRole("button", { name: "この申請を却下" }));

    await waitFor(() =>
      expect(within(reopenedDialog).queryByRole("button", { name: "田中 花子を却下" })).not.toBeInTheDocument(),
    );
  },
};

export const ApprovalUnavailableBehavior: Story = {
  parameters: { layout: "fullscreen", screenshot: { skip: true } },
  render: () => <InteractiveApprovalUnavailableStory />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "スタッフ登録申請" });
    const approveButton = within(dialog).getByRole("button", { name: "旧データ申請者を承認" });
    const rejectButton = within(dialog).getByRole("button", { name: "旧データ申請者を却下" });

    await expect(approveButton).toBeDisabled();
    await expect(rejectButton).toBeEnabled();
    await userEvent.click(rejectButton);
    await body.findByRole("alertdialog", { name: "スタッフ登録申請を却下" });
  },
};

const DialogOpenStory = () => (
  <Stack minH="100vh" bg="gray.50">
    <StaffRegistrationRequestDialog
      isOpen
      onOpenChange={() => {}}
      onClose={() => {}}
      requests={requests}
      onApprove={() => {}}
      onReject={() => {}}
    />
  </Stack>
);

const RejectConfirmationStory = () => (
  <StaffRegistrationRequestDialog
    isOpen
    onOpenChange={() => {}}
    onClose={() => {}}
    requests={requests}
    onApprove={() => {}}
    onReject={() => {}}
    rejectTarget={requests[0]}
    onRejectClose={() => {}}
    onRejectConfirm={() => {}}
  />
);

const InteractiveRejectStory = () => {
  const [visibleRequests, setVisibleRequests] = useState<StaffRegistrationRequest[]>(requests);
  const [rejectTarget, setRejectTarget] = useState<StaffRegistrationRequest | null>(null);

  return (
    <StaffRegistrationRequestDialog
      isOpen
      onOpenChange={() => {}}
      onClose={() => {}}
      requests={visibleRequests}
      onApprove={() => {}}
      onReject={setRejectTarget}
      rejectTarget={rejectTarget}
      onRejectClose={() => setRejectTarget(null)}
      onRejectConfirm={() => {
        if (!rejectTarget) return;
        setVisibleRequests((current) => current.filter((request) => request._id !== rejectTarget._id));
        setRejectTarget(null);
      }}
    />
  );
};

const InteractiveApprovalUnavailableStory = () => {
  const [rejectTarget, setRejectTarget] = useState<StaffRegistrationRequest | null>(null);

  return (
    <StaffRegistrationRequestDialog
      isOpen
      onOpenChange={() => {}}
      onClose={() => {}}
      requests={legacyRequests}
      onApprove={() => {}}
      onReject={setRejectTarget}
      rejectTarget={rejectTarget}
      onRejectClose={() => setRejectTarget(null)}
      onRejectConfirm={() => {}}
    />
  );
};
