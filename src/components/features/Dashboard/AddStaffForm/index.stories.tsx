import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { LuUserPlus } from "react-icons/lu";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { StaffRegistrationLinkPanel } from "../StaffRegistrationLinkPanel";
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

const sampleRegistrationUrl = "https://shiftori.example.com/staff/register/shop_123";

export const InDialog: Story = {
  render: () => (
    <Dialog
      title="スタッフを招待"
      isOpen={true}
      onOpenChange={() => {}}
      formId="add-staff-form"
      submitLabel="スタッフを登録する"
      onClose={() => {}}
      closeLabel="戻る"
    >
      <AddStaffForm onSubmit={() => {}} />
    </Dialog>
  ),
};

function StaffAdditionDialogFixture() {
  const [mode, setMode] = useState<"qr" | "manual">("qr");

  const handleBackOrClose = () => {
    if (mode === "manual") {
      setMode("qr");
    }
  };

  return (
    <Dialog
      title="スタッフを招待"
      isOpen={true}
      onOpenChange={() => {}}
      formId={mode === "manual" ? "add-staff-form" : undefined}
      submitLabel={mode === "manual" ? "スタッフを登録する" : undefined}
      onClose={handleBackOrClose}
      closeLabel={mode === "manual" ? "戻る" : "閉じる"}
      hideFooter={mode === "qr"}
    >
      {mode === "qr" ? (
        <StaffRegistrationLinkPanel
          registrationUrl={sampleRegistrationUrl}
          manualEntryAction={
            <Button onClick={() => setMode("manual")} size="sm" colorPalette="teal" gap={1.5}>
              <LuUserPlus />
              スタッフ情報を手入力する
            </Button>
          }
        />
      ) : (
        <AddStaffForm onSubmit={() => {}} />
      )}
    </Dialog>
  );
}

export const BackToQrFromManual: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: () => <StaffAdditionDialogFixture />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await expect(await page.findByText(/QRコードを対面で読み取ってもらうと/)).toBeInTheDocument();

    await userEvent.click(await page.findByRole("button", { name: "スタッフ情報を手入力する" }));
    await expect(await page.findByRole("button", { name: "戻る" })).toBeInTheDocument();
    await expect(await page.findByRole("button", { name: "スタッフを登録する" })).toBeInTheDocument();
    await expect(await page.findByText(/同意依頼とLINE連携の案内をメールで送信します/)).toBeInTheDocument();
    await expect(await page.findByText(/シフトリからメールが届く旨を事前にお伝えいただく/)).toBeInTheDocument();

    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    await expect(await page.findByRole("button", { name: "スタッフ情報を手入力する" })).toBeInTheDocument();
    expect(page.queryByRole("button", { name: "スタッフを登録する" })).not.toBeInTheDocument();
  },
};

export const EmptySubmitShowsError: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: () => (
    <Dialog
      title="スタッフを招待"
      isOpen={true}
      onOpenChange={() => {}}
      formId="add-staff-form"
      submitLabel="スタッフを登録する"
      onClose={() => {}}
      closeLabel="戻る"
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
      title="スタッフを招待"
      isOpen={true}
      onOpenChange={() => {}}
      formId="add-staff-form"
      submitLabel="スタッフを登録する"
      onClose={() => {}}
      closeLabel="戻る"
    >
      <AddStaffForm onSubmit={args.onSubmit} />
    </Dialog>
  ),
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const [nameInput] = await page.findAllByPlaceholderText("例：田中 花子");
    const [emailInput] = await page.findAllByPlaceholderText("例：hanako@example.com");

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
