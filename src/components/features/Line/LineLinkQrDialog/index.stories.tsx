import { Box, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LineLinkQrDialog } from ".";

const meta = {
  title: "Features/Line/LineLinkQrDialog",
  component: LineLinkQrDialog,
  parameters: { layout: "padded" },
} satisfies Meta<typeof LineLinkQrDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  args: {
    authorizeUrl: "https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=12345&state=abc",
    staffName: "田中太郎",
  },
  render: () => (
    <Stack gap={8} maxW="480px" mx="auto" w="full">
      <VariantBlock label="QR表示（URL確定済み）">
        <LineLinkQrDialog
          authorizeUrl="https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=12345&state=4d3c2b1a-5678-4abc-9def-0123456789ab"
          staffName="田中太郎"
        />
      </VariantBlock>
      <VariantBlock label="読み込み中">
        <LineLinkQrDialog authorizeUrl={null} isLoading staffName="田中太郎" />
      </VariantBlock>
    </Stack>
  ),
};

const VariantBlock = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Stack gap={3}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" letterSpacing="0.08em" textTransform="uppercase">
      {label}
    </Text>
    <Box bg="white" p={4} borderRadius="lg" borderWidth="1px" borderColor="blackAlpha.100">
      {children}
    </Box>
  </Stack>
);
