import { Box, Field, Input, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { LuCalendarDays, LuChevronLeft, LuStore, LuTimer } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
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

const StepperDialogDemo = ({ initialStep = "shop" }: { initialStep?: DemoStep }) => {
  const [currentStep, setCurrentStep] = useState<DemoStep>(initialStep);

  const actions =
    currentStep === "shop" ? (
      <>
        <Button type="button" variant="outline" flex={{ base: 1, md: "unset" }}>
          キャンセル
        </Button>
        <Button
          type="button"
          colorPalette="teal"
          flex={{ base: 1, md: "unset" }}
          onClick={() => setCurrentStep("rule")}
        >
          次へ
        </Button>
      </>
    ) : currentStep === "rule" ? (
      <>
        <Button type="button" variant="outline" flex={{ base: 1, md: "unset" }} onClick={() => setCurrentStep("shop")}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button
          type="button"
          colorPalette="teal"
          flex={{ base: 1, md: "unset" }}
          onClick={() => setCurrentStep("confirm")}
        >
          確認へ
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="outline" flex={{ base: 1, md: "unset" }} onClick={() => setCurrentStep("rule")}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="button" colorPalette="teal" flex={{ base: 1, md: "unset" }}>
          変更を保存
        </Button>
      </>
    );

  return (
    <StepperDialog title="店舗設定" isOpen={true} onOpenChange={() => {}} onClose={() => {}}>
      <StepperDialogContent steps={steps} currentStep={currentStep} actions={actions}>
        {currentStep === "shop" && (
          <Stack gap={5}>
            <Field.Root>
              <Field.Label>お店の名前</Field.Label>
              <Input defaultValue="居酒屋たなか" />
            </Field.Root>
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

export const Default: Story = {
  render: () => <StepperDialogDemo />,
};

export const ConfirmStep: Story = {
  render: () => <StepperDialogDemo initialStep="confirm" />,
};

export const MobileFullScreen: Story = {
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => <StepperDialogDemo />,
};
