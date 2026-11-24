import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "..";
import { AUTO_CREATE_AI_OPTION_STORAGE_KEY, AUTO_CREATE_BREAK_OPTION_STORAGE_KEY } from "../autoCreateOptionStorage";
import type { ShiftFormStaffing } from "../types";
import { mockPositions } from "./fixtures";
import { allPatternsArgs, desktopGlobals, fullscreenParameters, mobileGlobals, shiftFormDecorators } from "./shared";

const emptyShifts = allPatternsArgs.initialShifts.map((shift) => ({ ...shift, positions: [], breaks: undefined }));

// 募集の日に、10:00から18:00まで1人が必要な店舗。必要人数があるため、自動作成で「作成する」を押せる。
const staffing: ShiftFormStaffing = {
  breakRule: null,
  isLocked: false,
  templates: [],
  days: allPatternsArgs.dates.map((date) => ({
    date,
    source: "weekday",
    templateId: null,
    templateName: "平日",
    requirements: { kind: "time", bars: [{ positionId: mockPositions[0].id, startTime: "10:00", endTime: "18:00" }] },
  })),
};

// 「作成する」で渡された作り方を、Storyの中で確かめるために覚える。
const createdMethods: string[] = [];

const meta = {
  title: "Features/Shift/ShiftForm/Auto Create",
  component: ShiftForm,
  decorators: shiftFormDecorators,
  parameters: { ...fullscreenParameters, screenshot: { skip: true } },
  args: {
    ...allPatternsArgs,
    initialDetailMode: true,
    staffing,
    onSaveDraft: () => {},
    onConfirm: () => {},
    header: { shopName: "店舗", periodTitle: "1/23" },
  },
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** くわしく表示では、PCの上の行のボタンから開ける。 */
export const Desktop: Story = {
  args: { initialShifts: emptyShifts },
  globals: desktopGlobals,
  parameters: { screenshot: { skip: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "自動作成" }));
    const dialog = within(await body.findByRole("dialog", { name: "シフトを自動作成" }));
    await userEvent.click(dialog.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
  },
};

/** スマートフォンでは、上の行の保存と確定のメニューの先頭から開ける。 */
export const MenuOnMobile: Story = {
  args: { initialShifts: emptyShifts },
  globals: mobileGlobals,
  parameters: { screenshot: { skip: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: /^保存・確定/ }));
    const items = await body.findAllByRole("menuitem");
    await expect(items[0]).toHaveAccessibleName("シフトを自動作成");
    await userEvent.click(items[0]);
    await expect(await body.findByRole("dialog", { name: "シフトを自動作成" })).toBeInTheDocument();
  },
};

/** シンプル表示、確定済みの募集、閲覧専用では、どこにも出さない。 */
export const HiddenOutsideEditableDetail: Story = {
  args: { initialShifts: emptyShifts, initialDetailMode: false },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "下書き保存" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "自動作成" })).not.toBeInTheDocument();
  },
};

export const HiddenWhenConfirmed: Story = {
  args: { initialShifts: emptyShifts, isConfirmed: true },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "下書き保存" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "自動作成" })).not.toBeInTheDocument();
  },
};

/** 閲覧専用では、PDF・Excelのボタンだけを出し、自動作成のボタンを出さない。 */
export const HiddenWhenReadOnly: Story = {
  args: { initialShifts: emptyShifts, isReadOnly: true, exportAction: { onClick: () => {}, isDisabled: false } },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: /^PDF・Excel/ })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "自動作成" })).not.toBeInTheDocument();
  },
};

/** 「作成する」を押すと、画面の外から渡した処理へ選んだ作り方を渡し、終わるとダイアログを閉じる。 */
export const CreateRunsAction: Story = {
  // 選んだオプションは端末に覚えるため、前の状態を持ち越さないよう、消してから始める。
  beforeEach: () => {
    window.localStorage.removeItem(AUTO_CREATE_BREAK_OPTION_STORAGE_KEY);
    window.localStorage.removeItem(AUTO_CREATE_AI_OPTION_STORAGE_KEY);
  },
  args: {
    initialShifts: emptyShifts,
    detailActions: {
      autoCreateAction: {
        onCreate: async (method, options) => {
          createdMethods.push(`${method}:${options.includesBreaks ? "休憩あり" : "休憩なし"}`);
          return true;
        },
        isLoading: false,
      },
    },
  },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    createdMethods.length = 0;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "自動作成" }));
    const dialog = within(await body.findByRole("dialog", { name: "シフトを自動作成" }));
    // 時間指定の募集なので、休憩時間も作るかの選択が出る。外してから作る。
    await userEvent.click(dialog.getByText("休憩時間も自動作成する"));
    await userEvent.click(dialog.getByRole("button", { name: "作成する" }));

    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(createdMethods).toEqual(["rule:休憩なし"]);
  },
};

/** 募集期間に必要人数のある日がない店舗では、ダイアログを開けるが「作成する」を押せない。 */
export const DisabledWithoutRequirements: Story = {
  args: { initialShifts: emptyShifts, staffing: undefined },
  globals: desktopGlobals,
  parameters: { screenshot: { skip: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "自動作成" }));
    const dialog = within(await body.findByRole("dialog", { name: "シフトを自動作成" }));
    await expect(dialog.getByRole("button", { name: "作成する" })).toBeDisabled();
  },
};

/** AIの手直しを入れたままキャンセルで閉じても、次に開いたときは、入れた状態のまま始まる。 */
export const RemembersAiOptionOnReopen: Story = {
  beforeEach: () => {
    window.localStorage.removeItem(AUTO_CREATE_AI_OPTION_STORAGE_KEY);
    return () => window.localStorage.removeItem(AUTO_CREATE_AI_OPTION_STORAGE_KEY);
  },
  args: { initialShifts: emptyShifts },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const aiOption = "メモの内容に合わせてAIで手直しする";
    await userEvent.click(await canvas.findByRole("button", { name: "自動作成" }));
    const dialog = within(await body.findByRole("dialog", { name: "シフトを自動作成" }));
    await expect(dialog.getByRole("checkbox", { name: aiOption })).not.toBeChecked();
    await userEvent.click(dialog.getByText(aiOption));
    await expect(dialog.getByRole("checkbox", { name: aiOption })).toBeChecked();
    await userEvent.click(dialog.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(canvas.getByRole("button", { name: "自動作成" }));
    const reopened = within(await body.findByRole("dialog", { name: "シフトを自動作成" }));
    await expect(reopened.getByRole("checkbox", { name: aiOption })).toBeChecked();
  },
};
