import { Field, Input, NativeSelect, Stack, Textarea } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Select } from "@/src/components/ui/Select";

const inputTypes = ["text", "email", "password", "search", "tel", "url", "number"] as const;

const inputLabels = {
  text: "テキスト",
  email: "メールアドレス",
  password: "パスワード",
  search: "検索",
  tel: "電話番号",
  url: "URL",
  number: "数値",
} satisfies Record<(typeof inputTypes)[number], string>;

const selectItems = [
  { value: "option-1", label: "選択肢1" },
  { value: "option-2", label: "選択肢2" },
];

const FormControlFontSizePreview = () => (
  <Stack gap={4} maxW="420px" p={4}>
    <Field.Root>
      <Field.Label>type未指定</Field.Label>
      <Input placeholder="入力してください" />
    </Field.Root>

    {inputTypes.map((type) => (
      <Field.Root key={type}>
        <Field.Label>{inputLabels[type]}</Field.Label>
        <Input type={type} placeholder="入力してください" />
      </Field.Root>
    ))}

    <Field.Root>
      <Field.Label>複数行テキスト</Field.Label>
      <Textarea placeholder="入力してください" />
    </Field.Root>

    <Field.Root>
      <Field.Label>ネイティブ選択</Field.Label>
      <NativeSelect.Root>
        <NativeSelect.Field defaultValue="option-1">
          {selectItems.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Field.Root>

    <Select label="カスタム選択" items={selectItems} value="option-1" onChange={() => {}} usePortal={false} />
  </Stack>
);

const meta = {
  title: "Devtools/FormControlFontSize",
  component: FormControlFontSizePreview,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof FormControlFontSizePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

const getFormControls = (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  return [
    canvas.getByLabelText("type未指定"),
    ...inputTypes.map((type) => canvas.getByLabelText(inputLabels[type])),
    canvas.getByLabelText("複数行テキスト"),
    canvas.getByRole("combobox", { name: "ネイティブ選択" }),
    canvas.getByRole("combobox", { name: "カスタム選択" }),
  ];
};

const expectFontSize = async (canvasElement: HTMLElement, expectedFontSize: string) => {
  for (const control of getFormControls(canvasElement)) {
    await expect(getComputedStyle(control).fontSize).toBe(expectedFontSize);
  }
};

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    await expectFontSize(canvasElement, "14px");
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile2", isRotated: false } },
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => {
    await expectFontSize(canvasElement, "16px");
  },
};

export const MobileLandscape: Story = {
  globals: { viewport: { value: "mobile2Landscape", isRotated: false } },
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => {
    const viewport = canvasElement.ownerDocument.defaultView;

    await expect(viewport?.innerWidth).toBe(896);
    await expect(viewport?.innerHeight).toBe(414);
    await expectFontSize(canvasElement, "16px");
  },
};
