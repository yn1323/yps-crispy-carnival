import { Box, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftoriLoading } from ".";

const meta = {
  title: "UI/ShiftoriLoading",
  component: ShiftoriLoading,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof ShiftoriLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <Stack gap={6}>
      <Text fontSize="sm" fontWeight="bold">
        Variants
      </Text>
      <SimpleGrid columns={{ base: 1, lg: 3 }} gap={4}>
        <Surface label="page">
          <ShiftoriLoading variant="page" minH="280px" animated={false} />
        </Surface>
        <Surface label="section">
          <ShiftoriLoading variant="section" minH="220px" animated={false} />
        </Surface>
        <Surface label="compact">
          <ShiftoriLoading variant="compact" animated={false} />
        </Surface>
      </SimpleGrid>
    </Stack>
  ),
};

export const Animated: Story = {
  args: {
    variant: "page",
    minH: "360px",
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
};

const Surface = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Box bg="white" borderWidth="1px" borderColor="border.muted" borderRadius="lg" p={4}>
    <Stack gap={3}>
      <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
        {label}
      </Text>
      {children}
    </Stack>
  </Box>
);
