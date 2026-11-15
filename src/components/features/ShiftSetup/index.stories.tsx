import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { buildRandomShiftSetupDraft } from "@/convex/shiftSetup/assistDraft";
import { createDeferred } from "@/src/devtools/createDeferred";
import { ShiftSetupSkeleton, ShiftSetupView } from ".";
import type { LeaveDialogState, ShiftSetupAssistResult, ShiftSetupData, ShiftSetupRemote } from "./types";
import { useShiftSetupEditor } from "./useShiftSetupEditor";

const hallId = "position-hall" as Id<"positions">;
const kitchenId = "position-kitchen" as Id<"positions">;
const registerId = "position-register" as Id<"positions">;

const positions: ShiftSetupData["positions"] = [
  { _id: hallId, name: "ホール", color: "#3b82f6", isDefault: true },
  { _id: kitchenId, name: "キッチン", color: "#c2410c", isDefault: false },
  { _id: registerId, name: "レジ", color: "#7c3aed", isDefault: false },
];

const staffNames = ["佐藤 花子", "鈴木 次郎", "高橋 美咲", "田中 太郎", "伊藤 さくら", "渡辺 健"];
const staffs: ShiftSetupData["staffs"] = staffNames.map((name, index) => ({
  _id: `staff-${index + 1}` as Id<"staffs">,
  name,
  unavailablePositionIds: index === 1 ? [kitchenId] : [],
  skillLevel: index === 0 ? "lead" : index === 4 ? "newcomer" : "standard",
}));

const timeSetup: ShiftSetupData = {
  shopName: "スーパー美味しいカフェ新宿店",
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  regularClosedDays: ["wed"],
  canWriteBusinessData: true,
  businessWriteBlockReason: null,
  positions,
  dayTemplates: [
    {
      _id: "template-weekday" as Id<"shiftDayTemplates">,
      name: "平日",
      weekdays: ["mon", "tue", "thu", "fri"],
      slots: [
        {
          key: { kind: "time", startTime: "09:00", endTime: "14:00" },
          requirements: [
            { positionId: hallId, count: 2 },
            { positionId: kitchenId, count: 1 },
            { positionId: registerId, count: 1 },
          ],
        },
        {
          key: { kind: "time", startTime: "14:00", endTime: "17:00" },
          requirements: [{ positionId: hallId, count: 1 }],
        },
        {
          key: { kind: "time", startTime: "17:00", endTime: "22:00" },
          requirements: [
            { positionId: hallId, count: 3 },
            { positionId: kitchenId, count: 2 },
            { positionId: registerId, count: 1 },
          ],
        },
      ],
    },
    {
      _id: "template-weekend" as Id<"shiftDayTemplates">,
      name: "土日",
      weekdays: ["sat", "sun"],
      slots: [
        {
          key: { kind: "time", startTime: "09:00", endTime: "17:00" },
          requirements: [
            { positionId: hallId, count: 3 },
            { positionId: kitchenId, count: 2 },
            { positionId: registerId, count: 1 },
          ],
        },
        {
          key: { kind: "time", startTime: "17:00", endTime: "22:00" },
          requirements: [
            { positionId: hallId, count: 4 },
            { positionId: kitchenId, count: 2 },
            { positionId: registerId, count: 2 },
          ],
        },
      ],
    },
  ],
  breakRule: { minWorkMinutes: 360, breakMinutes: 45 },
  staffs,
  assistAvailable: true,
};

const notConfiguredSetup: ShiftSetupData = {
  ...timeSetup,
  positions: [{ _id: hallId, name: "シフト", color: "#3b82f6", isDefault: true }],
  dayTemplates: [],
  breakRule: null,
  staffs: staffs.map((staff) => ({ ...staff, unavailablePositionIds: [], skillLevel: "standard" })),
};

