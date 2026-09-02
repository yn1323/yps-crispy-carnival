import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { DashboardPageStateView, DashboardReadOnlyNotice } from ".";

const meta = {
  title: "Pages/Dashboard/States",
  component: DashboardPageStateView,
  args: { state: { kind: "loading" } },
  parameters: { layout: "padded" },
} satisfies Meta<typeof DashboardPageStateView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const Empty: Story = {
  args: { state: { kind: "empty" } },
};

export const Inaccessible: Story = {
  args: { state: { kind: "inaccessible" } },
};

export const QueryError: Story = {
  args: { state: { kind: "error" } },
};

export const MobileEmpty: Story = {
  tags: ["vrt-mobile2"],
  args: { state: { kind: "empty" } },
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const MobileUsageEvaluationUnavailable: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => (
    <DashboardReadOnlyNotice
      organizationId={"organization-preview" as never}
      businessWriteBlockReason="usageLimitEvaluationUnavailable"
    />
  ),
};

function EmptyManagementBehaviorPreview() {
  const [opened, setOpened] = useState(false);

  return opened ? (
    <output>管理画面を開きました</output>
  ) : (
    <DashboardPageStateView state={{ kind: "empty" }} onOpenManagement={() => setOpened(true)} />
  );
}

export const EmptyManagementAction: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <EmptyManagementBehaviorPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "管理を開く" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent("管理画面を開きました");
  },
};
