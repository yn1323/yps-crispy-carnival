import { Box, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { type DemoStep, ShiftoriDemoFlow } from "./index";

const meta = {
  title: "Mock/ShiftoriDemoFlow",
  component: ShiftoriDemoFlow,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftoriDemoFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flow: Story = {
  args: {
    initialStep: "recruit",
  },
};

const variantSteps: Array<{ step: DemoStep; label: string }> = [
  { step: "recruit", label: "募集" },
  { step: "submit", label: "提出" },
  { step: "adjust", label: "調整" },
  { step: "share", label: "共有" },
];

export const Variants: Story = {
  render: () => (
    <Stack gap={8} bg="gray.100" p={6}>
      {variantSteps.map(({ step, label }) => (
        <Box key={step} borderWidth="1px" borderColor="border.muted" borderRadius="lg" overflow="hidden" bg="white">
          <Box px={4} py={3} borderBottomWidth="1px" borderColor="border.muted">
            <Text fontSize="sm" fontWeight="bold">
              {label}
            </Text>
          </Box>
          <ShiftoriDemoFlow initialStep={step} />
        </Box>
      ))}
    </Stack>
  ),
};