const shiftTypeSetup: ShiftSetupData = {
  ...timeSetup,
  submissionPattern: {
    kind: "shiftType",
    options: [
      { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
      { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
    ],
  },
  dayTemplates: [
    {
      _id: "template-weekday" as Id<"shiftDayTemplates">,
      name: "平日",
      weekdays: ["mon", "tue", "thu", "fri"],
      slots: [
        {
          key: { kind: "shiftType", optionId: "early" },
          requirements: [
            { positionId: hallId, count: 2 },
            { positionId: kitchenId, count: 1 },
          ],
        },
        { key: { kind: "shiftType", optionId: "late" }, requirements: [{ positionId: hallId, count: 3 }] },
      ],
    },
  ],
};

const dateOnlySetup: ShiftSetupData = {
  ...timeSetup,
  submissionPattern: { kind: "dateOnly" },
  dayTemplates: [
    {
      _id: "template-weekday" as Id<"shiftDayTemplates">,
      name: "平日",
      weekdays: ["mon", "tue", "thu", "fri"],
      slots: [
        {
          key: { kind: "allDay" },
          requirements: [
            { positionId: hallId, count: 4 },
            { positionId: kitchenId, count: 2 },
          ],
        },
      ],
    },
  ],
};

const paletteForLongText = ["#3b82f6", "#c2410c", "#7c3aed", "#db2777", "#b45309", "#0f766e", "#dc2626", "#475569"];
const longTextPositions: ShiftSetupData["positions"] = [
  { _id: hallId, name: "ホール接客と案内とお会計の担当スタッフ", color: paletteForLongText[0], isDefault: true },
  ...paletteForLongText.slice(1).map((color, index) => ({
    _id: `position-long-${index}` as Id<"positions">,
    name: index % 2 === 0 ? `仕込みと盛り付けと洗い場の担当${index + 1}` : `ドリンク${index + 1}`,
    color,
    isDefault: false,
  })),
];

const longTextSetup: ShiftSetupData = {
  ...timeSetup,
  shopName: "駅前商業施設フードコート内スーパー美味しいカフェ新宿中央東口店",
  positions: longTextPositions,
  dayTemplates: [
    {
      _id: "template-weekday" as Id<"shiftDayTemplates">,
      name: "祝日を除く月曜から金曜までの通常営業日",
      weekdays: ["mon", "tue", "thu", "fri"],
      slots: [
        {
          key: { kind: "time", startTime: "09:00", endTime: "14:00" },
          requirements: longTextPositions.map((position, index) => ({
            positionId: position._id,
            count: index === 0 ? 12 : index,
          })),
        },
        { key: { kind: "time", startTime: "14:00", endTime: "22:00" }, requirements: [] },
      ],
    },
  ],
  staffs: staffs.map((staff, index) => ({
    ...staff,
    name: index === 0 ? "とても長い氏名を持つ管理者ユーザー田中太郎左衛門" : staff.name,
    unavailablePositionIds: [],
  })),
};

const ninePositionsSetup: ShiftSetupData = {
  ...notConfiguredSetup,
  positions: [
    { _id: hallId, name: "ホール", color: "#3b82f6", isDefault: true },
    ...["#c2410c", "#7c3aed", "#db2777", "#b45309", "#0f766e", "#dc2626", "#475569", "#4d7c0f"].map((color, index) => ({
      _id: `position-${index + 2}` as Id<"positions">,
      name: `ポジション${index + 2}`,
      color,
      isDefault: false,
    })),
  ],
};

const closedLeaveDialog: LeaveDialogState = {
  isOpen: false,
  isSaving: false,
  onStay: () => {},
  onLeaveWithoutSaving: () => {},
  onSaveAndLeave: () => {},
};

function buildAssistResult(setup: ShiftSetupData): ShiftSetupAssistResult {
  return {
    status: "ok",
    templates: buildRandomShiftSetupDraft({
      pattern: setup.submissionPattern,
      positionIds: setup.positions.map((position) => position._id),
      regularClosedDays: setup.regularClosedDays,
      random: () => 0.5,
    }),
  };
}

type RemoteCall = { name: string; args: unknown };

type HarnessProps = {
  setup: ShiftSetupData;
  assistResult?: ShiftSetupAssistResult;
  leaveDialog?: LeaveDialogState;
  /** 必要人数の保存を、画面内の「保存を完了する」を押すまで待たせる。連打の確認に使う。 */
  holdDayTemplateSave?: boolean;
};

/**
 * 編集の状態は本物のhookで動かし、保存先だけを画面内の値へ差し替える。
 * 保存の呼び出しは`remote-calls`へ記録し、Behavior Storyが保存内容を確かめられるようにする。
 */
function ShiftSetupStory({
  setup: initialSetup,
  assistResult,
  leaveDialog = closedLeaveDialog,
  holdDayTemplateSave = false,
}: HarnessProps) {
  const [setup, setSetup] = useState(initialSetup);
  const pendingSave = useRef<ReturnType<typeof createDeferred> | null>(null);
  const [calls, setCalls] = useState<RemoteCall[]>([]);
  const record = (name: string, args: unknown) => setCalls((current) => [...current, { name, args }]);

  const remote: ShiftSetupRemote = {
    savePositions: async (inputs) => {
      record("savePositions", inputs);
      setSetup((current) => ({
        ...current,
        positions: inputs.map((input, index) => ({
          _id: input.id ?? (`position-added-${index}` as Id<"positions">),
          name: input.name,
          color: input.color,
          isDefault: current.positions.some((position) => position._id === input.id && position.isDefault),
        })),
      }));
    },
    saveDayTemplates: async (inputs) => {
      record("saveDayTemplates", inputs);
      if (holdDayTemplateSave) {
        pendingSave.current = createDeferred();
        await pendingSave.current.promise;
      }
      setSetup((current) => ({
        ...current,
        dayTemplates: inputs.map((input, index) => ({
          _id: input.id ?? (`template-added-${index}` as Id<"shiftDayTemplates">),
          name: input.name,
          weekdays: input.weekdays,
          slots: input.slots,
        })),
      }));
    },
    saveBreakRule: async (breakRule) => {
      record("saveBreakRule", breakRule);
      setSetup((current) => ({ ...current, breakRule }));
    },
    saveStaffShiftProfiles: async (profiles) => {
      record("saveStaffShiftProfiles", profiles);
      setSetup((current) => ({
        ...current,
        staffs: current.staffs.map((staff) => {
          const profile = profiles.find((candidate) => candidate.staffId === staff._id);
          return profile
            ? { ...staff, unavailablePositionIds: profile.unavailablePositionIds, skillLevel: profile.skillLevel }
            : staff;
        }),
      }));
    },
    suggestShiftSetup: async () => {
      record("suggestShiftSetup", null);
      return assistResult ?? buildAssistResult(setup);
    },
  };
  const editor = useShiftSetupEditor({ setup, remote });

  return (
    <>
      <output hidden data-testid="remote-calls">
        {JSON.stringify(calls)}
      </output>
      {holdDayTemplateSave && (
        <button type="button" hidden data-testid="release-save" onClick={() => pendingSave.current?.resolve()}>
          保存を完了する
        </button>
      )}
      <ShiftSetupView {...editor.view} leaveDialog={leaveDialog} onBack={() => {}} />
    </>
  );
}

const meta = {
  title: "Features/ShiftSetup",
  component: ShiftSetupStory,
  decorators: [
    (Story) => (
      <Box maxW="1024px" mx="auto">
        <Story />
      </Box>
    ),
  ],
  parameters: { layout: "padded" },
  args: { setup: timeSetup },
} satisfies Meta<typeof ShiftSetupStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const mobile1 = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
} satisfies Partial<Story>;

const mobile2 = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
} satisfies Partial<Story>;

