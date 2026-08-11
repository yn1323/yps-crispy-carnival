import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffRegistrationRequestDialog } from "./index";

const requestedAt = new Date("2026-06-22T04:30:00.000Z").getTime();

const requests = [
  {
    _id: "req-1" as Id<"staffRegistrationRequests">,
    name: "田中 花子",
    email: "hanako@example.com",
    createdAt: requestedAt,
  },
  {
    _id: "req-2" as Id<"staffRegistrationRequests">,
    name: "佐藤 太郎",
    email: "sato.long-address-for-mobile-check@example.com",
    createdAt: requestedAt,
  },
];

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
  const [visibleRequests, setVisibleRequests] = useState(requests);
  const [rejectTarget, setRejectTarget] = useState<(typeof requests)[number] | null>(null);

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
