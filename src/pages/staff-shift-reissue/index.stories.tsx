import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { StaffShiftReissueStateView } from ".";

const meta = {
  title: "Pages/StaffShiftReissue",
  component: StaffShiftReissueStateView,
  parameters: { layout: "fullscreen" },
  args: { state: { status: "unavailable" } },
} satisfies Meta<typeof StaffShiftReissueStateView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unavailable: Story = {};

export const UnavailableMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
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
    <StaffShiftReissueStateView
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
