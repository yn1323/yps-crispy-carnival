import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Dialog } from "@/src/components/ui/Dialog";
import { AddStaffForm } from "./index.tsx";

const meta = {
  title: "Features/Dashboard/AddStaffForm",
  component: AddStaffForm,
  parameters: {
    layout: "padded",
  },
  args: {
    onSubmit: () => {},
  },
} satisfies Meta<typeof AddStaffForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InDialog: Story = {
  render: () => (
    <Dialog
      title="スタッフを追加"
      isOpen={true}
      onOpenChange={() => {}}
      formId="add-staff-form"
      submitLabel="スタッフを登録する"
      onClose={() => {}}
      closeLabel="閉じる"
    >
      <AddStaffForm onSubmit={() => {}} />
    </Dialog>
  ),
};

export const EmptySubmitShowsError: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: () => (
    <Dialog
      title="スタッフを追加"
      isOpen={true}
      onOpenChange={() => {}}
      formId="add-staff-form"
      submitLabel="スタッフを登録する"
      onClose={() => {}}
      closeLabel="閉じる"
    >
      <AddStaffForm onSubmit={() => {}} />
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(await page.findByRole("button", { name: "スタッフを登録する" }));

    await expect(await page.findByText("スタッフ名を1人以上入力してください。")).toBeInTheDocument();
  },
};

export const ValidSubmitPassesNormalizedPayload: Story = {
  args: {
    onSubmit: fn(),
  },
  parameters: {
    screenshot: { skip: true },
  },
  render: (args) => (
    <Dialog
      title="スタッフを追加"
      isOpen={true}
      onOpenChange={() => {}}
      formId="add-staff-form"
      submitLabel="スタッフを登録する"
      onClose={() => {}}
      closeLabel="閉じる"
    >
      <AddStaffForm onSubmit={args.onSubmit} />
    </Dialog>
  ),
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const [nameInput] = await page.findAllByPlaceholderText("サンプル スタッフ");
    const [emailInput] = await page.findAllByPlaceholderText("staff@example.com");

    await userEvent.type(nameInput, " 田中 花子 ");
    await userEvent.type(emailInput, " hanako@example.com ");
    await userEvent.click(await page.findByRole("button", { name: "スタッフを登録する" }));

    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith(
      {
        entries: [
          { name: "田中 花子", email: "hanako@example.com" },
          { name: "", email: "" },
          { name: "", email: "" },
        ],
      },
      expect.anything(),
    );
  },
};