function readRemoteCalls(canvasElement: HTMLElement): RemoteCall[] {
  return JSON.parse(within(canvasElement).getByTestId("remote-calls").textContent ?? "[]");
}

function getPendingBar(canvasElement: HTMLElement) {
  return within(canvasElement).findByRole("region", { name: "保存していない変更" });
}

export const Default: Story = { name: "設定済み・時間指定" };

export const NotConfigured: Story = {
  name: "未設定・AIサポートあり",
  args: { setup: notConfiguredSetup },
};

export const NotConfiguredWithoutAssist: Story = {
  name: "未設定・AIサポートなし",
  args: { setup: { ...notConfiguredSetup, assistAvailable: false } },
};

export const WithoutAssist: Story = {
  name: "設定済み・AIサポートなし",
  args: { setup: { ...timeSetup, assistAvailable: false } },
};

export const ShiftTypePattern: Story = {
  name: "パターン選択",
  args: { setup: shiftTypeSetup },
};

export const DateOnlyPattern: Story = {
  name: "日付選択",
  args: { setup: dateOnlySetup },
};

export const ReadOnly: Story = {
  name: "閲覧専用",
  args: {
    setup: { ...timeSetup, canWriteBusinessData: false, businessWriteBlockReason: "usageLimitExceeded" },
  },
};

