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
    hasExistingWork: false,
  },
} satisfies Meta<typeof AutoCreateDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 勤務がまだない期間で開いた状態。AIの残りの回数が分からない間は、上限があることだけを伝える。 */
export const Default: Story = {};

/** 勤務が入っている期間では、作った勤務に置き換わることを伝える。 */
export const WithExistingWork: Story = {
  args: { hasExistingWork: true, aiRemainingCount: 3 },
};

/** AIの回数を使い切った月は、AIを選べず、ルールだけで作れる。 */
export const AiExhausted: Story = {
  args: { aiRemainingCount: 0 },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("今月の回数を使い切りました。", { exact: false })).toBeInTheDocument();
    await expect(body.getByRole("radio", { name: /AIで作る/ })).toBeDisabled();
    await expect(body.getByRole("radio", { name: /ルールで作る/ })).toBeChecked();
  },
};

/** 初めはルールが選ばれ、AIを選んで「作成する」を押すと、選んだ作り方を渡して閉じる。 */
export const ChooseAiInteractive: Story = {
  args: { aiRemainingCount: 3 },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("radio", { name: /ルールで作る/ })).toBeChecked();
    await expect(body.queryByRole("note")).not.toBeInTheDocument();

    await userEvent.click(body.getByText("AIで作る"));
    await expect(body.getByRole("radio", { name: /AIで作る/ })).toBeChecked();
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
