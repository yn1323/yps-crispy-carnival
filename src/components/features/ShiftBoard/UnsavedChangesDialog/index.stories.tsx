import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { UnsavedChangesDialog } from "./index";

const meta = {
  title: "Features/ShiftBoard/UnsavedChangesDialog",
  component: UnsavedChangesDialog,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    isOpen: true,
    onStay: fn(),
    onLeaveWithoutSaving: fn(),
    onSaveAndLeave: fn(),
  },
} satisfies Meta<typeof UnsavedChangesDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const ActionBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("alertdialog", { name: "保存していない変更があります" });
    const actionArea = dialog.querySelector("[data-dialog-action-area]");
    if (!(actionArea instanceof HTMLElement)) throw new Error("Dialog action area was not found");

    const actions = within(actionArea).getAllByRole("button");
    await expect(actions).toHaveLength(2);
    await expect(actions[0]).toHaveTextContent("保存せず戻る");
    await expect(actions[1]).toHaveTextContent("保存して戻る");

    await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    await expect(args.onStay).toHaveBeenCalledOnce();
    await userEvent.click(actions[0]);
    await expect(args.onLeaveWithoutSaving).toHaveBeenCalledOnce();
    await userEvent.click(actions[1]);
    await expect(args.onSaveAndLeave).toHaveBeenCalledOnce();
  },
};

export const Saving: Story = {
  args: {
    isSaving: true,
  },
};

export const SavingCloseLockBehavior: Story = {
  args: {
    isSaving: true,
    onStay: fn(),
    onLeaveWithoutSaving: fn(),
    onSaveAndLeave: fn(),
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("alertdialog", { name: "保存していない変更があります" });

    await expect(within(dialog).queryByRole("button", { name: "閉じる" })).not.toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "保存せず戻る" })).toBeDisabled();
    await expect(within(dialog).getByRole("button", { name: "保存して戻る" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await expect(args.onStay).not.toHaveBeenCalled();
    await expect(args.onLeaveWithoutSaving).not.toHaveBeenCalled();
    await expect(args.onSaveAndLeave).not.toHaveBeenCalled();
  },
};