export const ReadOnlyNotConfigured: Story = {
  name: "閲覧専用・未設定",
  args: {
    setup: { ...notConfiguredSetup, canWriteBusinessData: false, businessWriteBlockReason: "paymentResultPending" },
  },
};

export const LongText: Story = {
  name: "長い名前・ポジション8件",
  args: { setup: longTextSetup },
};

export const NoStaffs: Story = {
  name: "スタッフ0人",
  args: { setup: { ...timeSetup, staffs: [] } },
};

export const Loading: Story = {
  render: () => <ShiftSetupSkeleton />,
};

export const PendingChanges: Story = {
  name: "保存していない変更あり",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const weekday = within(canvas.getByRole("group", { name: "平日" }));
    await userEvent.click(
      within(weekday.getByRole("group", { name: "14:00〜17:00 キッチンの必要人数" })).getByRole("button", {
        name: "1人増やす",
      }),
    );
    await userEvent.click(
      within(canvas.getByRole("group", { name: "高橋 美咲" })).getByRole("button", { name: "レジ" }),
    );
    await expect(await getPendingBar(canvasElement)).toHaveTextContent("必要人数とスタッフの変更を保存していません");
  },
};

export const PositionsDialog: Story = {
  name: "ポジションの編集",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = within(canvas.getByRole("region", { name: "ポジション" }));
    await userEvent.click(section.getByRole("button", { name: "編集する" }));
    const dialog = await body.findByRole("dialog", { name: "ポジションを編集" });
    await userEvent.click(within(dialog).getByRole("button", { name: "キッチンの色を変更" }));
    await waitFor(() => expect(within(dialog).getByRole("group", { name: "キッチンの色" })).toBeVisible());
  },
};

export const BreakRuleDialog: Story = {
  name: "休憩の決まりの編集",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = within(canvas.getByRole("region", { name: "休憩の決まり" }));
    await userEvent.click(section.getByRole("button", { name: "編集する" }));
    const dialog = await body.findByRole("dialog", { name: "休憩の決まりを編集" });
    await waitFor(() => expect(dialog).toBeVisible());
  },
};

export const AssistDialog: Story = {
  name: "AIサポート・型がある場合",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "AIで下書きを作る" }));
    const dialog = await body.findByRole("dialog", { name: "AIで下書きを作る" });
    await waitFor(() => expect(dialog).toBeVisible());
  },
};

export const LeaveConfirmation: Story = {
  name: "離脱の確認",
  args: { leaveDialog: { ...closedLeaveDialog, isOpen: true } },
};

export const Mobile: Story = { ...mobile1, name: "モバイル320px・設定済み" };

export const MobileNotConfigured: Story = {
  ...mobile1,
  name: "モバイル320px・未設定",
  args: { setup: notConfiguredSetup },
};

export const MobileShiftType: Story = {
  ...mobile2,
  name: "モバイル414px・パターン選択",
  args: { setup: shiftTypeSetup },
};

export const MobileDateOnly: Story = {
  ...mobile2,
  name: "モバイル414px・日付選択",
  args: { setup: dateOnlySetup },
};

export const MobileLongText: Story = {
  ...mobile1,
  name: "モバイル320px・長い名前",
  args: { setup: longTextSetup },
};

export const MobileReadOnly: Story = {
  ...mobile2,
  name: "モバイル414px・閲覧専用",
  args: ReadOnly.args,
};

