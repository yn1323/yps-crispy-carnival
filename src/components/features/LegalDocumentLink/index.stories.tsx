import { Box, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LegalDocumentLink } from "./index";

const meta = {
  title: "Features/LegalDocumentLink",
  component: LegalDocumentLink,
  parameters: {
    layout: "padded",
  },
  args: {
    href: "/terms/manager",
    children: "利用規約",
  },
} satisfies Meta<typeof LegalDocumentLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <Stack gap={5} maxW="560px">
      <Box>
        <Text mb={2} fontSize="xs" fontWeight="semibold" color="fg.muted">
          Standalone
        </Text>
        <LegalDocumentLink href="/terms/manager">利用規約</LegalDocumentLink>
      </Box>
      <Box>
        <Text mb={2} fontSize="xs" fontWeight="semibold" color="fg.muted">
          Inline consent text
        </Text>
        <Text fontSize="sm" lineHeight={1.7}>
          <LegalDocumentLink href="/terms/manager">利用規約</LegalDocumentLink>と
          <LegalDocumentLink href="/privacy/manager">プライバシーポリシー</LegalDocumentLink>に同意します
        </Text>
      </Box>
    </Stack>
  ),
};
