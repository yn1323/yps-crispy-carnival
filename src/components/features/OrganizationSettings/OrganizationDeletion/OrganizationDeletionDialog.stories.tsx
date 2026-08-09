import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
import { OrganizationDeletionDialog } from "./OrganizationDeletionDialog";

const onSubmit = fn();

const meta = {
  id: "features-organizationsettings-organizationdeletiondialog",
  title: "Features/OrganizationSettings/3. ダイアログ/組織削除",
  component: OrganizationDeletionDialog,
  parameters: { layout: "fullscreen" },
  args: {
    dialog: { intentKey: "ready", organizationName: "株式会社さくらダイニング" },
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
    dialog: {
      intentKey: "long-name",
      organizationName: "株式会社とても長い名前のさくらダイニング東日本店舗運営グループ",
    },
  },
};

export const Running: Story = { name: "削除中", args: { isRunning: true } };

export const ConfirmationBehavior: Story = {
  name: "確認名を入力して削除（操作確認）",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const dialog = await screen.findByRole("alertdialog", { name: "組織を削除" });
    const submit = within(dialog).getByRole("button", { name: "この組織を削除" });
    const textbox = within(dialog).getByRole("textbox");
    await expect(submit).toBeDisabled();
    await userEvent.type(textbox, "株式会社さくらダイニング", { delay: 1 });
    await expect(textbox).toHaveValue("株式会社さくらダイニング");
    await expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await expect(onSubmit).toHaveBeenCalledTimes(1);
  },
};

function ParentRerenderHarness(args: ComponentProps<typeof OrganizationDeletionDialog>) {
  const [, setRenderCount] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setRenderCount((count) => count + 1)}>
        親を再描画
      </button>
      <OrganizationDeletionDialog {...args} />
    </>
  );
}

export const ConfirmationSurvivesParentRerender: Story = {
  name: "再描画後も入力を維持（操作確認）",
  parameters: { screenshot: { skip: true } },
  render: (args) => <ParentRerenderHarness {...args} />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const dialog = await screen.findByRole("alertdialog", { name: "組織を削除" });
    const textbox = within(dialog).getByRole("textbox");
    const submit = within(dialog).getByRole("button", { name: "この組織を削除" });
    fireEvent.change(textbox, { target: { value: "株式会社さくら" } });
    fireEvent.click(screen.getByText("親を再描画", { exact: true }));
    await expect(textbox).toHaveValue("株式会社さくら");
    fireEvent.change(textbox, { target: { value: "株式会社さくらダイニング" } });
    await expect(submit).toBeEnabled();
  },
};

export const Mobile: Story = {
  name: "削除前・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
