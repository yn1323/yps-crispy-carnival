import { Box, Field, Input, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { LuCalendarDays, LuChevronLeft, LuStore, LuTimer } from "react-icons/lu";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "@/src/components/ui/Button";
import type { DialogMobileActionLayout } from "@/src/components/ui/Dialog";
import { StepperDialog, StepperDialogContent, type StepperDialogStep } from "./index";

type DemoStep = "shop" | "rule" | "confirm";

const steps: StepperDialogStep<DemoStep>[] = [
  {
    value: "shop",
    label: "店舗",
    icon: LuStore,
    title: "お店の基本情報",
    description: "店舗名など、管理画面で使う基本情報を確認します。",
  },
  {
    value: "rule",
    label: "ルール",
    icon: LuCalendarDays,
    title: "募集時のルール",
    description: (
      <>
        次に作成する募集から使う提出方法や定休日を設定します。
        <br />
        既存の募集には反映されません。
      </>
    ),
  },
  {
    value: "confirm",
    label: "確認",
    icon: LuTimer,
    title: "内容を確認",
    description: "保存すると、次に作成する募集からこの設定が使われます。",
  },
];

const meta = {
  title: "UI/StepperDialog",
  component: StepperDialog,
  parameters: {
    layout: "padded",
  },
  args: {
    title: "店舗設定",
    isOpen: true,
    onOpenChange: () => {},
    onClose: () => {},
    children: null,
  },
} satisfies Meta<typeof StepperDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const StepperDialogDemo = ({
  initialStep = "shop",
  longContent = false,
  longActions = false,
  mobileActionLayout = "inline",
}: {
  initialStep?: DemoStep;
  longContent?: boolean;
  longActions?: boolean;
  mobileActionLayout?: DialogMobileActionLayout;
}) => {
  const [currentStep, setCurrentStep] = useState<DemoStep>(initialStep);

  const actions =
    currentStep === "shop" ? (
      <>
        <Button type="button" variant="outline">
          {longActions ? "設定をやめてキャンセルする" : "キャンセル"}
        </Button>
        <Button type="button" colorPalette="teal" onClick={() => setCurrentStep("rule")}>
          {longActions ? "店舗情報を確認して次へ進む" : "次へ"}
        </Button>
      </>
    ) : currentStep === "rule" ? (
      <>
        <Button type="button" variant="outline" onClick={() => setCurrentStep("shop")}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="button" colorPalette="teal" onClick={() => setCurrentStep("confirm")}>
          確認へ
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="outline" onClick={() => setCurrentStep("rule")}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="button" colorPalette="teal">
          変更を保存
        </Button>
      </>
    );

  return (
    <StepperDialog title="店舗設定" isOpen={true} onOpenChange={() => {}} onClose={() => {}}>
      <StepperDialogContent
        steps={steps}
        currentStep={currentStep}
        actions={actions}
        mobileActionLayout={mobileActionLayout}
      >
        {currentStep === "shop" && (
          <Stack gap={5}>
            <Field.Root>
              <Field.Label>お店の名前</Field.Label>
              <Input defaultValue="居酒屋たなか" />
            </Field.Root>
            {longContent &&
              Array.from({ length: 8 }, (_, index) => (
                <Box key={index} borderWidth={1} borderColor="border.default" borderRadius="md" p={4}>
                  <Text fontSize="sm" fontWeight="semibold">
                    確認項目 {index + 1}
                  </Text>
                  <Text mt={1} fontSize="xs" color="fg.muted">
                    本文領域だけがスクロールし、手順とaction barは表示領域内に残ります。
                  </Text>
                </Box>
              ))}
          </Stack>
        )}
        {currentStep === "rule" && (
          <Stack gap={5}>
            <Box borderWidth={1} borderColor="border.default" borderRadius="md" p={4}>
              <Text fontSize="sm" fontWeight="semibold">
                希望シフトの提出方法
              </Text>
              <Text mt={1} fontSize="xs" color="fg.muted">
                時間指定・日ごと・勤務区分から選べます。
              </Text>
            </Box>
          </Stack>
        )}
        {currentStep === "confirm" && (
          <Stack gap={5}>
            <Box borderWidth={1} borderColor="border.default" borderRadius="md" p={4}>
              <Text fontSize="sm">店舗名: 居酒屋たなか</Text>
              <Text mt={2} fontSize="sm">
                提出方法: 時間指定
              </Text>
            </Box>
          </Stack>
        )}
      </StepperDialogContent>
    </StepperDialog>
  );
};

export const Desktop: Story = {
  render: () => <StepperDialogDemo />,
};

export const ConfirmStep: Story = {
  render: () => <StepperDialogDemo initialStep="confirm" />,
};

export const MobileFullScreen: Story = {
  tags: ["vrt-mobile1"],
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => <StepperDialogDemo longContent />,
};

export const MobileStackedLong: Story = {
  tags: ["vrt-mobile1"],
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => <StepperDialogDemo longContent longActions mobileActionLayout="stacked" />,
};

export const StepTransitionsAndActionOrderBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <StepperDialogDemo />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "店舗設定" });

    const cancel = within(dialog).getByRole("button", { name: "キャンセル" });
    const next = within(dialog).getByRole("button", { name: "次へ" });
    await expect(cancel.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cancel.focus();
    await expect(cancel).toHaveFocus();
    await userEvent.tab();
    await expect(next).toHaveFocus();

    await userEvent.click(next);
    const middleBack = await within(dialog).findByRole("button", { name: "戻る" });
    const confirm = within(dialog).getByRole("button", { name: "確認へ" });
    await expect(middleBack.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    middleBack.focus();
    await userEvent.tab();
    await expect(confirm).toHaveFocus();

    await userEvent.click(confirm);
    const finalBack = await within(dialog).findByRole("button", { name: "戻る" });
    const save = within(dialog).getByRole("button", { name: "変更を保存" });
    await expect(within(dialog).queryByRole("button", { name: "確認へ" })).not.toBeInTheDocument();
    await expect(finalBack.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    finalBack.focus();
    await userEvent.tab();
    await expect(save).toHaveFocus();
  },
};
