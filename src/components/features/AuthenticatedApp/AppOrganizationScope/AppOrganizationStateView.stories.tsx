import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppOrganizationStateView } from "./AppOrganizationStateView";

const meta = {
  title: "Features/AuthenticatedApp/AppOrganizationStateView",
  component: AppOrganizationStateView,
  args: { state: { kind: "loading" }, onReload: fn(), onChooseAvailableOrganization: fn() },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppOrganizationStateView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText("組織情報を読み込み中")).toHaveAttribute("aria-busy", "true");
  },
};

export const Empty: Story = {
  args: { state: { kind: "empty" } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("heading", { name: "利用できる組織がありません" })).toBeVisible();
  },
};

export const Inaccessible: Story = {
  args: { state: { kind: "error", reason: "inaccessible" } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "この組織を開けません" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "組織を切り替える" }));
    await expect(args.onChooseAvailableOrganization).toHaveBeenCalledTimes(1);
  },
};

export const QueryError: Story = {
  args: { state: { kind: "error", reason: "query" } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "再読み込みする" })).toBeVisible();
  },
};

export const MobileInaccessible: Story = {
  tags: ["vrt-mobile2"],
  args: { state: { kind: "error", reason: "inaccessible" } },
  globals: { viewport: { value: "mobile2", isRotated: false } },
};
