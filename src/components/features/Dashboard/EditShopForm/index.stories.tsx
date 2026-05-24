import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  findByRole,
  findByText,
  fireEvent,
  getAllByRole,
  getByDisplayValue,
  getByRole,
  getByText,
  waitFor,
} from "@testing-library/dom";
import { expect } from "storybook/test";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { EditShopForm } from "./index.tsx";

const meta = {
  title: "Features/Dashboard/EditShopForm",
  component: EditShopForm,
  parameters: {
    layout: "padded",
  },
  args: {
    defaultValues: {
      shopName: "居酒屋たなか",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" },
    },
    onSubmit: () => {},
    onCancel: () => {},
    initialStep: "shopName",
  },
} satisfies Meta<typeof EditShopForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const renderInStepperDialog = (args: Story["args"]) => (
  <StepperDialog title="店舗設定" isOpen={true} onOpenChange={() => {}} onClose={() => {}}>
    <EditShopForm
      defaultValues={
        args?.defaultValues ?? {
          shopName: "居酒屋たなか",
          regularClosedDays: [],
          submissionPattern: { kind: "dateOnly" },
        }
      }
      onSubmit={args?.onSubmit ?? (() => {})}
      onCancel={args?.onCancel ?? (() => {})}
      initialStep={args?.initialStep}
    />
  </StepperDialog>
);

export const DateOnlyInStepperDialog: Story = {
  args: {
    initialStep: "submissionPattern",
  },
  render: renderInStepperDialog,
};

export const TimeInStepperDialog: Story = {
  args: {
    defaultValues: {
      shopName: "居酒屋たなか",
      regularClosedDays: [],
      submissionPattern: { kind: "time", startTime: "14:00", endTime: "25:00" },
    },
    initialStep: "patternSettings",
  },
  render: renderInStepperDialog,
};

export const ShiftTypeWithRegularClosedDays: Story = {
  args: {
    defaultValues: {
      shopName: "居酒屋たなか",
      regularClosedDays: ["mon", "tue"],
      submissionPattern: {
        kind: "shiftType",
        options: [
          { id: "morning", name: "早番", startTime: "14:00", endTime: "18:00", sortOrder: 0 },
          { id: "late", name: "遅番", startTime: "18:00", endTime: "25:00", sortOrder: 1 },
        ],
      },
    },
    initialStep: "regularClosedDays",
  },
  render: renderInStepperDialog,
};

export const RegularClosedDaysEmpty: Story = {
  args: {
    defaultValues: {
      shopName: "居酒屋たなか",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" },
    },
    initialStep: "regularClosedDays",
  },
  render: renderInStepperDialog,
};

export const InteractiveStepperFlow: Story = {
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  render: renderInStepperDialog,
  play: async ({ canvasElement }) => {
    const root = getTestRoot(canvasElement);

    expect(getByRole(root, "textbox", { name: "お店の名前" })).toBeTruthy();
    clickButton(root, "次へ");

    await findByText(root, "希望シフトの集め方");
    clickButton(root, "時間を自由に設定");
    clickButton(root, "次へ");

    await findByText(root, "シフト開始時間");
    expect(getByText(root, "シフト終了時間")).toBeTruthy();
    getByRole(root, "combobox", { name: "シフト開始時間" }).click();
    expect(await findByRole(root, "listbox", { name: "シフト開始時間" })).toBeTruthy();

    clickButton(root, "戻る");
    await findByText(root, "希望シフトの集め方");
    clickButton(root, "勤務区分から選ぶ");
    clickButton(root, "次へ");

    await findByText(root, "勤務区分を追加");
    expect(getByDisplayValue(root, "早番")).toBeTruthy();
    expect(getByDisplayValue(root, "遅番")).toBeTruthy();
    clickButton(root, "勤務区分を追加");
    await waitFor(() => expect(getAllByRole(root, "textbox", { name: "区分名" })).toHaveLength(3));
    clickButton(root, "勤務区分を追加");
    await waitFor(() => expect(getAllByRole(root, "textbox", { name: "区分名" })).toHaveLength(4));
    const shiftTypeNameInputs = getAllByRole(root, "textbox", { name: "区分名" });
    fireEvent.change(shiftTypeNameInputs[2], { target: { value: "中番" } });
    fireEvent.change(shiftTypeNameInputs[3], { target: { value: "深夜" } });
    expect(await findByText(root, "勤務区分は4件まで登録できます。")).toBeTruthy();
    expect(getByRole(root, "button", { name: /勤務区分を追加/ })).toBeDisabled();
    clickButton(root, "次へ");

    expect(await findByText(root, "現在の設定: 定休日なし")).toBeTruthy();
    expect(await findByRole(root, "button", { name: "変更を保存" })).toBeTruthy();
  },
};

function getTestRoot(canvasElement: HTMLElement): HTMLElement {
  return (document.querySelector('[role="dialog"]') as HTMLElement | null) ?? canvasElement;
}

function clickButton(root: HTMLElement, name: string) {
  getByRole(root, "button", { name: new RegExp(name) }).click();
}
