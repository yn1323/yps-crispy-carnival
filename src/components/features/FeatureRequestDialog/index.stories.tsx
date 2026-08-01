import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Toaster } from "@/src/components/ui/toaster";
import { FeatureRequestDialog } from "./index";

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
    await expect(screen.findByText("要望を入力してください")).resolves.toBeVisible();
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