export const MobilePendingChanges: Story = {
  ...mobile1,
  name: "モバイル320px・保存していない変更あり",
  play: PendingChanges.play,
};

export const MobilePositionsDialog: Story = {
  ...mobile1,
  name: "モバイル320px・ポジションの編集",
  play: PositionsDialog.play,
};

export const MobileAssistDialog: Story = {
  ...mobile1,
  name: "モバイル320px・AIサポート",
  play: AssistDialog.play,
};

// ---- Behavior ----

const changeRequiredCountAndSave: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const weekday = within(canvas.getByRole("group", { name: "平日" }));
  const cell = weekday.getByRole("group", { name: "14:00〜17:00 キッチンの必要人数" });
  const increase = within(cell).getByRole("button", { name: "1人増やす" });
  const decrease = within(cell).getByRole("button", { name: "1人減らす" });

  await expect(cell).toHaveTextContent("未設定");
  await expect(decrease).toBeDisabled();
  await userEvent.click(increase);
  await userEvent.click(increase);
  await userEvent.click(increase);
  await userEvent.click(decrease);
  await expect(cell).toHaveTextContent("2人");

  const bar = await getPendingBar(canvasElement);
  await expect(bar).toHaveTextContent("必要人数の変更を保存していません");
  await expect(readRemoteCalls(canvasElement)).toEqual([]);
  await userEvent.click(within(bar).getByRole("button", { name: "保存する" }));

  await waitFor(() => expect(canvas.queryByRole("region", { name: "保存していない変更" })).not.toBeInTheDocument());
  const calls = readRemoteCalls(canvasElement);
  await expect(calls.map((call) => call.name)).toEqual(["saveDayTemplates"]);
  const [savedWeekday] = calls[0].args as Array<{ id: string; slots: Array<{ key: unknown; requirements: unknown }> }>;
  await expect(savedWeekday.id).toBe("template-weekday");
  await expect(savedWeekday.slots[1]).toEqual({
    key: { kind: "time", startTime: "14:00", endTime: "17:00" },
    requirements: [
      { positionId: hallId, count: 1 },
      { positionId: kitchenId, count: 2 },
    ],
  });
  await expect(cell).toHaveTextContent("2人");
};

export const RequiredCountBehavior: Story = {
  name: "Behavior: −と＋で人数を変えて保存する",
  parameters: { screenshot: { skip: true } },
  play: changeRequiredCountAndSave,
};

export const MobileRequiredCountBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでも−と＋で人数を変えて保存する",
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    const weekday = within(within(context.canvasElement).getByRole("group", { name: "平日" }));
    // スマートフォンでは表の見出し行を出さず、区切りごとのカードの中にポジション名を出す。
    await expect(weekday.queryByRole("columnheader", { name: "キッチン" })).not.toBeInTheDocument();
    const cell = weekday.getByRole("group", { name: "14:00〜17:00 キッチンの必要人数" }).closest('[role="cell"]');
    await expect(within(cell as HTMLElement).getByText("キッチン")).toBeVisible();
    await changeRequiredCountAndSave(context);
  },
};

export const SaveLockBehavior: Story = {
  name: "Behavior: 保存中は続けて保存できない",
  args: { holdDayTemplateSave: true },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cell = within(canvas.getByRole("group", { name: "平日" })).getByRole("group", {
      name: "09:00〜14:00 ホールの必要人数",
    });
    await userEvent.click(within(cell).getByRole("button", { name: "1人増やす" }));
    const bar = within(await getPendingBar(canvasElement));
    const saveButton = bar.getByRole("button", { name: "保存する" });

    await userEvent.click(saveButton);
    await waitFor(() => expect(saveButton).toBeDisabled());
    await expect(bar.getByRole("button", { name: "元に戻す" })).toBeDisabled();
    saveButton.click();
    await expect(readRemoteCalls(canvasElement)).toHaveLength(1);

    canvas.getByTestId("release-save").click();
    await waitFor(() => expect(canvas.queryByRole("region", { name: "保存していない変更" })).not.toBeInTheDocument());
    await expect(readRemoteCalls(canvasElement)).toHaveLength(1);
  },
};

