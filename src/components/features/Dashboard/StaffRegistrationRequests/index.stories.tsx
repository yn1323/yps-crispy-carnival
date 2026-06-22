import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
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

export const MobileDialogOpen: Story = {
  parameters: {
    layout: "fullscreen",
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => <DialogOpenStory />,
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
