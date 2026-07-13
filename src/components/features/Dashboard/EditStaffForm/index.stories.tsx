import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Dialog } from "@/src/components/ui/Dialog";
import { mockStaffs } from "../storyMocks";
import { EditStaffForm } from "./index.tsx";

const meta = {
  title: "Features/Dashboard/EditStaffForm",
  component: EditStaffForm,
  parameters: {
    layout: "padded",
  },
  args: {
    staff: mockStaffs[0],
    onSubmit: () => {},
  },
} satisfies Meta<typeof EditStaffForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Dialog内にレンダリング */
export const InDialog: Story = {
  render: () => (
    <Dialog
      title="スタッフを編集"
      isOpen={true}
      onOpenChange={() => {}}
      formId="edit-staff-form"
      submitLabel="保存する"
      onClose={() => {}}
    >
      <EditStaffForm staff={mockStaffs[0]} onSubmit={() => {}} />
    </Dialog>
  ),
};

export const ValidationAndSubmit: Story = {
  args: {
    onSubmit: fn(),
  },
  parameters: {
    screenshot: { skip: true },
  },
  render: (args) => (
    <Dialog
      title="スタッフを編集"
      isOpen={true}
      onOpenChange={() => {}}
      formId="edit-staff-form"
      submitLabel="保存する"
      onClose={() => {}}
    >
      <EditStaffForm staff={args.staff} onSubmit={args.onSubmit} />
    </Dialog>
  ),
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nameInput = await page.findByRole("textbox", { name: "名前" });
    const emailInput = await page.findByRole("textbox", { name: "メールアドレス" });

    await userEvent.clear(nameInput);
    await userEvent.click(await page.findByRole("button", { name: "保存する" }));
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await expect(nameInput).toBeInvalid();

    await userEvent.type(nameInput, "更新スタッフ");
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, "updated@example.com");
    await userEvent.click(await page.findByRole("button", { name: "保存する" }));

    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith(
      {
        name: "更新スタッフ",
        email: "updated@example.com",
      },
      expect.anything(),
    );
  },
};
