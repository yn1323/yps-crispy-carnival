import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AutoCreateDialog } from "./index";

const meta = {
  title: "Features/Shift/ShiftForm/AutoCreateDialog",
  component: AutoCreateDialog,
  parameters: { layout: "fullscreen" },
  args: {
    isOpen: true,
    onClose: fn(),
    onCreate: fn(),
  },
} satisfies Meta<typeof AutoCreateDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 開いた状態。AIの残りの回数が分からない間は、回数に制限があることだけを伝える。 */
export const Default: Story = {};

/** AIの残りの回数が分かる場合は、回数を出す。 */
export const WithAiRemaining: Story = {
  args: { aiRemainingCount: 3 },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("残り3回")).toBeInTheDocument();
    await expect(body.getByText("使用制限なし")).toBeInTheDocument();
  },
};

/** AIの回数を使い切った月は、AIを選べず、ルールだけで作れる。 */
export const AiExhausted: Story = {
  args: { aiRemainingCount: 0 },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("残り0回")).toBeInTheDocument();
    await expect(body.getByRole("radio", { name: /AIで作成する/ })).toBeDisabled();
    await expect(body.getByRole("radio", { name: /希望シフトから自動で作成する/ })).toBeChecked();
  },
};

/** 初めはルールが選ばれ、AIを選んで「作成する」を押すと、選んだ作り方を渡して閉じる。 */
export const ChooseAiInteractive: Story = {
  args: { aiRemainingCount: 3 },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("radio", { name: /希望シフトから自動で作成する/ })).toBeChecked();

    await userEvent.click(body.getByText("AIで作成する"));
    await expect(body.getByRole("radio", { name: /AIで作成する/ })).toBeChecked();
    await userEvent.click(body.getByRole("button", { name: "作成する" }));

    await expect(args.onCreate).toHaveBeenCalledTimes(1);
    await expect(args.onCreate).toHaveBeenCalledWith("ai");
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

/** キャンセルでは作らずに閉じる。 */
export const CancelInteractive: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole("button", { name: "キャンセル" }));
    await expect(args.onCreate).not.toHaveBeenCalled();
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};
