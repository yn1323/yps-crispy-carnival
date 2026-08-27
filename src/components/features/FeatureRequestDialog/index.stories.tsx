import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { Toaster } from "@/src/components/ui/toaster";
import { AppFeatureRequestAction, AppFeatureRequestDialog, FeatureRequestDialog } from "./index";

const ORGANIZATION_ID = "organizations_story" as Id<"organizations">;
const SHOP_A_ID = "shops_story_a" as Id<"shops">;
const ORGANIZATION_SCOPE = { kind: "organization" as const };

const meta = {
  title: "features/FeatureRequestDialog",
  component: FeatureRequestDialog,
  args: {
    onSubmit: async () => {},
  },
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    ),
  ],
  parameters: { layout: "centered" },
} satisfies Meta<typeof FeatureRequestDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const Validation: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "要望を送る" }));
    const screen = within(document.body);
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "要望を送る" }));
    await expect(await dialog.findByText("要望を入力してください")).toBeVisible();
  },
};

export const SuccessfulSubmission: Story = {
  args: { onSubmit: fn() },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const screen = within(document.body);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "要望を送る" }));
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.type(dialog.getByRole("textbox"), "シフトを複製したい");
    await userEvent.click(dialog.getByRole("button", { name: "要望を送る" }));
    await expect(args.onSubmit).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  },
};

export const AppOrganizationScope: Story = {
  args: { onSubmit: fn() },
  render: (args) => <AppFeatureRequestDialog scope={ORGANIZATION_SCOPE} onSubmit={args.onSubmit} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "要望を送る" }));
    const dialog = within(await within(document.body).findByRole("dialog"));
    await expect(dialog.queryByRole("combobox")).toBeNull();
    await userEvent.type(dialog.getByRole("textbox"), "組織について改善してほしい");
    await userEvent.click(dialog.getByRole("button", { name: "要望を送る" }));

    await expect(args.onSubmit).toHaveBeenCalledWith({
      comment: "組織について改善してほしい",
      requestId: expect.any(String),
    });
  },
};

export const AppOrganizationScopeMobile: Story = {
  ...AppOrganizationScope,
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const AppFixedShopScope: Story = {
  args: { onSubmit: fn() },
  parameters: { screenshot: { skip: true } },
  render: (args) => (
    <AppFeatureRequestDialog
      scope={{ kind: "shop", shop: { id: SHOP_A_ID, name: "銀座店" } }}
      onSubmit={args.onSubmit}
    />
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "要望を送る" }));
    const dialog = within(await within(document.body).findByRole("dialog"));
    await expect(dialog.queryByRole("combobox", { name: "対象店舗" })).toBeNull();
    await userEvent.type(dialog.getByRole("textbox"), "この店舗について改善してほしい");
    await userEvent.click(dialog.getByRole("button", { name: "要望を送る" }));

    await expect(args.onSubmit).toHaveBeenCalledWith({
      shopId: SHOP_A_ID,
      comment: "この店舗について改善してほしい",
      requestId: expect.any(String),
    });
  },
};

export const AppWithoutActiveShops: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <AppFeatureRequestAction expectedOrganizationId={ORGANIZATION_ID} scope={{ kind: "organization" }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = canvas.getByRole("button", { name: "要望を送る" });
    await expect(action).toBeEnabled();
    await userEvent.click(action);

    const dialog = within(await within(document.body).findByRole("dialog"));
    await expect(dialog.queryByRole("combobox")).toBeNull();
    await expect(dialog.getByRole("textbox")).toBeEnabled();
  },
};