export const ResetChangesBehavior: Story = {
  name: "Behavior: 元に戻すと保存済みの人数へ戻る",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const cell = within(canvas.getByRole("group", { name: "平日" })).getByRole("group", {
      name: "09:00〜14:00 ホールの必要人数",
    });
    await userEvent.click(within(cell).getByRole("button", { name: "1人増やす" }));
    await expect(cell).toHaveTextContent("3人");

    const bar = await getPendingBar(canvasElement);
    await userEvent.click(within(bar).getByRole("button", { name: "元に戻す" }));
    const confirmation = await body.findByRole("alertdialog", { name: "変更を元に戻す" });
    await userEvent.click(within(confirmation).getByRole("button", { name: "元に戻す" }));

    await waitFor(() => expect(cell).toHaveTextContent("2人"));
    await expect(canvas.queryByRole("region", { name: "保存していない変更" })).not.toBeInTheDocument();
    await expect(readRemoteCalls(canvasElement)).toEqual([]);
  },
};

export const WeekdayMoveBehavior: Story = {
  name: "Behavior: 別の型の曜日を押すと、その型へ移る",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const weekday = within(canvas.getByRole("group", { name: "平日" }));
    const weekend = within(canvas.getByRole("group", { name: "土日" }));

    await expect(weekday.getByRole("button", { name: "金曜日" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(weekend.getByRole("button", { name: "金曜日・平日で使用中" }));

    await expect(weekend.getByRole("button", { name: "金曜日" })).toHaveAttribute("aria-pressed", "true");
    await expect(weekday.getByRole("button", { name: "金曜日・土日で使用中" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(weekday.getByRole("button", { name: "水曜日・定休日" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(within(await getPendingBar(canvasElement)).getByRole("button", { name: "保存する" }));
    await waitFor(() => expect(readRemoteCalls(canvasElement)).toHaveLength(1));
    const templates = readRemoteCalls(canvasElement)[0].args as Array<{ name: string; weekdays: string[] }>;
    await expect(templates.map((template) => [template.name, template.weekdays])).toEqual([
      ["平日", ["mon", "tue", "thu"]],
      ["土日", ["sun", "fri", "sat"]],
    ]);
  },
};

export const CreateTemplateBehavior: Story = {
  name: "Behavior: 型を作り、時間帯を分ける",
  args: { setup: { ...notConfiguredSetup, positions } },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "型を作る" }));

    const template = within(await canvas.findByRole("group", { name: "通常" }));
    // 定休日の水曜を除く営業日が、最初から選ばれている。
    await expect(template.getByRole("button", { name: "月曜日" })).toHaveAttribute("aria-pressed", "true");
    await expect(template.getByRole("button", { name: "水曜日・定休日" })).toHaveAttribute("aria-pressed", "false");
    await expect(template.getByRole("combobox", { name: "09:00〜22:00の開始" })).toHaveValue("09:00");

    await userEvent.click(template.getByRole("button", { name: "時間帯を追加" }));
    await expect(await template.findByRole("combobox", { name: "09:00〜16:00の終了" })).toHaveValue("16:00");
    const secondStart = template.getByRole("combobox", { name: "16:00〜22:00の開始" });

    await userEvent.selectOptions(secondStart, "15:00");
    await expect(await template.findByRole("alert")).toHaveTextContent("時間帯が重なっています");
    await userEvent.selectOptions(template.getByRole("combobox", { name: "09:00〜16:00の終了" }), "15:00");
    await waitFor(() => expect(template.queryByRole("alert")).not.toBeInTheDocument());
    await expect(readRemoteCalls(canvasElement)).toEqual([]);
  },
};

export const AssistDraftBehavior: Story = {
  name: "Behavior: AIの下書きは表に入るだけで、保存するまで保存されない",
  args: { setup: { ...notConfiguredSetup, positions } },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "AIで下書きを作る" }));
    const dialog = await body.findByRole("dialog", { name: "AIで下書きを作る" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "店の状況" }), "平日は昼が混みます");
    await userEvent.click(within(dialog).getByRole("button", { name: "下書きを作る" }));

    const weekday = within(await canvas.findByRole("group", { name: "平日" }));
    await expect(weekday.getByRole("group", { name: "11:00〜14:00 キッチンの必要人数" })).toHaveTextContent("2人");
    await expect(canvas.getByRole("group", { name: "週末" })).toBeVisible();
    await waitFor(() => expect(body.queryByRole("dialog", { name: "AIで下書きを作る" })).not.toBeInTheDocument());
    // 下書きを作っただけでは、保存処理は呼ばれない。
    await expect(readRemoteCalls(canvasElement).map((call) => call.name)).toEqual(["suggestShiftSetup"]);

    await userEvent.click(within(await getPendingBar(canvasElement)).getByRole("button", { name: "保存する" }));
    await waitFor(() =>
      expect(readRemoteCalls(canvasElement).map((call) => call.name)).toEqual([
        "suggestShiftSetup",
        "saveDayTemplates",
      ]),
    );
    const templates = readRemoteCalls(canvasElement)[1].args as Array<{ id?: string; name: string }>;
    await expect(templates.map((template) => [template.id, template.name])).toEqual([
      [undefined, "平日"],
      [undefined, "週末"],
    ]);
  },
};

