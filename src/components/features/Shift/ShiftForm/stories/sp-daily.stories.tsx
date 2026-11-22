import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "..";
import {
  allPatternsArgs,
  emptyOrAllUnsubmittedArgs,
  expectStaffNoteIconOpensOnTap,
  expectWarningIconOpensOnTap,
  fullscreenParameters,
  halfHourBusinessHoursArgs,
  mobileGlobals,
  overnightArgs,
  shiftFormDecorators,
  timeDateNotesArgs,
  timeRestFoldArgs,
  validationWarningArgs,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Time/SP/Daily",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TimeBasic: Story = {
  name: "Basic",
  args: allPatternsArgs,
  globals: mobileGlobals,
};

export const TimeHalfHourBusinessHours: Story = {
  name: "Half Hour Business Hours",
  args: halfHourBusinessHoursArgs,
  globals: mobileGlobals,
};

export const TimeOvernight: Story = {
  name: "Overnight",
  args: overnightArgs,
  globals: mobileGlobals,
};

export const TimeEmptyOrAllUnsubmitted: Story = {
  name: "Empty Or All Unsubmitted",
  args: emptyOrAllUnsubmittedArgs,
  globals: mobileGlobals,
};

export const TimeReadOnly: Story = {
  name: "Read Only",
  args: { ...allPatternsArgs, isReadOnly: true, currentStaffId: "staff1" },
  globals: mobileGlobals,
};

export const TimeConfirmed: Story = {
  name: "Confirmed",
  args: { ...allPatternsArgs, isConfirmed: true },
  globals: mobileGlobals,
};

// 確認事項（ワーニング）: SP日別でのDateRailバッジ＋スタッフカード/行の理由アイコン
export const TimeWithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: validationWarningArgs,
  globals: mobileGlobals,
};

export const WithDateNotes: Story = {
  args: timeDateNotesArgs,
  globals: mobileGlobals,
};

/** 連絡事項を非表示にしたときだけ名前の右にアイコンを出し、タップで本文を開く。 */
export const DateNotesHiddenIconInteractive: Story = {
  args: timeDateNotesArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await expectStaffNoteIconOpensOnTap(canvasElement, "17時以降なら入れます");
  },
};

export const ValidationWarningIconInteractive: Story = {
  args: validationWarningArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await expectWarningIconOpensOnTap(canvasElement);
  },
};

/** 休み希望の人は、下に「休み希望 2人」としてたたむ。連絡事項のある人は「休み」に、未提出の人は「未提出」に出したままにする。 */
export const TimeRestFolded: Story = {
  name: "Rest Folded",
  args: timeRestFoldArgs,
  globals: mobileGlobals,
};

/** たたんだ休み希望の人は、開くとカードが並び、タップして勤務を入れられる。 */
export const RestFoldInteractive: Story = {
  args: timeRestFoldArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const findCard = (staffId: string) => canvasElement.querySelector(`[data-tour="shift-row-${staffId}"]`);
    const toggle = await canvas.findByRole("button", { name: /^休み希望 2人/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(findCard("rest1")).toBeNull();
    // 連絡事項のある休み希望の人（伊藤さん）と、未提出の人（Cさん）は、たたまない。
    await expect(findCard("rest3")).not.toBeNull();
    await expect(findCard("staff3")).not.toBeNull();

    await userEvent.click(toggle);
    await waitFor(() => expect(findCard("rest1")).not.toBeNull());
    await expect(findCard("rest2")).not.toBeNull();

    // 開いたカードをタップすると、勤務を入れる編集シートが開く。
    await userEvent.click(findCard("rest1") as HTMLElement);
    await expect(await within(document.body).findByRole("dialog")).toHaveTextContent("中村 さくら");
  },
};
