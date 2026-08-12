import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { StaffShiftSubmitCompletedView } from ".";

const meta = {
  title: "Pages/StaffShiftSubmitCompleted",
  component: StaffShiftSubmitCompletedView,
  parameters: { layout: "fullscreen" },
  args: {
    state: { status: "submitted", shopName: "テスト店舗" },
    onBack: () => {},
  },
} satisfies Meta<typeof StaffShiftSubmitCompletedView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Submitted: Story = {
  args: { canGoBack: true },
};

export const SubmittedMobile: Story = {
  args: { canGoBack: true },
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const Unavailable: Story = {
  args: { state: { status: "unavailable" } },
};

export const Loading: Story = {
  args: { state: { status: "loading" } },
};

export const QueryError: Story = {
  args: { state: { status: "error", retry: () => {} } },
};

let retryCount = 0;

export const Retry: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => (
    <StaffShiftSubmitCompletedView
      state={{
        status: "error",
        retry: () => {
          retryCount += 1;
        },
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    retryCount = 0;
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "再試行する" }));
    expect(retryCount).toBe(1);
  },
};