export const AssistRateLimitedBehavior: Story = {
  name: "Behavior: AIの下書きを続けて作れないときは、次にできることを伝える",
  args: { assistResult: { status: "rateLimited" } },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "AIで下書きを作る" }));
    const dialog = await body.findByRole("dialog", { name: "AIで下書きを作る" });
    const situation = within(dialog).getByRole("textbox", { name: "店の状況" });
    await userEvent.type(situation, "土日は夜が忙しいです");
    await userEvent.click(within(dialog).getByRole("button", { name: "下書きを作る" }));

    await expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "少し時間をおいて、もう一度お試しください。",
    );
    // 入力した文章といまの型は、そのまま残る。
    await expect(situation).toHaveValue("土日は夜が忙しいです");
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(canvas.getByRole("group", { name: "土日" })).toBeVisible());
    await expect(canvas.queryByRole("region", { name: "保存していない変更" })).not.toBeInTheDocument();
  },
};

export const PositionAddLimitBehavior: Story = {
  name: "Behavior: ポジションを足すと、10件で追加できなくなる",
  args: { setup: ninePositionsSetup },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = within(canvas.getByRole("region", { name: "ポジション" }));
    await userEvent.click(section.getByRole("button", { name: "編集する" }));
    const dialog = within(await body.findByRole("dialog", { name: "ポジションを編集" }));

    const addButton = dialog.getByRole("button", { name: "ポジションを追加" });
    await expect(dialog.getByRole("button", { name: "ホールを削除" })).toBeDisabled();
    await userEvent.click(addButton);
    await expect(addButton).toBeDisabled();
    await expect(dialog.getByText("ポジションは10件まで登録できます")).toBeVisible();

    // 名前を入れずに保存すると、その行に誤りが出て保存されない。
    await userEvent.click(dialog.getByRole("button", { name: "保存する" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("ポジション名を入力してください");
    await expect(readRemoteCalls(canvasElement)).toEqual([]);

    await userEvent.type(dialog.getByRole("textbox", { name: "ポジション10の名前" }), "デリバリー");
    await userEvent.click(dialog.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(readRemoteCalls(canvasElement)).toHaveLength(1));
    const saved = readRemoteCalls(canvasElement)[0].args as Array<{ id?: string; name: string; color: string }>;
    await expect(saved).toHaveLength(10);
    // 足したポジションはidを持たず、まだ使っていない色が入る。
    await expect(saved[9]).toEqual({ name: "デリバリー", color: "#0e7490" });
    await expect(await section.findByText("デリバリー")).toBeVisible();
  },
};

const changeStaffProfilesAndSave: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const sato = within(canvas.getByRole("group", { name: "佐藤 花子" }));
  const suzuki = within(canvas.getByRole("group", { name: "鈴木 次郎" }));

  // 佐藤: キッチンとレジを外す。最後に残ったホールは外せない。
  await userEvent.click(sato.getByRole("button", { name: "キッチン" }));
  await userEvent.click(sato.getByRole("button", { name: "レジ" }));
  await userEvent.click(sato.getByRole("button", { name: "ホール" }));
  await expect(sato.getByRole("button", { name: "ホール" })).toHaveAttribute("aria-pressed", "true");
  await expect(sato.getByRole("button", { name: "キッチン" })).toHaveAttribute("aria-pressed", "false");

  // 鈴木: 外していたキッチンを入れ直し、新人にする。
  await userEvent.click(suzuki.getByRole("button", { name: "キッチン" }));
  await userEvent.click(suzuki.getByRole("radio", { name: "新人" }));
  await expect(suzuki.getByRole("radio", { name: "新人" })).toBeChecked();

  const bar = await getPendingBar(canvasElement);
  await expect(bar).toHaveTextContent("スタッフの変更を保存していません");
  await userEvent.click(within(bar).getByRole("button", { name: "保存する" }));

  await waitFor(() => expect(readRemoteCalls(canvasElement)).toHaveLength(1));
  // 変えた2人だけを、外したポジションと熟練度で保存する。
  await expect(readRemoteCalls(canvasElement)).toEqual([
    {
      name: "saveStaffShiftProfiles",
      args: [
        { staffId: "staff-1", unavailablePositionIds: [kitchenId, registerId], skillLevel: "lead" },
        { staffId: "staff-2", unavailablePositionIds: [], skillLevel: "newcomer" },
      ],
    },
  ]);
  await waitFor(() => expect(canvas.queryByRole("region", { name: "保存していない変更" })).not.toBeInTheDocument());
};

export const StaffProfileBehavior: Story = {
  name: "Behavior: スタッフのポジションを外して保存する",
  parameters: { screenshot: { skip: true } },
  play: changeStaffProfilesAndSave,
};

export const MobileStaffProfileBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでもスタッフのポジションを外して保存する",
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    const sato = within(within(context.canvasElement).getByRole("group", { name: "佐藤 花子" }));
    // スマートフォンでは、スタッフごとのカードの中に項目名を出す。
    await expect(sato.getByText("入れるポジション")).toBeVisible();
    await expect(sato.getByText("熟練度")).toBeVisible();
    await changeStaffProfilesAndSave(context);
  },
};

