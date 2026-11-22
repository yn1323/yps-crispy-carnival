import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ShiftForm } from "..";
import {
  fullscreenParameters,
  mobileGlobals,
  shiftFormDecorators,
  shiftTypeArgs,
  shiftTypeDateNotesArgs,
  shiftTypeValidationWarningArgs,
} from "./shared";
import { shiftTypeBoardSimpleArgs } from "./shiftTypeBoardFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/SP/Daily",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: shiftTypeArgs,
  globals: mobileGlobals,
};

export const WithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: shiftTypeValidationWarningArgs,
  globals: mobileGlobals,
};

export const WithDateNotes: Story = {
  args: shiftTypeDateNotesArgs,
  globals: mobileGlobals,
};

/** 連絡事項のある人の名前の横にアイコンを出し、タップで本文を開く。 */
export const DateNoteIconInteractive: Story = {
  args: shiftTypeDateNotesArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const icons = await canvas.findAllByRole("button", { name: "連絡事項1件" });
    await expect(icons).toHaveLength(2);

    await userEvent.click(icons[0]);
    const dialogs = await within(document.body).findAllByRole("dialog");
    await expect(dialogs).toHaveLength(1);
    await expect(dialogs[0].querySelector("[data-clarity-mask]")).toHaveTextContent("17時以降なら入れます");
  },
};

/** 希望どおり、希望だけ、希望外、時間の重なり、休み希望、未提出を1日に持つ代表例。 */
export const Board: Story = {
  args: shiftTypeBoardSimpleArgs,
  globals: mobileGlobals,
};

/** 「希望」をタップすると「○」が入り、もう一度タップすると外れる。点のある日は、表の下に点の意味を出す。 */
export const ToggleInteractive: Story = {
  args: shiftTypeBoardSimpleArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cell = (state: "勤務あり" | "勤務なし") => canvas.findByRole("button", { name: `山本 拓海 遅番 ${state}` });

    await expect(await cell("勤務なし")).toHaveTextContent("希望あり");
    await userEvent.click(await cell("勤務なし"));
    await expect(await cell("勤務あり")).toHaveTextContent("○");
    await expect(await canvas.findByRole("columnheader", { name: /遅番/ })).toHaveTextContent("15–21・4人");

    await userEvent.click(await cell("勤務あり"));
    await expect(await cell("勤務なし")).toHaveTextContent("希望あり");

    // 希望のないセルに入れると、橙の点が出る。山本さんは遅番だけを希望している。
    await userEvent.click(await canvas.findByRole("button", { name: "山本 拓海 早番 勤務なし" }));
    const unrequested = await canvas.findByRole("button", { name: "山本 拓海 早番 勤務あり" });
    await expect(unrequested.querySelector("[data-assignment-dot]")).toHaveAttribute("data-assignment-dot", "orange");

    // 点の理由を出す場所がないため、表の下に点の意味を出す。名前の横の注意のアイコンは出さない。
    await expect(canvas.getByText("橙の点：確認が必要")).toBeVisible();
    await expect(canvas.getByText("赤の点：時間が重なる")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /^確認事項\d+件$/ })).not.toBeInTheDocument();
  },
};

/** 休み希望の人は、最初はたたまれている。開いて割り当てると通常の行へ移る。 */
export const RestGroupInteractive: Story = {
  args: shiftTypeBoardSimpleArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("button", { name: /^休み希望 4人/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("row", { name: /中村 さくら/ })).not.toBeInTheDocument();

    await userEvent.click(toggle);
    await userEvent.click(await canvas.findByRole("button", { name: "中村 さくら 早番 勤務なし" }));

    await expect(await canvas.findByRole("button", { name: /^休み希望 3人/ })).toBeInTheDocument();
    await expect(await canvas.findByRole("button", { name: "中村 さくら 早番 勤務あり" })).toHaveAccessibleDescription(
      "希望していないシフトです",
    );
  },
};
