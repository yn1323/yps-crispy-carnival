import { Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LineBulkInviteContent } from ".";

const meta = {
  title: "Features/Line/LineBulkInviteContent",
  component: LineBulkInviteContent,
  parameters: { layout: "padded" },
} satisfies Meta<typeof LineBulkInviteContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  args: { unlinkedCount: 3 },
  render: () => (
    <Stack gap={6} maxW="480px" mx="auto" w="full">
      <Section label="少人数（3名）">
        <LineBulkInviteContent unlinkedCount={3} />
      </Section>
      <Section label="多人数（25名）">
        <LineBulkInviteContent unlinkedCount={25} />
      </Section>
    </Stack>
  ),
};

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Stack gap={2}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">
      {label}
    </Text>
    {children}
  </Stack>
);
