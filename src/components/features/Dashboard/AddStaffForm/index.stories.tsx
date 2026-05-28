import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { LuKeyboard } from "react-icons/lu";
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
      title="スタッフを追加"
      isOpen={true}
      onOpenChange={() => {}}
      formId="add-staff-form"
      submitLabel="スタッフを追加する"
      onClose={() => {}}
      closeLabel="戻る"
      maxW={{ base: "640px", lg: "calc(100vw - 64px)" }}
      maxH={{ base: "85dvh", lg: "calc(100dvh - 64px)" }}
      contentProps={{
        w: { lg: "calc(100vw - 64px)" },
        h: { lg: "calc(100dvh - 64px)" },
      }}
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
      title="スタッフを追加"
      isOpen={true}
      onOpenChange={() => {}}
      formId={mode === "manual" ? "add-staff-form" : undefined}
      submitLabel={mode === "manual" ? "スタッフを追加する" : undefined}
      onClose={handleBackOrClose}
      closeLabel={mode === "manual" ? "戻る" : "閉じる"}
      footer={
        mode === "qr" ? (
          <Button onClick={() => setMode("manual")} size="sm" colorPalette="teal" gap={1.5}>
            <LuKeyboard />
            自分で登録する
          </Button>
        ) : undefined
      }
      maxW={{ base: "640px", lg: "calc(100vw - 64px)" }}
      maxH={{ base: "85dvh", lg: "calc(100dvh - 64px)" }}
      contentProps={{
        w: { lg: "calc(100vw - 64px)" },
        h: { lg: "calc(100dvh - 64px)" },
      }}
    >
      {mode === "qr" ? (
        <StaffRegistrationLinkPanel registrationUrl={sampleRegistrationUrl} />
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

    await expect(await page.findByText(/QRコードまたは、URLからスタッフ追加が可能です/)).toBeInTheDocument();

    await userEvent.click(await page.findByRole("button", { name: "自分で登録する" }));
    await expect(await page.findByRole("button", { name: "戻る" })).toBeInTheDocument();
    await expect(await page.findByRole("button", { name: "スタッフを追加する" })).toBeInTheDocument();

    await userEvent.click(await page.findByRole("button", { name: "戻る" }));
    await expect(await page.findByRole("button", { name: "自分で登録する" })).toBeInTheDocument();
    expect(page.queryByRole("button", { name: "スタッフを追加する" })).not.toBeInTheDocument();
  },
};
