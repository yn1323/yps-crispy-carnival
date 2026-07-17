import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { ShopForm } from "./index.tsx";

const meta = {
  title: "Features/ShopForm",
  component: ShopForm,
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
    submitLabel: "変更を保存",
  },
} satisfies Meta<typeof ShopForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const renderShopFormInStepperDialog = (args: Story["args"], title: string) => (
  <StepperDialog title={title} isOpen={true} onOpenChange={() => {}} onClose={() => {}}>
    <ShopForm
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
      submitLabel={args?.submitLabel}
    />
  </StepperDialog>
);

const renderInStepperDialog = (args: Story["args"]) => renderShopFormInStepperDialog(args, "店舗設定");
const renderAddShopInStepperDialog = (args: Story["args"]) => renderShopFormInStepperDialog(args, "店舗を追加");

export const AddShopInStepperDialog: Story = {
  args: {
    defaultValues: {
      shopName: "",
      regularClosedDays: [],
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    },
    submitLabel: "店舗を追加",
  },
  render: renderAddShopInStepperDialog,
};

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
    screenshot: { skip: true },
  },
  render: renderInStepperDialog,
  play: async ({ canvasElement }) => {
    const root = within(getTestRoot(canvasElement));

    expect(root.getByRole("textbox", { name: "お店の名前" })).toBeTruthy();
    await clickButton(root, "次へ");

    await root.findByText("希望シフトの集め方");
    await clickButton(root, "次へ");

    expect(await root.findByText("現在の設定: 定休日なし")).toBeTruthy();
    expect(root.queryByText("追加設定なし")).toBeNull();
    expect(root.queryByText("勤務時間")).toBeNull();

    await clickButton(root, "戻る");
    await root.findByText("希望シフトの集め方");
    await clickButton(root, "時間指定");
    await clickButton(root, "次へ");

    await root.findByText("シフト開始時間");
    expect(root.getByText("シフト終了時間")).toBeTruthy();
    const startTimeSelect = root.getByRole("combobox", { name: "シフト開始時間" });
    await userEvent.click(startTimeSelect);
    expect(await root.findByRole("listbox", { name: "シフト開始時間" })).toBeTruthy();
    await userEvent.click(await root.findByRole("option", { name: "15:00" }));
    await waitFor(() => expect(startTimeSelect).toHaveTextContent("15:00"));

    const endTimeSelect = root.getByRole("combobox", { name: "シフト終了時間" });
    await userEvent.click(endTimeSelect);
    expect(await root.findByRole("listbox", { name: "シフト終了時間" })).toBeTruthy();
    await userEvent.click(await root.findByRole("option", { name: "23:00" }));
    await waitFor(() => expect(endTimeSelect).toHaveTextContent("23:00"));

    await clickButton(root, "戻る");
    await root.findByText("希望シフトの集め方");
    await clickButton(root, "勤務区分");
    await clickButton(root, "次へ");

    await root.findByText("勤務区分を追加");
    expect(root.getByDisplayValue("早番")).toBeTruthy();
    expect(root.getByDisplayValue("遅番")).toBeTruthy();
    await clickButton(root, "勤務区分を追加");
    await waitFor(() => expect(root.getAllByRole("textbox", { name: "区分名" })).toHaveLength(3));
    await clickButton(root, "勤務区分を追加");
    await waitFor(() => expect(root.getAllByRole("textbox", { name: "区分名" })).toHaveLength(4));
    const shiftTypeNameInputs = root.getAllByRole("textbox", { name: "区分名" });
    await userEvent.type(shiftTypeNameInputs[2], "中番");
    await userEvent.type(shiftTypeNameInputs[3], "深夜");
    expect(await root.findByText("勤務区分は4件まで登録できます。")).toBeTruthy();
    expect(root.getByRole("button", { name: /勤務区分を追加/ })).toBeDisabled();
    await clickButton(root, "次へ");

    expect(await root.findByText("現在の設定: 定休日なし")).toBeTruthy();
    expect(await root.findByRole("button", { name: "変更を保存" })).toBeTruthy();
  },
};

function getTestRoot(canvasElement: HTMLElement): HTMLElement {
  return (canvasElement.ownerDocument.querySelector('[role="dialog"]') as HTMLElement | null) ?? canvasElement;
}

async function clickButton(root: ReturnType<typeof within>, name: string) {
  await userEvent.click(root.getByRole("button", { name: new RegExp(name) }));
}
