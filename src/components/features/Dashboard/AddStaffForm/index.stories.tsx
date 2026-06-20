import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { LuUserPlus } from "react-icons/lu";
import { expect, userEvent, within } from "storybook/test";
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
      submitLabel="スタッフを追加する"
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
      submitLabel={mode === "manual" ? "スタッフを追加する" : undefined}
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
    chromatic: { disableSnapshot: true },
  },
  render: () => <StaffAdditionDialogFixture />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await expect(await page.findByText(/スタッフにQRコードを読み取ってもらうと/)).toBeInTheDocument();

    await userEvent.click(await page.findByRole("button", { name: "スタッフ情報を手入力する" }));
    await expect(await page.findByRole("button", { name: "戻る" })).toBeInTheDocument();
    await expect(await page.findByRole("button", { name: "スタッフを追加する" })).toBeInTheDocument();
    await expect(await page.findByText(/同意依頼とLINE連携案内をメールで送ります/)).toBeInTheDocument();

    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    await expect(await page.findByRole("button", { name: "スタッフ情報を手入力する" })).toBeInTheDocument();
    expect(page.queryByRole("button", { name: "スタッフを追加する" })).not.toBeInTheDocument();
  },
};
