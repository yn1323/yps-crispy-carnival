import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { OrganizationDeletionDialog } from "./OrganizationDeletionDialog";

const onSubmit = fn();

const meta = {
  id: "features-organizationsettings-organizationdeletiondialog",
  title: "Features/OrganizationSettings/3. ダイアログ/組織削除",
  component: OrganizationDeletionDialog,
  parameters: { layout: "fullscreen" },
  args: {
    dialog: { organizationName: "株式会社さくらダイニング" },
    isRunning: false,
    onClose: fn(),
    onSubmit,
  },
} satisfies Meta<typeof OrganizationDeletionDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = { name: "削除前" };

export const LongOrganizationName: Story = {
  name: "長い組織名",
  args: {
    dialog: { organizationName: "株式会社とても長い名前のさくらダイニング東日本店舗運営グループ" },
  },
};

export const Running: Story = { name: "削除中", args: { isRunning: true } };

export const SubmitBehavior: Story = {
  name: "削除を実行（操作確認）",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const dialog = await screen.findByRole("alertdialog", { name: "組織を削除" });
    const submit = within(dialog).getByRole("button", { name: "この組織を削除" });
    await expect(submit).toBeEnabled();
    await expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(submit);
    await expect(onSubmit).toHaveBeenCalledTimes(1);
  },
};

export const Mobile: Story = {
  name: "削除前・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
