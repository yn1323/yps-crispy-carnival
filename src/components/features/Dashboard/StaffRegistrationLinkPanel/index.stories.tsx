import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { StaffRegistrationLinkPanel } from "./index";

const registrationUrl = "https://shiftori.app/staff/register?token=preview-token";

const meta = {
  title: "Features/Dashboard/StaffRegistrationLinkPanel",
  component: StaffRegistrationLinkPanel,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <Box w="520px" maxW="calc(100vw - 32px)">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof StaffRegistrationLinkPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    registrationUrl,
  },
};

export const Loading: Story = {
  args: {
    registrationUrl: null,
    isLoading: true,
  },
};

export const ErrorState: Story = {
  args: {
    registrationUrl: null,
    hasError: true,
    onRetry: () => {},
  },
};

export const RetryBehavior: Story = {
  args: {
    registrationUrl: null,
  },
  parameters: { screenshot: { skip: true } },
  render: () => <RetryFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("alert")).toHaveTextContent("招待リンクを読み込めませんでした");
    await userEvent.click(await canvas.findByRole("button", { name: "もう一度読み込む" }));
    await expect(await canvas.findByRole("button", { name: "リンクをコピー" })).toBeInTheDocument();
  },
};

function RetryFixture() {
  const [hasError, setHasError] = useState(true);

  return (
    <StaffRegistrationLinkPanel
      registrationUrl={hasError ? null : registrationUrl}
      hasError={hasError}
      onRetry={() => setHasError(false)}
    />
  );
}
