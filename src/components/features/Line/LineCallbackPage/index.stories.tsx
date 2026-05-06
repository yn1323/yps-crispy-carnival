import { Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LineCallbackPage } from ".";

const meta = {
  title: "Features/Line/LineCallbackPage",
  component: LineCallbackPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LineCallbackPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  args: { status: "ok" },
  render: () => (
    <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
      {(["loading", "ok", "expired", "rate_limited", "error"] as const).map((s) => (
        <Stack key={s} gap={1}>
          <Text px={4} pt={3} fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">
            status: {s}
          </Text>
          <LineCallbackPage status={s} />
        </Stack>
      ))}
    </Stack>
  ),
};
