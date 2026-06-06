import { Box, Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffRegistrationRequestBanner, StaffRegistrationRequestDialog } from "./index";

const requests = [
  {
    _id: "req-1" as Id<"staffRegistrationRequests">,
    name: "田中 花子",
    email: "hanako@example.com",
    createdAt: Date.now(),
  },
  {
    _id: "req-2" as Id<"staffRegistrationRequests">,
    name: "佐藤 太郎",
    email: "sato.long-address@example.com",
    createdAt: Date.now(),
  },
];

const meta = {
  title: "Features/Dashboard/StaffRegistrationRequests",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Banner: Story = {
  render: () => (
    <Box w="720px" maxW="calc(100vw - 32px)">
      <StaffRegistrationRequestBanner requestCount={requests.length} onClick={() => {}} />
    </Box>
  ),
};

export const DialogOpen: Story = {
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
        onApprove={() => {}}
        onReject={() => {}}
      />
    </Stack>
  ),
};
