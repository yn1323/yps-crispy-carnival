import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "..";
import { allPatternsArgs, desktopGlobals, fullscreenParameters, mobileGlobals, shiftFormDecorators } from "./shared";

const emptyShifts = allPatternsArgs.initialShifts.map((shift) => ({ ...shift, positions: [], breaks: undefined }));

const meta = {
  title: "Features/Shift/ShiftForm/Auto Create",
  component: ShiftForm,
  decorators: shiftFormDecorators,
  parameters: { ...fullscreenParameters, screenshot: { skip: true } },
  args: {
    ...allPatternsArgs,
    initialDetailMode: true,
    onSaveDraft: () => {},
    onConfirm: () => {},
    header: { desktopTitle: "店舗：1/23", mobileTitle: "1/23" },
  },
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** くわしく表示では、PCの上の行のボタンから開ける。 */
export const Desktop: Story = {
  args: { initialShifts: emptyShifts },
  globals: desktopGlobals,
  parameters: { screenshot: { skip: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "自動作成" }));
    const dialog = within(await body.findByRole("dialog", { name: "シフトを自動作成" }));
    await userEvent.click(dialog.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
  },
};

/** スマートフォンでは、上の行の保存と確定のメニューの先頭から開ける。 */
export const MenuOnMobile: Story = {
  args: { initialShifts: emptyShifts },
  globals: mobileGlobals,
  parameters: { screenshot: { skip: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: /^保存・確定/ }));
    const items = await body.findAllByRole("menuitem");
    await expect(items[0]).toHaveAccessibleName("シフトを自動作成");
    await userEvent.click(items[0]);
    await expect(await body.findByRole("dialog", { name: "シフトを自動作成" })).toBeInTheDocument();
  },
};

/** シンプル表示、確定済みの募集、閲覧専用では、どこにも出さない。 */
export const HiddenOutsideEditableDetail: Story = {
  args: { initialShifts: emptyShifts, initialDetailMode: false },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "下書き保存" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "自動作成" })).not.toBeInTheDocument();
  },
};

export const HiddenWhenConfirmed: Story = {
  args: { initialShifts: emptyShifts, isConfirmed: true },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "下書き保存" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "自動作成" })).not.toBeInTheDocument();
  },
};
