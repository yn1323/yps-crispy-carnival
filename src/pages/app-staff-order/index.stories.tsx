import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { StaffOrderEditorStateView } from "@/src/components/features/StaffOrderEditor";
import { StaffOrderPageStateView } from ".";

const meta = {
  title: "Pages/AppStaffOrder/States",
  component: StaffOrderPageStateView,
  args: { state: { kind: "loading" } },
  parameters: { layout: "padded" },
} satisfies Meta<typeof StaffOrderPageStateView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const LoadingMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const QueryError: Story = {
  args: { state: { kind: "error" } },
};

export const Empty: Story = {
  render: () => <StaffOrderEditorStateView state={{ kind: "empty" }} />,
};

export const TooManyPeople: Story = {
  render: () => <StaffOrderEditorStateView state={{ kind: "unavailable", availability: "tooManyPeople" }} />,
};

export const TooManyActiveShops: Story = {
  render: () => <StaffOrderEditorStateView state={{ kind: "unavailable", availability: "tooManyActiveShops" }} />,
};

export const LegacyDataIncomplete: Story = {
  render: () => <StaffOrderEditorStateView state={{ kind: "unavailable", availability: "legacyDataIncomplete" }} />,
};

function QueryErrorRetryPreview() {
  const [retried, setRetried] = useState(false);
  return retried ? (
    <output>スタッフの並び順を再読み込みしています</output>
  ) : (
    <StaffOrderPageStateView state={{ kind: "error" }} onRetry={() => setRetried(true)} />
  );
}

export const QueryErrorRetryBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <QueryErrorRetryPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "再試行する" }));
    await expect(await canvas.findByText("スタッフの並び順を再読み込みしています")).toBeInTheDocument();
  },
};