export const BreakRuleRemoveBehavior: Story = {
  name: "Behavior: 休憩の決まりをなくす",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = within(canvas.getByRole("region", { name: "休憩の決まり" }));
    await expect(section.getByText("6時間以上の勤務に45分の休憩")).toBeVisible();
    await userEvent.click(section.getByRole("button", { name: "編集する" }));
    const dialog = within(await body.findByRole("dialog", { name: "休憩の決まりを編集" }));

    await userEvent.click(dialog.getByRole("radio", { name: "決まりなし" }));
    await userEvent.click(dialog.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(readRemoteCalls(canvasElement)).toEqual([{ name: "saveBreakRule", args: null }]));
    await expect(await section.findByText("決まりなし")).toBeVisible();
  },
};

export const ReadOnlyBehavior: Story = {
  name: "Behavior: 閲覧専用では編集操作が無効になる",
  args: ReadOnly.args,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const weekday = within(canvas.getByRole("group", { name: "平日" }));
    const cell = weekday.getByRole("group", { name: "09:00〜14:00 ホールの必要人数" });

    await expect(within(cell).getByRole("button", { name: "1人増やす" })).toBeDisabled();
    await expect(weekday.getByRole("button", { name: "月曜日" })).toBeDisabled();
    await expect(weekday.getByRole("textbox", { name: "型の名前" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "型を追加" })).toBeDisabled();
    await expect(
      within(canvas.getByRole("group", { name: "佐藤 花子" })).getByRole("button", { name: "キッチン" }),
    ).toBeDisabled();
    for (const editButton of canvas.getAllByRole("button", { name: "編集する" })) {
      await expect(editButton).toBeDisabled();
    }
    await expect(canvas.queryByRole("button", { name: "AIで下書きを作る" })).not.toBeInTheDocument();
  },
};
