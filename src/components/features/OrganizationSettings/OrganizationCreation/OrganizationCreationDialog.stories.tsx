import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { ShopFormData } from "@/src/components/features/ShopForm";
import { OrganizationCreationDialog } from "./OrganizationCreationDialog";

const meta = {
  id: "features-organizationsettings-organizationcreationdialog",
  title: "Features/OrganizationSettings/3. ダイアログ/組織作成",
  component: OrganizationCreationDialog,
  parameters: { layout: "fullscreen" },
  args: {
    dialog: { kind: "createOrganization", requestId: "story-request" },
    isRunning: false,
    onClose: () => {},
    onSubmit: () => {},
  },
} satisfies Meta<typeof OrganizationCreationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = { name: "作成前" };

export const Mobile: Story = {
  name: "作成前・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

function SubmissionHarness() {
  const [result, setResult] = useState<{ count: number; data: ShopFormData | null }>({ count: 0, data: null });
  return (
    <>
      <OrganizationCreationDialog
        dialog={{ kind: "createOrganization", requestId: "behavior-request" }}
        isRunning={false}
        onClose={() => {}}
        onSubmit={(data) => setResult((current) => ({ count: current.count + 1, data }))}
      />
      {result.data && (
        <output aria-label="組織作成の送信結果">{JSON.stringify({ count: result.count, data: result.data })}</output>
      )}
    </>
  );
}

export const SubmissionBehavior: Story = {
  name: "入力して作成（操作確認）",
  parameters: { screenshot: { skip: true } },
  render: () => <SubmissionHarness />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const dialog = await screen.findByRole("dialog", { name: "新しい組織を作る" });
    const form = within(dialog);

    await userEvent.type(form.getByRole("textbox", { name: "お店の名前" }), "新宿店");
    await userEvent.click(form.getByRole("button", { name: "次へ" }));
    await userEvent.click(await form.findByRole("button", { name: /^日ごと 日ごと/ }));
    await userEvent.click(form.getByRole("button", { name: "次へ" }));
    await userEvent.click(await form.findByRole("button", { name: "作成する" }));

    const result = await screen.findByLabelText("組織作成の送信結果");
    await expect(result).toHaveTextContent(
      JSON.stringify({
        count: 1,
        data: {
          shopName: "新宿店",
          regularClosedDays: [],
          submissionPattern: { kind: "dateOnly" },
        },
      }),
    );
  },
};
