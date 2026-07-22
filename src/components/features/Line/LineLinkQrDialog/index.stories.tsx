import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LineLinkQrDialog } from ".";

const meta = {
  title: "Features/Line/DialogContents",
  component: LineLinkQrDialog,
  parameters: { layout: "padded" },
  args: {
    authorizeUrl: "https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=12345&state=abc",
  },
  decorators: [
    (Story) => (
      <Stack
        align="flex-start"
        bg="white"
        p={4}
        borderRadius="lg"
        borderWidth="1px"
        borderColor="blackAlpha.100"
        maxW="480px"
        mx="auto"
      >
        <Story />
      </Stack>
    ),
  ],
} satisfies Meta<typeof LineLinkQrDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const QrDisplay: Story = {
  args: {
    authorizeUrl:
      "https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=2009985068&redirect_uri=https%3A%2F%2Fexample.com%2Fline%2Fcallback&scope=profile%20openid&state=4d3c2b1a-5678-4abc-9def-0123456789ab",
  },
};

export const Loading: Story = {
  args: {
    authorizeUrl: null,
    isLoading: true,
  },
};
