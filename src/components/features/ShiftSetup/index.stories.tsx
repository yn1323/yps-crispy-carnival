import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { buildRandomShiftSetupDraft } from "@/convex/shiftSetup/assistDraft";
import { Toaster } from "@/src/components/ui/toaster";
import { createDeferred } from "@/src/devtools/createDeferred";
import { ShiftSetupSkeleton, ShiftSetupView } from ".";
import type { LeaveDialogState, ShiftSetupAssistResult, ShiftSetupData, ShiftSetupRemote } from "./types";
import { useShiftSetupEditor } from "./useShiftSetupEditor";

const hallId = "position-hall" as Id<"positions">;
const kitchenId = "position-kitchen" as Id<"positions">;
const registerId = "position-register" as Id<"positions">;

const positions: ShiftSetupData["positions"] = [
  { _id: hallId, name: "ホール", color: "#60a5fa", isDefault: true },
  { _id: kitchenId, name: "キッチン", color: "#fb923c", isDefault: false },
  { _id: registerId, name: "レジ", color: "#a78bfa", isDefault: false },
];

const staffNames = ["佐藤 花子", "鈴木 次郎", "高橋 美咲", "田中 太郎", "伊藤 さくら", "渡辺 健"];
const staffs: ShiftSetupData["staffs"] = staffNames.map((name, index) => ({
  _id: `staff-${index + 1}` as Id<"staffs">,
  name,
  // 佐藤はホールのリーダー、鈴木はキッチンが担当外、伊藤はホールとキッチンの見習い。ほかは全員、全ポジションが一人前。
  positionSkills:
    index === 0
      ? [{ positionId: hallId, level: "lead" }]
      : index === 1
        ? [{ positionId: kitchenId, level: "unavailable" }]
        : index === 4
          ? [
              { positionId: hallId, level: "newcomer" },
              { positionId: kitchenId, level: "newcomer" },
            ]
          : [],
}));

const weekdayTemplateId = "template-weekday" as Id<"shiftDayTemplates">;
const weekendTemplateId = "template-weekend" as Id<"shiftDayTemplates">;
const holidayTemplateId = "template-holiday" as Id<"shiftDayTemplates">;

type TemplateRequirements = ShiftSetupData["dayTemplates"][number]["requirements"];
type TimeBar = Extract<TemplateRequirements, { kind: "time" }>["bars"][number];

const bar = (positionId: Id<"positions">, startTime: string, endTime: string): TimeBar => ({
  positionId,
  startTime,
  endTime,
});

// 昼と夜に人を増やす1日。保存の形は、1本が1人分のバーで、重なった本数がその時間の人数になる。
const weekdayBars: TimeBar[] = [
  bar(hallId, "09:00", "22:00"),
  bar(hallId, "11:00", "14:00"),
  bar(hallId, "11:00", "14:00"),
  bar(hallId, "17:00", "22:00"),
  bar(hallId, "17:00", "22:00"),
  bar(hallId, "18:00", "22:00"),
  bar(hallId, "18:00", "22:00"),
  bar(kitchenId, "09:00", "22:00"),
  bar(kitchenId, "11:00", "14:00"),
  bar(kitchenId, "18:00", "21:00"),
  bar(registerId, "10:00", "20:00"),
];

const timeSetup: ShiftSetupData = {
  shopName: "スーパー美味しいカフェ新宿店",
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  regularClosedDays: ["wed"],
  canWriteBusinessData: true,
  businessWriteBlockReason: null,
  positions,
  dayTemplates: [
    {
      _id: weekdayTemplateId,
      name: "通常",
      weekdays: ["mon", "tue", "thu", "fri"],
      appliesToHolidays: false,
      requirements: { kind: "time", bars: weekdayBars },
      requiresReentry: false,
    },
    {
      _id: weekendTemplateId,
      name: "土日",
      weekdays: ["sat", "sun"],
      appliesToHolidays: false,
      requirements: {
        kind: "time",
        bars: [
          bar(hallId, "09:00", "22:00"),
          bar(hallId, "09:00", "22:00"),
          bar(hallId, "11:00", "15:00"),
          bar(hallId, "17:00", "22:00"),
          bar(kitchenId, "09:00", "22:00"),
          bar(kitchenId, "11:00", "21:00"),
          bar(registerId, "10:00", "20:00"),
          bar(registerId, "11:00", "15:00"),
        ],
      },
      requiresReentry: false,
    },
    {
      _id: holidayTemplateId,
      name: "祝日",
      weekdays: [],
      appliesToHolidays: true,
      requirements: {
        kind: "time",
        bars: [bar(hallId, "10:00", "20:00"), bar(hallId, "11:00", "15:00"), bar(kitchenId, "10:00", "20:00")],
      },
      requiresReentry: false,
    },
  ],
  breakRule: { minWorkMinutes: 360, breakMinutes: 45 },
  staffs,
  assistAvailable: true,
};

const notConfiguredSetup: ShiftSetupData = {
  ...timeSetup,
  positions: [{ _id: hallId, name: "ホール", color: "#60a5fa", isDefault: true }],
  dayTemplates: [],
  breakRule: null,
  // ポジションが1件の店舗。伊藤だけが見習い。
  staffs: staffs.map((staff, index) => ({
    ...staff,
    positionSkills: index === 4 ? [{ positionId: hallId, level: "newcomer" as const }] : [],
  })),
};

/** ポジションをまだ追加していない店舗。店舗を作ったときにできる、仮の名前「シフト」のポジションだけを持つ。 */
const unsplitSetup: ShiftSetupData = {
  ...notConfiguredSetup,
  positions: [{ _id: hallId, name: "シフト", color: "#60a5fa", isDefault: true }],
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
      _id: weekdayTemplateId,
      name: "通常",
      weekdays: ["mon", "tue", "thu", "fri"],
      appliesToHolidays: false,
      requirements: {
        kind: "shiftType",
        options: [
          {
            optionId: "early",
            counts: [
              { positionId: hallId, count: 2 },
              { positionId: kitchenId, count: 1 },
            ],
          },
          { optionId: "late", counts: [{ positionId: hallId, count: 3 }] },
        ],
      },
      requiresReentry: false,
    },
    {
      _id: weekendTemplateId,
      name: "土日",
      weekdays: ["sat", "sun"],
      appliesToHolidays: true,
      requirements: {
        kind: "shiftType",
        options: [{ optionId: "early", counts: [{ positionId: hallId, count: 3 }] }],
      },
      requiresReentry: false,
    },
  ],
};

const dateOnlySetup: ShiftSetupData = {
  ...timeSetup,
  submissionPattern: { kind: "dateOnly" },
  dayTemplates: [
    {
      _id: weekdayTemplateId,
      name: "通常",
      weekdays: ["mon", "tue", "thu", "fri"],
      appliesToHolidays: false,
      requirements: {
        kind: "dateOnly",
        counts: [
          { positionId: hallId, count: 4 },
          { positionId: kitchenId, count: 2 },
        ],
      },
      requiresReentry: false,
    },
  ],
};

// 受付時間を9:00〜22:00へ短くしたあとに残る、範囲の外の人数。完全に外の時間と、端をまたぐ時間がある。
const outsideRangeSetup: ShiftSetupData = {
  ...timeSetup,
  dayTemplates: [
    {
      ...timeSetup.dayTemplates[0],
      requirements: {
        kind: "time",
        bars: [
          bar(hallId, "07:00", "09:00"),
          bar(hallId, "08:00", "12:00"),
          bar(kitchenId, "11:00", "14:00"),
          bar(kitchenId, "18:00", "23:00"),
        ],
      },
    },
  ],
};

// 希望シフトの集め方を時間指定から日付選択へ変えた直後。保存済みのテンプレートは、空の必要人数で返る。
const requiresReentrySetup: ShiftSetupData = {
  ...dateOnlySetup,
  dayTemplates: timeSetup.dayTemplates.map((template) => ({
    ...template,
    requirements: { kind: "dateOnly", counts: [] },
    requiresReentry: true,
  })),
};

const paletteForLongText = ["#60a5fa", "#fb923c", "#a78bfa", "#f472b6", "#eda40a", "#14b8a6", "#f87171", "#94a3b8"];
const longTextPositions: ShiftSetupData["positions"] = [
  { _id: hallId, name: "ホール接客と案内とお会計の担当スタッフ", color: paletteForLongText[0], isDefault: true },
  ...paletteForLongText.slice(1).map((color, index) => ({
    _id: `position-long-${index}` as Id<"positions">,
    name: index % 2 === 0 ? `仕込みと盛り付けと洗い場の担当${index + 1}` : `ドリンク${index + 1}`,
    color,
    isDefault: false,
  })),
];

// 長い名前、ポジション8件、テンプレートは上限の20件。
const longTextSetup: ShiftSetupData = {
  ...timeSetup,
  shopName: "駅前商業施設フードコート内スーパー美味しいカフェ新宿中央東口店",
  positions: longTextPositions,
  dayTemplates: [
    {
      _id: weekdayTemplateId,
      name: "祝日を除く月曜から金曜までの通常営業日",
      weekdays: ["mon", "tue", "thu", "fri"],
      appliesToHolidays: false,
      requirements: {
        kind: "time",
        bars: longTextPositions.flatMap((position, index) => [
          bar(position._id, "09:00", "22:00"),
          ...(index % 2 === 0 ? [bar(position._id, "11:00", "14:00"), bar(position._id, "17:30", "21:00")] : []),
        ]),
      },
      requiresReentry: false,
    },
    ...Array.from({ length: 19 }, (_, index): ShiftSetupData["dayTemplates"][number] => ({
      _id: `template-long-${index}` as Id<"shiftDayTemplates">,
      name: index === 0 ? "年末年始と大型連休の特別営業日" : `イベント${index}`,
      weekdays: index === 1 ? ["sat", "sun"] : [],
      appliesToHolidays: index === 0,
      requirements: { kind: "time", bars: [bar(hallId, "10:00", "20:00")] },
      requiresReentry: false,
    })),
  ],
  staffs: staffs.map((staff, index) => ({
    ...staff,
    name: index === 0 ? "とても長い氏名を持つ管理者ユーザー田中太郎左衛門" : staff.name,
    positionSkills: [],
  })),
};

const ninePositionsSetup: ShiftSetupData = {
  ...notConfiguredSetup,
  positions: [
    { _id: hallId, name: "ホール", color: "#60a5fa", isDefault: true },
    ...["#fb923c", "#a78bfa", "#f472b6", "#eda40a", "#14b8a6", "#f87171", "#94a3b8", "#78bd14"].map((color, index) => ({
      _id: `position-${index + 2}` as Id<"positions">,
      name: `ポジション${index + 2}`,
      color,
      isDefault: false,
    })),
  ],
};

// ポジションは上限の10件、スタッフは50人。長い名前のポジションを1件含む。印はまばらに付いている。
const manyPositionNames = [
  "ホール",
  "キッチン",
  "レジ",
  "ドリンク",
  "洗い場",
  "デリバリー",
  "品出し",
  "仕込み",
  "清掃",
  "案内とお会計の応援",
];
// 10件のポジションに、用意した10色を1つずつ当てる。
const manyPositionColors = [
  "#60a5fa",
  "#fb923c",
  "#a78bfa",
  "#f472b6",
  "#eda40a",
  "#14b8a6",
  "#f87171",
  "#94a3b8",
  "#78bd14",
  "#06b6d4",
];
const manyPositions: ShiftSetupData["positions"] = manyPositionNames.map((name, index) => ({
  _id: positions[index]?._id ?? (`position-many-${index}` as Id<"positions">),
  name,
  color: manyPositionColors[index % manyPositionColors.length],
  isDefault: index === 0,
}));
const manyFamilyNames = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤"];
const manyGivenNames = ["花子", "次郎", "美咲", "太郎", "さくら"];
const manyStaffsSetup: ShiftSetupData = {
  ...timeSetup,
  positions: manyPositions,
  staffs: Array.from({ length: 50 }, (_, index) => ({
    _id: `staff-many-${index + 1}` as Id<"staffs">,
    name: `${manyFamilyNames[index % 10]} ${manyGivenNames[Math.floor(index / 10)]}`,
    positionSkills: manyPositions.flatMap((position, positionIndex) => {
      const seed = (index * 7 + positionIndex * 3) % 23;
      const level = seed === 0 ? "lead" : seed === 5 ? "newcomer" : seed === 11 || seed === 17 ? "unavailable" : null;
      return level ? [{ positionId: position._id, level } as const] : [];
    }),
  })),
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
      // 本物の保存と同じく、足したポジションのIDを作り、入力と同じ順で返す。
      const ids = inputs.map((input, index) => input.id ?? (`position-added-${index}` as Id<"positions">));
      setSetup((current) => ({
        ...current,
        positions: inputs.map((input, index) => ({
          _id: ids[index],
          name: input.name,
          color: input.color,
          isDefault: current.positions.some((position) => position._id === input.id && position.isDefault),
        })),
      }));
      return ids;
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
          name: input.name.trim(),
          weekdays: input.weekdays,
          appliesToHolidays: input.appliesToHolidays,
          requirements: input.requirements,
          requiresReentry: false,
        })),
      }));
    },
    saveStaffShiftProfiles: async (profiles) => {
      record("saveStaffShiftProfiles", profiles);
      setSetup((current) => ({
        ...current,
        staffs: current.staffs.map((staff) => {
          const profile = profiles.find((candidate) => candidate.staffId === staff._id);
          return profile ? { ...staff, positionSkills: profile.positionSkills } : staff;
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
      <Box bg="gray.50" minH="100vh" p={4}>
        {/* 全体の撮影はスクロールしながら継ぎ合わせる。上端に留める行は、撮影の瞬間で位置が変わるため、撮影中だけ留めない。 */}
        <style>{'html[data-vrt="true"] [data-sticky-row] { position: static !important; }'}</style>
        <Story />
        <Toaster />
      </Box>
    ),
  ],
  parameters: { layout: "fullscreen" },
  args: { setup: timeSetup },
} satisfies Meta<typeof ShiftSetupStory>;

export default meta;
type Story = StoryObj<typeof meta>;

// tagはStorybookが静的に読むため、Storyごとに直接書く。スプレッドで渡したtagは読まれない。
const mobile1Globals = { viewport: { value: "mobile1", isRotated: false } };

// tagはStorybookが静的に読むため、Storyごとに直接書く。スプレッドで渡したtagは読まれない。
const mobile2Globals = { viewport: { value: "mobile2", isRotated: false } };

function readRemoteCalls(canvasElement: HTMLElement): RemoteCall[] {
  return JSON.parse(within(canvasElement).getByTestId("remote-calls").textContent ?? "[]");
}

/** 見出しの行にある、保存の操作。 */
function getSaveActions(canvasElement: HTMLElement) {
  return within(within(canvasElement).getByRole("group", { name: "変更の保存" }));
}

/** 保存していない変更があり、「保存する」を押せることを確かめる。 */
async function expectPendingChanges(canvasElement: HTMLElement) {
  const actions = getSaveActions(canvasElement);
  await waitFor(() => expect(actions.getByRole("button", { name: "保存する" })).toBeEnabled());
}

/** 保存していない変更がなく、「保存する」が同じ位置で押せない状態になっていることを確かめる。 */
async function expectNoPendingChanges(canvasElement: HTMLElement) {
  const actions = getSaveActions(canvasElement);
  await waitFor(async () => {
    const saveButton = actions.getByRole("button", { name: "保存する" });
    await expect(saveButton).toBeDisabled();
    // 保存の応答を待つ間も押せないため、保存が終わったことも確かめる。
    await expect(saveButton).not.toHaveAttribute("data-loading");
  });
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

export const OutsideRange: Story = {
  name: "受付時間の外に人数が残っている",
  args: { setup: outsideRangeSetup },
};

export const RequiresReentry: Story = {
  name: "集め方を変えたあと・再設定が必要",
  args: { setup: requiresReentrySetup },
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
  name: "長い名前・ポジション8件・テンプレート20件",
  args: { setup: longTextSetup },
};

export const NoStaffs: Story = {
  name: "スタッフ0人",
  args: { setup: { ...timeSetup, staffs: [] } },
};

export const Loading: Story = {
  render: () => <ShiftSetupSkeleton />,
};

// ---- 操作の補助 ----

type Canvas = ReturnType<typeof within>;

/** カードの上に並ぶテンプレートの一覧。PCでもスマートフォンでも同じ並びで出す。 */
function getTemplateList(canvas: Canvas) {
  return within(canvas.getByRole("list", { name: "テンプレートの一覧" }));
}

/** 編集するテンプレートを切り替える。一覧では、誤りや再設定の印も名前に含めて読み上げる。 */
async function selectTemplate(canvas: Canvas, name: string, usage: string, status?: "要確認" | "再設定") {
  await userEvent.click(
    getTemplateList(canvas).getByRole("button", { name: [name, usage, ...(status ? [status] : [])].join(" ") }),
  );
  return within(await canvas.findByRole("group", { name }));
}

/**
 * 「時間を選んで入れる」から、開始・終了・人数を選んで入れる。PCとスマートフォンで同じ操作になる。
 * 人数を選ぶ欄は、PCでは帯の近くの吹き出し、スマートフォンでは帯のすぐ下に出る。
 */
async function setCountByForm(
  canvasElement: HTMLElement,
  positionName: string,
  input: { start: string; end: string; count: number },
) {
  const body = within(canvasElement.ownerDocument.body);
  const band = within(await within(canvasElement).findByRole("group", { name: `${positionName}の必要人数` }));
  await userEvent.click(band.getByRole("button", { name: "時間を選んで入れる" }));
  const form = within(await body.findByLabelText(`${positionName}の必要人数を入れる`));
  await userEvent.selectOptions(form.getByRole("combobox", { name: "開始" }), input.start);
  await userEvent.selectOptions(form.getByRole("combobox", { name: "終了" }), input.end);
  await userEvent.click(form.getByRole("button", { name: `${input.count}人` }));
  await waitFor(() => expect(body.queryByLabelText(`${positionName}の必要人数を入れる`)).not.toBeInTheDocument());
}

/** スタッフとポジションの組み合わせのマス。PCは表の中、スマートフォンはスタッフごとのまとまりの中にある。 */
function getStaffLevelCell(canvas: Canvas, staff: string, position: string) {
  return canvas.getByRole("button", { name: new RegExp(`^${staff} ${position} `) });
}

/** スタッフのマスを1回押し、値が`expectedLevel`へ切り替わることを確かめる。 */
async function pressStaffLevelCell(canvas: Canvas, staff: string, position: string, expectedLevel: string) {
  const cell = getStaffLevelCell(canvas, staff, position);
  await userEvent.click(cell);
  await waitFor(() => expect(cell).toHaveAccessibleName(`${staff} ${position} ${expectedLevel}`));
}

async function saveChanges(canvasElement: HTMLElement) {
  const saveButton = getSaveActions(canvasElement).getByRole("button", { name: "保存する" });
  await waitFor(() => expect(saveButton).toBeEnabled());
  await userEvent.click(saveButton);
}

type SavedTemplate = {
  id?: string;
  name: string;
  weekdays: string[];
  appliesToHolidays: boolean;
  requirements: TemplateRequirements;
};

/** 保存の呼び出しのうち、必要人数の保存だけを、呼び出した順に返す。 */
function readSavedTemplates(canvasElement: HTMLElement): SavedTemplate[][] {
  return readRemoteCalls(canvasElement)
    .filter((call) => call.name === "saveDayTemplates")
    .map((call) => call.args as SavedTemplate[]);
}

/** ポジションの帯に並ぶ区間の名前を、左から順に返す。空いた時間（0人）も含む。 */
function getRequiredCounts(canvas: Canvas, positionName: string) {
  const band: HTMLElement = canvas.getByRole("group", { name: `${positionName}の必要人数` });
  return Array.from(band.querySelectorAll("[data-band-span]")).map((span) => span.getAttribute("aria-label"));
}

// ---- 見た目: 操作のあとの状態 ----

export const PendingChanges: Story = {
  name: "保存していない変更あり",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(within(canvas.getByRole("group", { name: "通常" })).getByRole("button", { name: "日曜日" }));
    await pressStaffLevelCell(canvas, "高橋 美咲", "レジ", "見習い");
    await expectPendingChanges(canvasElement);
  },
};

const createFirstTemplate: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "テンプレートを作る" }));

  const template = within(await canvas.findByRole("group", { name: "通常" }));
  // 定休日の水曜を除く営業日が、最初から選ばれている。
  await expect(template.getByRole("button", { name: "月曜日" })).toHaveAttribute("aria-pressed", "true");
  await expect(template.getByRole("button", { name: "水曜日・定休日" })).toHaveAttribute("aria-pressed", "false");
  await expect(template.getByRole("button", { name: "祝日" })).toHaveAttribute("aria-pressed", "false");
  // テンプレートが1つだけのときは、コピー元がないのでコピーの操作を出さない。
  await expect(template.queryByRole("button", { name: "コピーする" })).not.toBeInTheDocument();
  // 作ったテンプレートが、一覧で選ばれている。
  await expect(getTemplateList(canvas).getByRole("button", { name: /^通常 / })).toHaveAttribute("aria-current", "true");
  // 作ったテンプレートのテンプレート名の欄へ移り、初期値をそのまま打ち替えられる。
  const name = template.getByRole("textbox", { name: "テンプレート名" });
  await waitFor(() => expect(name).toHaveFocus());
  // まだ何も入れていない間は、保存の帯を出さない。
  await expectNoPendingChanges(canvasElement);
  await expect(readRemoteCalls(canvasElement)).toEqual([]);
};

export const FirstTemplateCreated: Story = {
  name: "最初のテンプレートを作った直後",
  args: { setup: { ...notConfiguredSetup, positions } },
  play: createFirstTemplate,
};

export const CopyDialog: Story = {
  name: "コピーする",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "コピーする" }));
    const dialog = await body.findByRole("dialog", { name: "別テンプレートの人員設定をコピーする" });
    await waitFor(() => expect(dialog).toBeVisible());
  },
};

export const RemoveDialog: Story = {
  name: "テンプレートの削除の確認",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "削除する" }));
    const dialog = await body.findByRole("alertdialog", { name: "テンプレートを削除" });
    await waitFor(() => expect(dialog).toBeVisible());
  },
};

export const PositionsDialog: Story = {
  name: "ポジションの編集",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = within(canvas.getByRole("region", { name: "ポジション" }));
    await userEvent.click(section.getByRole("button", { name: "ポジションを編集する" }));
    const dialog = await body.findByRole("dialog", { name: "ポジションを編集" });
    await userEvent.click(within(dialog).getByRole("button", { name: "キッチンの色を変更" }));
    await waitFor(() => expect(within(dialog).getByRole("group", { name: "キッチンの色" })).toBeVisible());
  },
};

export const AssistDialog: Story = {
  name: "AIサポート・テンプレートがある場合",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "AIで下書きを作る" }));
    const dialog = await body.findByRole("dialog", { name: "AIで下書きを作る" });
    await waitFor(() => expect(dialog).toBeVisible());
  },
};

export const ManyPositionsAndStaffs: Story = {
  name: "ポジション10件・スタッフ50人",
  args: { setup: manyStaffsSetup },
};

/** スタッフのスキルの見出しの右から、スキルの役割を開く。 */
async function openSkillLegend(canvasElement: HTMLElement) {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(within(canvasElement).getByRole("button", { name: "スキルの役割" }));
  const dialog = await body.findByRole("dialog", { name: "スキルの役割" });
  await waitFor(() => expect(dialog).toBeVisible());
  return dialog;
}

export const SkillLegendDialog: Story = {
  name: "スキルの役割",
  play: async ({ canvasElement }) => {
    await openSkillLegend(canvasElement);
  },
};

export const LeaveConfirmation: Story = {
  name: "離脱の確認",
  args: { leaveDialog: { ...closedLeaveDialog, isOpen: true } },
};

export const Mobile: Story = { tags: ["vrt-mobile1"], globals: mobile1Globals, name: "モバイル320px・設定済み" };

export const MobileNotConfigured: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "モバイル320px・未設定",
  args: { setup: notConfiguredSetup },
};

export const MobileShiftType: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "モバイル414px・パターン選択",
  args: { setup: shiftTypeSetup },
};

export const MobileDateOnly: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "モバイル414px・日付選択",
  args: { setup: dateOnlySetup },
};

export const MobileOutsideRange: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "モバイル414px・受付時間の外に人数が残っている",
  args: { setup: outsideRangeSetup },
};

export const MobileRequiresReentry: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "モバイル320px・再設定が必要",
  args: { setup: requiresReentrySetup },
};

export const MobileLongText: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "モバイル320px・長い名前",
  args: { setup: longTextSetup },
};

export const MobileReadOnly: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "モバイル414px・閲覧専用",
  args: ReadOnly.args,
};

export const MobileManyPositions: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "モバイル320px・ポジション10件",
  args: { setup: { ...manyStaffsSetup, staffs: manyStaffsSetup.staffs.slice(0, 8) } },
};

export const MobilePendingChanges: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "モバイル320px・保存していない変更あり",
  play: PendingChanges.play,
};

export const MobileFirstTemplateCreated: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "モバイル320px・最初のテンプレートを作った直後",
  args: FirstTemplateCreated.args,
  play: createFirstTemplate,
};

// Dialogを開いたスマートフォンのStoryは、画面に見えている範囲だけを撮る。
// 全体の撮影は、ページを1画面ずつスクロールして継ぎ合わせる。Dialogは画面に固定されているため、
// スクロールのたびに描き直され、角の丸い枠のふちが1階調だけ違う2通りの画になり、撮影が安定しない。
const MOBILE_DIALOG_SCREENSHOT = { screenshot: { fullPage: false } };

export const MobilePositionsDialog: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "モバイル320px・ポジションの編集",
  parameters: MOBILE_DIALOG_SCREENSHOT,
  play: PositionsDialog.play,
};

export const MobileAssistDialog: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "モバイル320px・AIサポート",
  parameters: MOBILE_DIALOG_SCREENSHOT,
  play: AssistDialog.play,
};

export const MobileSkillLegendDialog: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "モバイル320px・スキルの役割",
  parameters: MOBILE_DIALOG_SCREENSHOT,
  play: SkillLegendDialog.play,
};

export const MobileCopyDialog: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "モバイル320px・コピーする",
  parameters: MOBILE_DIALOG_SCREENSHOT,
  play: CopyDialog.play,
};

// ---- Behavior: テンプレートの切り替えと追加 ----

const switchTemplates: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);

  // 「通常」の名前を変えてから別のテンプレートへ移り、戻っても、変えた名前が残っている。
  // 名前の欄は、入ったときに全体が選ばれるため、消さずにそのまま打ち替えられる。
  const weekday = within(canvas.getByRole("group", { name: "通常" }));
  await userEvent.type(weekday.getByRole("textbox", { name: "テンプレート名" }), "通常の日");
  const weekend = await selectTemplate(canvas, "土日", "土・日");
  await expect(weekend.getByRole("textbox", { name: "テンプレート名" })).toHaveValue("土日");
  await expect(weekend.getByRole("button", { name: "土曜日" })).toHaveAttribute("aria-pressed", "true");
  await expect(canvas.queryByRole("group", { name: "通常の日" })).not.toBeInTheDocument();

  const renamed = await selectTemplate(canvas, "通常の日", "月・火・木・金");
  await expect(renamed.getByRole("textbox", { name: "テンプレート名" })).toHaveValue("通常の日");

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
  await expect(readSavedTemplates(canvasElement)[0].map((template) => [template.id, template.name])).toEqual([
    [weekdayTemplateId, "通常の日"],
    [weekendTemplateId, "土日"],
    [holidayTemplateId, "祝日"],
  ]);
};

export const SwitchTemplateBehavior: Story = {
  name: "Behavior: テンプレートを切り替えても下書きが残る",
  parameters: { screenshot: { skip: true } },
  play: switchTemplates,
};

export const MobileSwitchTemplateBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでも一覧からテンプレートを切り替えられる",
  parameters: { screenshot: { skip: true } },
  play: switchTemplates,
};

export const MobileSingleTemplateBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでも一覧の最後からテンプレートを足せ、足したテンプレートが選ばれる",
  args: { setup: dateOnlySetup },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = getTemplateList(canvas);
    await expect(list.getByRole("button", { name: "通常 月・火・木・金" })).toHaveAttribute("aria-current", "true");
    // 「テンプレートを追加」は、一覧の最後に置く。
    const buttons = list.getAllByRole("button");
    await expect(buttons.at(-1)).toHaveAccessibleName("テンプレートを追加");

    await userEvent.click(list.getByRole("button", { name: "テンプレートを追加" }));

    // 足したテンプレートが開き、一覧でも選ばれる。
    await expect(await canvas.findByRole("group", { name: "テンプレート2" })).toBeVisible();
    await expect(list.getByRole("button", { name: "テンプレート2 土・日" })).toHaveAttribute("aria-current", "true");
    await expect(list.getByRole("button", { name: "通常 月・火・木・金" })).not.toHaveAttribute("aria-current");
  },
};

const addTemplate: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "テンプレートを追加" }));

  // 足したテンプレートがそのまま開く。曜日はすべて別のテンプレートか定休日なので、曜日も祝日も選ばれていない。
  const added = within(await canvas.findByRole("group", { name: "テンプレート4" }));
  await expect(added.getByRole("button", { name: "月曜日" })).toHaveAttribute("aria-pressed", "false");
  await expect(added.getByRole("button", { name: "祝日" })).toHaveAttribute("aria-pressed", "false");

  // 足しただけでは保存の帯を出さない。名前の欄へ移り、初期値を選んだ状態になる。
  await expectNoPendingChanges(canvasElement);
  const name = added.getByRole<HTMLInputElement>("textbox", { name: "テンプレート名" });
  await waitFor(() => expect(name).toHaveFocus());
  await expect([name.selectionStart, name.selectionEnd]).toEqual([0, "テンプレート4".length]);

  // 初期値を消さずに、そのまま打ち替えられる。名前を入れると、保存の帯が出る。
  await userEvent.keyboard("年末年始");
  const renamed = within(await canvas.findByRole("group", { name: "年末年始" }));
  await expectPendingChanges(canvasElement);
  await userEvent.click(renamed.getByRole("button", { name: "水曜日・定休日" }));

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
  // 足したテンプレートはidを持たず、空の必要人数で保存される。
  await expect(readSavedTemplates(canvasElement)[0].at(-1)).toEqual({
    name: "年末年始",
    weekdays: ["wed"],
    appliesToHolidays: false,
    requirements: { kind: "time", bars: [] },
  });
  await expect(readSavedTemplates(canvasElement)[0]).toHaveLength(4);
  // 保存したあとも、足したテンプレートを開いたままにする。
  await expect(await canvas.findByRole("group", { name: "年末年始" })).toBeVisible();
};

export const AddTemplateBehavior: Story = {
  name: "Behavior: テンプレートを足して保存する",
  parameters: { screenshot: { skip: true } },
  play: addTemplate,
};

export const MobileAddTemplateBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでもテンプレートを足して保存する",
  parameters: { screenshot: { skip: true } },
  play: addTemplate,
};

const createFirstTemplateAndSave: Story["play"] = async (context) => {
  const { canvasElement } = context;
  const canvas = within(canvasElement);
  await createFirstTemplate(context);

  // 使う日を変えると、1行の保存の帯が出る。
  const template = within(canvas.getByRole("group", { name: "通常" }));
  await userEvent.click(template.getByRole("button", { name: "祝日" }));
  await expectPendingChanges(canvasElement);
  // 作ったときの値へ戻すと、帯は消える。
  await userEvent.click(template.getByRole("button", { name: "祝日" }));
  await expectNoPendingChanges(canvasElement);

  await userEvent.click(template.getByRole("button", { name: "祝日" }));
  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
  await expect(readSavedTemplates(canvasElement)[0]).toEqual([
    {
      name: "通常",
      weekdays: ["sun", "mon", "tue", "thu", "fri", "sat"],
      appliesToHolidays: true,
      requirements: { kind: "time", bars: [] },
    },
  ]);
  await expectNoPendingChanges(canvasElement);
};

export const CreateFirstTemplateBehavior: Story = {
  name: "Behavior: 最初のテンプレートを作った直後は帯を出さず、何か入れると帯が出て保存できる",
  args: FirstTemplateCreated.args,
  parameters: { screenshot: { skip: true } },
  play: createFirstTemplateAndSave,
};

export const MobileCreateFirstTemplateBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでも最初のテンプレートを作った直後は帯を出さず、何か入れると保存できる",
  args: FirstTemplateCreated.args,
  parameters: { screenshot: { skip: true } },
  play: createFirstTemplateAndSave,
};

export const ReorderTemplateBehavior: Story = {
  name: "Behavior: テンプレートをつかんで並べ替えると、開いているテンプレートはそのままで、保存の対象になる",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = getTemplateList(canvas);

    // キーボードでは、つかむボタンでスペース、矢印、スペースの順に押して動かす。
    const handle = list.getByRole("button", { name: /祝日をドラッグして並べ替え/ });
    handle.focus();
    await userEvent.keyboard("[Space][ArrowLeft][ArrowLeft][Space]");

    await waitFor(() => expect(list.getAllByRole("listitem")[0]).toHaveTextContent("祝日"));
    // 開いていたテンプレート（通常）は、並びを変えても開いたままにする。
    await expect(canvas.getByRole("group", { name: "通常" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "保存する" })).toBeEnabled();
  },
};

export const RemoveTemplateBehavior: Story = {
  name: "Behavior: テンプレートを削除すると、確かめてから一覧から外れる",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const weekend = await selectTemplate(canvas, "土日", "土・日");

    await userEvent.click(weekend.getByRole("button", { name: "削除する" }));
    const confirmation = within(await body.findByRole("alertdialog", { name: "テンプレートを削除" }));
    await userEvent.click(confirmation.getByRole("button", { name: "キャンセル" }));
    await waitFor(() =>
      expect(body.queryByRole("alertdialog", { name: "テンプレートを削除" })).not.toBeInTheDocument(),
    );
    await expect(canvas.getByRole("group", { name: "土日" })).toBeVisible();

    await userEvent.click(weekend.getByRole("button", { name: "削除する" }));
    await userEvent.click(
      within(await body.findByRole("alertdialog", { name: "テンプレートを削除" })).getByRole("button", {
        name: "削除する",
      }),
    );

    // 削除したテンプレートのすぐ下にあったテンプレートを開く。
    await expect(await canvas.findByRole("group", { name: "祝日" })).toBeVisible();
    await saveChanges(canvasElement);
    await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
    await expect(readSavedTemplates(canvasElement)[0].map((template) => template.id)).toEqual([
      weekdayTemplateId,
      holidayTemplateId,
    ]);
  },
};

// ---- Behavior: 使う日 ----

export const SharedWeekdayBehavior: Story = {
  name: "Behavior: 別のテンプレートと同じ曜日を選んでも、そのテンプレートからは外れない",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const weekend = await selectTemplate(canvas, "土日", "土・日");

    await userEvent.click(weekend.getByRole("button", { name: "金曜日" }));
    await expect(weekend.getByRole("button", { name: "金曜日" })).toHaveAttribute("aria-pressed", "true");

    const weekday = await selectTemplate(canvas, "通常", "月・火・木・金");
    await expect(weekday.getByRole("button", { name: "金曜日" })).toHaveAttribute("aria-pressed", "true");

    await saveChanges(canvasElement);
    await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
    await expect(readSavedTemplates(canvasElement)[0].map((template) => [template.name, template.weekdays])).toEqual([
      ["通常", ["mon", "tue", "thu", "fri"]],
      ["土日", ["sun", "fri", "sat"]],
      ["祝日", []],
    ]);
  },
};

export const ClearWeekdaysBehavior: Story = {
  name: "Behavior: 曜日を指定しないと、曜日だけが外れて保存される",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const weekend = await selectTemplate(canvas, "土日", "土・日");
    const clear = weekend.getByRole("button", { name: "曜日を指定しない" });
    await expect(clear).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(clear);

    await expect(clear).toHaveAttribute("aria-pressed", "true");
    await expect(weekend.getByRole("button", { name: "土曜日" })).toHaveAttribute("aria-pressed", "false");
    await expect(weekend.getByRole("button", { name: "日曜日" })).toHaveAttribute("aria-pressed", "false");
    // 曜日も祝日も選んでいないテンプレートは、一覧で「個別」と表す。
    await expect(getTemplateList(canvas).getByRole("button", { name: "土日 個別" })).toBeVisible();

    await saveChanges(canvasElement);
    await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
    await expect(
      readSavedTemplates(canvasElement)[0].map((template) => [
        template.name,
        template.weekdays,
        template.appliesToHolidays,
      ]),
    ).toEqual([
      ["通常", ["mon", "tue", "thu", "fri"], false],
      ["土日", [], false],
      ["祝日", [], true],
    ]);
  },
};

const shareHoliday: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const weekend = await selectTemplate(canvas, "土日", "土・日");

  // 祝日は「祝日」のテンプレートも選んでいる。「土日」で押しても、「祝日」からは外れない。
  await userEvent.click(weekend.getByRole("button", { name: "祝日" }));
  await expect(weekend.getByRole("button", { name: "祝日" })).toHaveAttribute("aria-pressed", "true");

  const holiday = await selectTemplate(canvas, "祝日", "祝日");
  await expect(holiday.getByRole("button", { name: "祝日" })).toHaveAttribute("aria-pressed", "true");

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
  await expect(
    readSavedTemplates(canvasElement)[0].map((template) => [template.name, template.appliesToHolidays]),
  ).toEqual([
    ["通常", false],
    ["土日", true],
    ["祝日", true],
  ]);
};

export const HolidayBehavior: Story = {
  name: "Behavior: 祝日は複数のテンプレートで選んで保存できる",
  parameters: { screenshot: { skip: true } },
  play: shareHoliday,
};

export const MobileHolidayBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでも祝日を選んで保存する",
  parameters: { screenshot: { skip: true } },
  play: shareHoliday,
};

// ---- Behavior: 必要人数 ----

const setCountAndSave: Story["play"] = async ({ canvasElement }) => {
  await setCountByForm(canvasElement, "キッチン", { start: "17:00", end: "21:00", count: 3 });

  await expectPendingChanges(canvasElement);
  await expect(readRemoteCalls(canvasElement)).toEqual([]);
  await saveChanges(canvasElement);

  await expectNoPendingChanges(canvasElement);
  const calls = readRemoteCalls(canvasElement);
  await expect(calls.map((call) => call.name)).toEqual(["saveDayTemplates"]);
  const [savedWeekday] = readSavedTemplates(canvasElement)[0];
  await expect(savedWeekday.id).toBe(weekdayTemplateId);
  // 入れた3人が、同じ時間に重ねた3本のバーとして保存の引数に入る。通しの1本が1人目になり、2本を足す。
  await expect(
    savedWeekday.requirements.kind === "time"
      ? savedWeekday.requirements.bars.filter((item) => item.positionId === kitchenId)
      : null,
  ).toEqual([
    bar(kitchenId, "09:00", "22:00"),
    bar(kitchenId, "11:00", "14:00"),
    bar(kitchenId, "17:00", "21:00"),
    bar(kitchenId, "17:00", "21:00"),
  ]);
  // ほかのポジションの人数は変わらない。
  await expect(savedWeekday.requirements.kind === "time" ? savedWeekday.requirements.bars.length : null).toBe(
    weekdayBars.length + 1,
  );
};

const KITCHEN_COUNTS_AFTER_CHANGE = [
  "キッチン 09:00〜11:00 1人",
  "キッチン 11:00〜14:00 2人",
  "キッチン 14:00〜17:00 1人",
  "キッチン 17:00〜21:00 3人",
  "キッチン 21:00〜22:00 1人",
];

export const TimeCountBehavior: Story = {
  name: "Behavior: 時間を選んで人数を入れると、帯の人数が変わり、保存の引数に入る",
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    const canvas = within(context.canvasElement);
    await expect(getRequiredCounts(canvas, "キッチン")).toEqual([
      "キッチン 09:00〜11:00 1人",
      "キッチン 11:00〜14:00 2人",
      "キッチン 14:00〜18:00 1人",
      "キッチン 18:00〜21:00 2人",
      "キッチン 21:00〜22:00 1人",
    ]);
    await setCountAndSave(context);
    await expect(getRequiredCounts(canvas, "キッチン")).toEqual(KITCHEN_COUNTS_AFTER_CHANGE);
  },
};

export const MobileTimeCountBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでも時間を選んで人数を入れ、保存する",
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    await setCountAndSave(context);
    await expect(getRequiredCounts(within(context.canvasElement), "キッチン")).toEqual(KITCHEN_COUNTS_AFTER_CHANGE);
  },
};

export const TimeCountRestoreBehavior: Story = {
  name: "Behavior: 入れた人数を元の人数へ戻すと、保存していない変更がなくなる",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await setCountByForm(canvasElement, "レジ", { start: "12:00", end: "13:00", count: 4 });
    await expectPendingChanges(canvasElement);

    await setCountByForm(canvasElement, "レジ", { start: "12:00", end: "13:00", count: 1 });
    await expectNoPendingChanges(canvasElement);
    await expect(readRemoteCalls(canvasElement)).toEqual([]);
  },
};

const trimOutsideRangeAndSave: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const template = within(canvas.getByRole("group", { name: "通常" }));

  // 外に出た人数を残したまま保存を試すと、保存されず、そのテンプレートに誤りが出る。
  await userEvent.click(template.getByRole("button", { name: "日曜日" }));
  await saveChanges(canvasElement);
  await expect(await template.findByRole("alert")).toHaveTextContent("受付時間の外に人数が入っています");
  await expect(readRemoteCalls(canvasElement)).toEqual([]);

  await userEvent.click(template.getByRole("button", { name: "受付時間に合わせる" }));
  await waitFor(() => expect(template.queryByRole("alert")).not.toBeInTheDocument());
  await expect(template.queryByText("受付時間の外に人数が入っています")).not.toBeInTheDocument();

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
  // 完全に外の人数は消え、端をまたぐ人数は内側だけが残る。
  await expect(readSavedTemplates(canvasElement)[0][0].requirements).toEqual({
    kind: "time",
    bars: [bar(hallId, "09:00", "12:00"), bar(kitchenId, "11:00", "14:00"), bar(kitchenId, "18:00", "22:00")],
  });
};

export const TrimOutsideRangeBehavior: Story = {
  name: "Behavior: 範囲の外の人数は、切りそろえてから保存できる",
  args: { setup: outsideRangeSetup },
  parameters: { screenshot: { skip: true } },
  play: trimOutsideRangeAndSave,
};

export const MobileTrimOutsideRangeBehavior: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "Behavior: モバイルでも範囲の外の人数を切りそろえて保存できる",
  args: { setup: outsideRangeSetup },
  parameters: { screenshot: { skip: true } },
  play: trimOutsideRangeAndSave,
};

const typeShiftTypeCountsAndSave: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const template = within(canvas.getByRole("group", { name: "通常" }));
  const lateKitchen = template.getByRole("spinbutton", { name: "遅番のキッチンの必要人数" });
  const earlyHall = template.getByRole("spinbutton", { name: "早番のホールの必要人数" });

  await userEvent.type(lateKitchen, "2");
  await userEvent.clear(earlyHall);
  await userEvent.type(earlyHall, "12");
  await expect(lateKitchen).toHaveValue(2);

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
  await expect(readSavedTemplates(canvasElement)[0][0].requirements).toEqual({
    kind: "shiftType",
    options: [
      {
        optionId: "early",
        counts: [
          { positionId: hallId, count: 12 },
          { positionId: kitchenId, count: 1 },
        ],
      },
      {
        optionId: "late",
        counts: [
          { positionId: hallId, count: 3 },
          { positionId: kitchenId, count: 2 },
        ],
      },
    ],
  });
};

export const ShiftTypeCountBehavior: Story = {
  name: "Behavior: パターン選択は、数字を打って保存する",
  args: { setup: shiftTypeSetup },
  parameters: { screenshot: { skip: true } },
  play: typeShiftTypeCountsAndSave,
};

export const MobileShiftTypeCountBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでもパターン選択の数字を打って保存する",
  args: { setup: shiftTypeSetup },
  parameters: { screenshot: { skip: true } },
  play: typeShiftTypeCountsAndSave,
};

const typeDateOnlyCountsAndSave: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const template = within(canvas.getByRole("group", { name: "通常" }));

  await userEvent.type(template.getByRole("spinbutton", { name: "1日のレジの必要人数" }), "1");
  // 空欄へ戻したポジションは、未設定として保存の引数から外れる。
  await userEvent.clear(template.getByRole("spinbutton", { name: "1日のキッチンの必要人数" }));

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
  await expect(readSavedTemplates(canvasElement)[0][0].requirements).toEqual({
    kind: "dateOnly",
    counts: [
      { positionId: hallId, count: 4 },
      { positionId: registerId, count: 1 },
    ],
  });
};

export const DateOnlyCountBehavior: Story = {
  name: "Behavior: 日付選択は、数字を打って保存する",
  args: { setup: dateOnlySetup },
  parameters: { screenshot: { skip: true } },
  play: typeDateOnlyCountsAndSave,
};

export const MobileDateOnlyCountBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでも日付選択の数字を打って保存する",
  args: { setup: dateOnlySetup },
  parameters: { screenshot: { skip: true } },
  play: typeDateOnlyCountsAndSave,
};

export const ReentryBehavior: Story = {
  name: "Behavior: 再設定の知らせは、人数を入れると消える",
  args: { setup: requiresReentrySetup },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const template = within(canvas.getByRole("group", { name: "通常" }));
    const notice = "希望シフトの集め方を変更したため、再設定が必要です。";
    await expect(template.getByText(notice)).toBeVisible();

    await userEvent.type(template.getByRole("spinbutton", { name: "1日のホールの必要人数" }), "3");

    await waitFor(() => expect(template.queryByText(notice)).not.toBeInTheDocument());
    // まだ入れ直していない別のテンプレートには、知らせが残る。
    const weekend = await selectTemplate(canvas, "土日", "土・日", "再設定");
    await expect(weekend.getByText(notice)).toBeVisible();
  },
};

const copyRequirements: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  const holiday = await selectTemplate(canvas, "祝日", "祝日");

  await userEvent.click(holiday.getByRole("button", { name: "コピーする" }));
  const dialog = within(await body.findByRole("dialog", { name: "別テンプレートの人員設定をコピーする" }));
  await userEvent.selectOptions(dialog.getByRole("combobox", { name: "コピーもとテンプレート" }), "土日");
  await userEvent.click(dialog.getByRole("button", { name: "コピーする" }));
  await waitFor(() =>
    expect(body.queryByRole("dialog", { name: "別テンプレートの人員設定をコピーする" })).not.toBeInTheDocument(),
  );
  // 見えている範囲がほとんど変わらないため、どのテンプレートから写したかを通知で伝える。
  await expect(await body.findByText("「土日」の必要人数をコピーしました")).toBeVisible();

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
  const [, savedWeekend, savedHoliday] = readSavedTemplates(canvasElement)[0];
  // 必要人数だけが「土日」と同じになり、名前と使う日は変わらない。
  await expect(savedHoliday).toEqual({
    id: holidayTemplateId,
    name: "祝日",
    weekdays: [],
    appliesToHolidays: true,
    requirements: savedWeekend.requirements,
  });
  await expect(savedWeekend.requirements.kind === "time" ? savedWeekend.requirements.bars.length : null).toBe(8);
};

export const CopyRequirementsBehavior: Story = {
  name: "Behavior: コピーすると、必要人数が置き換わる",
  parameters: { screenshot: { skip: true } },
  play: copyRequirements,
};

export const MobileCopyRequirementsBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでもほかのテンプレートからコピーできる",
  parameters: { screenshot: { skip: true } },
  play: copyRequirements,
};

// ---- Behavior: 保存 ----

export const ValidationBehavior: Story = {
  name: "Behavior: 誤りのあるテンプレートを開いて、そのテンプレートに誤りを出す",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const weekend = await selectTemplate(canvas, "土日", "土・日");
    await userEvent.clear(weekend.getByRole("textbox", { name: "テンプレート名" }));
    // 入力の途中では誤りを出さない。
    const unnamed = within(await canvas.findByRole("group", { name: "名前のないテンプレート" }));
    await expect(unnamed.queryByRole("alert")).not.toBeInTheDocument();

    await selectTemplate(canvas, "通常", "月・火・木・金");
    await saveChanges(canvasElement);

    // 保存を試すと、誤りのあるテンプレートへ切り替わり、そのテンプレートの中に誤りが出る。
    const invalid = within(await canvas.findByRole("group", { name: "名前のないテンプレート" }));
    await expect(await invalid.findByRole("alert")).toHaveTextContent("テンプレート名を入力してください");
    await expect(
      getTemplateList(canvas).getByRole("button", { name: "名前のないテンプレート 土・日 要確認" }),
    ).toHaveAttribute("aria-current", "true");
    await expect(readRemoteCalls(canvasElement)).toEqual([]);
  },
};

export const SaveLockBehavior: Story = {
  name: "Behavior: 保存中は続けて保存できない",
  args: { holdDayTemplateSave: true },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(within(canvas.getByRole("group", { name: "通常" })).getByRole("button", { name: "祝日" }));
    await expectPendingChanges(canvasElement);
    const pendingBar = getSaveActions(canvasElement);
    const saveButton = pendingBar.getByRole("button", { name: "保存する" });

    await userEvent.click(saveButton);
    await waitFor(() => expect(saveButton).toBeDisabled());
    saveButton.click();
    await expect(readRemoteCalls(canvasElement)).toHaveLength(1);

    // 応答を待っている間は、テンプレートとスタッフを操作できない。待っている間の編集が、応答のあとで消えないようにするためである。
    const templates = canvas.getByRole("region", { name: "必要人数" });
    const staffSection = canvas.getByRole("region", { name: "スタッフのスキル" });
    await expect(templates).toHaveAttribute("inert");
    await expect(staffSection).toHaveAttribute("inert");
    // ポジションも、同じ「保存する」で保存するため止める。
    await expect(canvas.getByRole("region", { name: "ポジション" })).toHaveAttribute("inert");
    const name = within(templates).getByRole("textbox", { name: "テンプレート名" });
    name.focus();
    await expect(name).not.toHaveFocus();

    canvas.getByTestId("release-save").click();
    await expectNoPendingChanges(canvasElement);
    await expect(readRemoteCalls(canvasElement)).toHaveLength(1);
    // 応答のあとは、また操作でき、保存した内容が残っている。
    await waitFor(() => expect(templates).not.toHaveAttribute("inert"));
    await expect(staffSection).not.toHaveAttribute("inert");
    await expect(within(templates).getByRole("button", { name: "祝日" })).toHaveAttribute("aria-pressed", "true");
  },
};

export const AddTemplatePendingBehavior: Story = {
  name: "Behavior: 足したテンプレートは、使う日を選ぶと保存できる",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "テンプレートを追加" }));
    const added = within(await canvas.findByRole("group", { name: "テンプレート4" }));
    // 足しただけでは保存する変更に数えない。使う日を選ぶと保存できる。
    await expectNoPendingChanges(canvasElement);
    await userEvent.click(added.getByRole("button", { name: "水曜日・定休日" }));

    await expectPendingChanges(canvasElement);
    await expect(readRemoteCalls(canvasElement)).toEqual([]);
  },
};

// ---- Behavior: AIサポート ----

const applyAssistDraft: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByRole("button", { name: "AIで下書きを作る" }));
  const dialog = await body.findByRole("dialog", { name: "AIで下書きを作る" });
  await userEvent.type(within(dialog).getByRole("textbox", { name: "店の状況" }), "平日は昼が混みます");
  await userEvent.click(within(dialog).getByRole("button", { name: "下書きを作る" }));

  // 下書きの先頭のテンプレートが開く。
  await expect(await canvas.findByRole("group", { name: "平日" })).toBeVisible();
  await waitFor(() => expect(body.queryByRole("dialog", { name: "AIで下書きを作る" })).not.toBeInTheDocument());
  // 下書きを作っただけでは、保存処理は呼ばれない。
  await expect(readRemoteCalls(canvasElement).map((call) => call.name)).toEqual(["suggestShiftSetup"]);

  await saveChanges(canvasElement);
  await waitFor(() =>
    expect(readRemoteCalls(canvasElement).map((call) => call.name)).toEqual(["suggestShiftSetup", "saveDayTemplates"]),
  );
  const saved = readSavedTemplates(canvasElement)[0];
  await expect(saved.map((template) => [template.id, template.name, template.weekdays])).toEqual([
    [undefined, "平日", ["mon", "tue", "thu"]],
    [undefined, "週末", ["sun", "fri", "sat"]],
  ]);
  // 下書きの人数は、バーの形で保存の引数に入る。
  await expect(
    saved[0].requirements.kind === "time"
      ? saved[0].requirements.bars.filter((item) => item.positionId === kitchenId)
      : null,
  ).toEqual([bar(kitchenId, "09:00", "22:00"), bar(kitchenId, "11:00", "14:00"), bar(kitchenId, "17:00", "21:00")]);
};

export const AssistDraftBehavior: Story = {
  name: "Behavior: AIの下書きは帯に入るだけで、保存するまで保存されない",
  args: { setup: { ...notConfiguredSetup, positions } },
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    await applyAssistDraft(context);
    await expect(getRequiredCounts(within(context.canvasElement), "キッチン")).toEqual([
      "キッチン 09:00〜11:00 1人",
      "キッチン 11:00〜14:00 2人",
      "キッチン 14:00〜17:00 1人",
      "キッチン 17:00〜21:00 2人",
      "キッチン 21:00〜22:00 1人",
    ]);
  },
};

export const MobileAssistDraftBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでもAIの下書きが帯に入る",
  args: { setup: { ...notConfiguredSetup, positions } },
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    await applyAssistDraft(context);
    await expect(getRequiredCounts(within(context.canvasElement), "キッチン")).toEqual([
      "キッチン 09:00〜11:00 1人",
      "キッチン 11:00〜14:00 2人",
      "キッチン 14:00〜17:00 1人",
      "キッチン 17:00〜21:00 2人",
      "キッチン 21:00〜22:00 1人",
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
    // 入力した文章といまのテンプレートは、そのまま残る。
    await expect(situation).toHaveValue("土日は夜が忙しいです");
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(canvas.getByRole("group", { name: "通常" })).toBeVisible());
    await expectNoPendingChanges(canvasElement);
  },
};

// ---- Behavior: ポジション ----

export const NoPositionsBehavior: Story = {
  name: "Behavior: ポジションが1件もない店舗でも開け、最初のポジションを足すと設定を始められる",
  args: { setup: { ...notConfiguredSetup, positions: [] } },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = within(canvas.getByRole("region", { name: "ポジション" }));
    // ポジションを追加するまで、必要人数とスタッフの中身は見せない。
    await expect(section.getByText("ポジションが未設定です。ポジションを追加してください")).toBeVisible();
    await expect(canvas.getByText("ポジションを追加すると、必要人数を設定できます")).toBeVisible();
    await expect(canvas.getByText("ポジションを追加すると、熟練度を設定できます")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "テンプレートを作る" })).not.toBeInTheDocument();

    await userEvent.click(section.getByRole("button", { name: "ポジションを追加する" }));
    const dialog = within(await body.findByRole("dialog", { name: "ポジションを編集" }));
    await userEvent.click(dialog.getByRole("button", { name: "ポジションを追加" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "ポジション1の名前" }), "キッチン");
    await userEvent.click(dialog.getByRole("button", { name: "決定する" }));

    // 決定すると、保存の前から必要人数とスタッフを設定できる。
    await waitFor(() => expect(section.getByText("キッチン")).toBeVisible());
    await expect(section.getByRole("button", { name: "ポジションを編集する" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "テンプレートを作る" })).toBeVisible();
    await expect(canvas.queryByText("ポジションを追加すると、熟練度を設定できます")).not.toBeInTheDocument();
  },
};

export const PositionRemoveAllBehavior: Story = {
  name: "Behavior: ポジションをすべて削除すると、追加する前の状態へ戻る",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = within(canvas.getByRole("region", { name: "ポジション" }));
    await userEvent.click(section.getByRole("button", { name: "ポジションを編集する" }));
    const dialog = within(await body.findByRole("dialog", { name: "ポジションを編集" }));

    for (const name of ["ホール", "キッチン", "レジ"]) {
      await userEvent.click(dialog.getByRole("button", { name: `${name}を削除` }));
    }
    await expect(dialog.queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "決定する" }));

    // ポジションのない表示へ戻り、必要人数とスタッフの中身は見せない。保存するまでは元に戻せる。
    await waitFor(() =>
      expect(section.getByText("ポジションが未設定です。ポジションを追加してください")).toBeVisible(),
    );
    await expect(section.getByRole("button", { name: "ポジションを追加する" })).toBeVisible();
    await expect(canvas.getByText("ポジションを追加すると、必要人数を設定できます")).toBeVisible();
    await expect(canvas.getByText("ポジションを追加すると、熟練度を設定できます")).toBeVisible();

    // 保存すると、既定のポジションだけが仮の名前で残り、人数と熟練度は空になる。
    await userEvent.click(canvas.getByRole("button", { name: "保存する" }));
    await waitFor(() =>
      expect(readRemoteCalls(canvasElement)).toContainEqual({
        name: "savePositions",
        args: [{ id: hallId, name: "シフト", color: "#60a5fa" }],
      }),
    );
  },
};

export const PositionReorderBehavior: Story = {
  name: "Behavior: ポジションをつかんで並べ替えると、決定した順でページに並ぶ",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = within(canvas.getByRole("region", { name: "ポジション" }));
    await userEvent.click(section.getByRole("button", { name: "ポジションを編集する" }));
    const dialog = within(await body.findByRole("dialog", { name: "ポジションを編集" }));

    // キーボードでは、つかむボタンでスペース、矢印、スペースの順に押して動かす。
    const handle = dialog.getByRole("button", { name: /レジをドラッグして並べ替え/ });
    handle.focus();
    await userEvent.keyboard("[Space][ArrowUp][ArrowUp][Space]");
    await waitFor(() => expect(dialog.getByRole("textbox", { name: "ポジション1の名前" })).toHaveValue("レジ"));
    await expect(dialog.getByRole("textbox", { name: "ポジション2の名前" })).toHaveValue("ホール");
    await expect(dialog.getByRole("textbox", { name: "ポジション3の名前" })).toHaveValue("キッチン");

    await userEvent.click(dialog.getByRole("button", { name: "決定する" }));
    await waitFor(() =>
      expect(section.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["レジ", "ホール", "キッチン"]),
    );
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
    await userEvent.click(section.getByRole("button", { name: "ポジションを編集する" }));
    const dialog = within(await body.findByRole("dialog", { name: "ポジションを編集" }));

    const addButton = dialog.getByRole("button", { name: "ポジションを追加" });
    // 最初からあるポジションも、ほかのポジションと同じように削除できる。
    await expect(dialog.getByRole("button", { name: "ホールを削除" })).toBeEnabled();
    await userEvent.click(addButton);
    await expect(addButton).toBeDisabled();
    await expect(dialog.getByText("ポジションは10件まで登録できます")).toBeVisible();

    // 名前を入れずに反映すると、その行に誤りが出て、Dialogは閉じない。
    await userEvent.click(dialog.getByRole("button", { name: "決定する" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("ポジション名を入力してください");

    await userEvent.type(dialog.getByRole("textbox", { name: "ポジション10の名前" }), "デリバリー");
    await userEvent.click(dialog.getByRole("button", { name: "決定する" }));

    // 反映しただけでは保存されず、ページの一覧に出て、保存していない変更になる。
    await waitFor(() => expect(body.queryByRole("dialog", { name: "ポジションを編集" })).not.toBeInTheDocument());
    await expect(await section.findByText("デリバリー")).toBeVisible();
    await expectPendingChanges(canvasElement);
    await expect(readRemoteCalls(canvasElement)).toEqual([]);

    await saveChanges(canvasElement);
    await expectNoPendingChanges(canvasElement);
    await expect(readRemoteCalls(canvasElement).map((call) => call.name)).toEqual(["savePositions"]);
    const saved = readRemoteCalls(canvasElement)[0].args as Array<{ id?: string; name: string; color: string }>;
    await expect(saved).toHaveLength(10);
    // 足したポジションはidを持たず、まだ使っていない色が入る。
    await expect(saved[9]).toEqual({ name: "デリバリー", color: "#06b6d4" });
    await expect(section.getByText("デリバリー")).toBeVisible();
  },
};

export const PositionDraftBehavior: Story = {
  name: "Behavior: 足したポジションは保存の前から必要人数を入れられ、ポジションから先に保存する",
  args: { setup: dateOnlySetup },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = within(canvas.getByRole("region", { name: "ポジション" }));
    await userEvent.click(section.getByRole("button", { name: "ポジションを編集する" }));
    const dialog = within(await body.findByRole("dialog", { name: "ポジションを編集" }));
    await userEvent.click(dialog.getByRole("button", { name: "ポジションを追加" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "ポジション4の名前" }), "デリバリー");
    await userEvent.click(dialog.getByRole("button", { name: "決定する" }));
    await waitFor(() => expect(body.queryByRole("dialog", { name: "ポジションを編集" })).not.toBeInTheDocument());

    // 保存の前から、必要人数の表に足したポジションの欄が出る。
    const template = within(canvas.getByRole("group", { name: "通常" }));
    const deliveryCount = await template.findByRole("spinbutton", { name: "1日のデリバリーの必要人数" });
    await userEvent.type(deliveryCount, "2");
    await expect(readRemoteCalls(canvasElement)).toEqual([]);

    await saveChanges(canvasElement);
    await expectNoPendingChanges(canvasElement);
    // ポジションを先に保存し、受け取ったIDで必要人数を保存する。
    const calls = readRemoteCalls(canvasElement);
    await expect(calls.map((call) => call.name)).toEqual(["savePositions", "saveDayTemplates"]);
    await expect(calls[0].args).toEqual([
      { id: hallId, name: "ホール", color: "#60a5fa" },
      { id: kitchenId, name: "キッチン", color: "#fb923c" },
      { id: registerId, name: "レジ", color: "#a78bfa" },
      { name: "デリバリー", color: "#f472b6" },
    ]);
    await expect(readSavedTemplates(canvasElement)[0][0].requirements).toEqual({
      kind: "dateOnly",
      counts: [
        { positionId: hallId, count: 4 },
        { positionId: kitchenId, count: 2 },
        { positionId: "position-added-3", count: 2 },
      ],
    });
    // 保存のあとも、入れた人数が残っている。
    await expect(template.getByRole("spinbutton", { name: "1日のデリバリーの必要人数" })).toHaveValue(2);
  },
};

export const PositionRemoveBehavior: Story = {
  name: "Behavior: 削除したポジションは保存の前に必要人数の帯から外れる",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = within(canvas.getByRole("region", { name: "ポジション" }));
    await expect(canvas.getByRole("group", { name: "レジの必要人数" })).toBeVisible();

    await userEvent.click(section.getByRole("button", { name: "ポジションを編集する" }));
    const dialog = within(await body.findByRole("dialog", { name: "ポジションを編集" }));
    await userEvent.click(dialog.getByRole("button", { name: "レジを削除" }));
    await userEvent.click(dialog.getByRole("button", { name: "決定する" }));
    await waitFor(() => expect(body.queryByRole("dialog", { name: "ポジションを編集" })).not.toBeInTheDocument());

    await waitFor(() => expect(canvas.queryByRole("group", { name: "レジの必要人数" })).not.toBeInTheDocument());
    await expect(section.queryByText("レジ")).not.toBeInTheDocument();
    await expectPendingChanges(canvasElement);
    await expect(readRemoteCalls(canvasElement)).toEqual([]);
  },
};

export const PositionLastOneBehavior: Story = {
  name: "Behavior: ポジションを追加していない店舗では「シフト」を見せず、名前を付けて追加できる",
  args: { setup: unsplitSetup },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = within(canvas.getByRole("region", { name: "ポジション" }));
    // 仮の名前「シフト」は、設定ページに出さない。必要人数とスタッフの中身も見せない。
    await expect(section.getByText("ポジションが未設定です。ポジションを追加してください")).toBeVisible();
    await expect(section.queryByText("シフト")).not.toBeInTheDocument();
    await expect(canvas.getByText("ポジションを追加すると、必要人数を設定できます")).toBeVisible();
    await expect(canvas.getByText("ポジションを追加すると、熟練度を設定できます")).toBeVisible();

    await userEvent.click(section.getByRole("button", { name: "ポジションを追加する" }));
    const dialog = within(await body.findByRole("dialog", { name: "ポジションを編集" }));
    // 1件目は、仮の名前を出さず、名前の欄を空にして出す。
    const firstName = await dialog.findByRole("textbox", { name: "ポジション1の名前" });
    await expect(firstName).toHaveValue("");

    // 2件にして1件目を空のまま決定すると、その行に誤りが出る。「シフト」と入れても決定できない。
    await userEvent.click(dialog.getByRole("button", { name: "ポジションを追加" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "ポジション2の名前" }), "キッチン");
    await userEvent.click(dialog.getByRole("button", { name: "決定する" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("ポジション名を入力してください");
    await userEvent.type(firstName, "シフト");
    await userEvent.click(dialog.getByRole("button", { name: "決定する" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("「シフト」以外の名前を入力してください");

    // 名前を付けると決定でき、ページに2件が出て、必要人数とスタッフを設定できる。
    await userEvent.clear(firstName);
    await userEvent.type(firstName, "ホール");
    await userEvent.click(dialog.getByRole("button", { name: "決定する" }));
    await waitFor(() => expect(section.getByText("ホール")).toBeVisible());
    await expect(section.getByText("キッチン")).toBeVisible();
    await expect(section.getByRole("button", { name: "ポジションを編集する" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "テンプレートを作る" })).toBeVisible();
  },
};

// ---- Behavior: スタッフ ----

type SavedStaffProfile = { staffId: string; positionSkills: Array<{ positionId: string; level: string }> };

function readSavedStaffProfiles(canvasElement: HTMLElement): SavedStaffProfile[][] {
  return readRemoteCalls(canvasElement)
    .filter((call) => call.name === "saveStaffShiftProfiles")
    .map((call) => call.args as SavedStaffProfile[]);
}

const cycleStaffLevelsAndSave: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);

  // 押すたびに、一人前、見習い、リーダー、担当外の順に切り替わり、担当外の次は一人前へ戻る。
  await pressStaffLevelCell(canvas, "高橋 美咲", "ホール", "見習い");
  await pressStaffLevelCell(canvas, "高橋 美咲", "ホール", "リーダー");
  await pressStaffLevelCell(canvas, "高橋 美咲", "ホール", "担当外");
  // 高橋: 一巡して一人前へ戻したスタッフは、変更に数えない。
  await pressStaffLevelCell(canvas, "高橋 美咲", "ホール", "一人前");

  await pressStaffLevelCell(canvas, "佐藤 花子", "レジ", "見習い");
  // 保存済みの値の続きから切り替わる。伊藤のキッチンは見習い、鈴木のキッチンは担当外である。
  await pressStaffLevelCell(canvas, "伊藤 さくら", "キッチン", "リーダー");
  await pressStaffLevelCell(canvas, "鈴木 次郎", "キッチン", "一人前");

  // キーボードでも、EnterとSpaceで切り替わる。
  const keyboardCell = getStaffLevelCell(canvas, "田中 太郎", "レジ");
  keyboardCell.focus();
  await userEvent.keyboard("{Enter}");
  await waitFor(() => expect(keyboardCell).toHaveAccessibleName("田中 太郎 レジ 見習い"));
  await userEvent.keyboard(" ");
  await waitFor(() => expect(keyboardCell).toHaveAccessibleName("田中 太郎 レジ リーダー"));

  await expectPendingChanges(canvasElement);
  await saveChanges(canvasElement);

  await waitFor(() => expect(readRemoteCalls(canvasElement)).toHaveLength(1));
  // 変えた4人だけを、ポジションの並び順で保存する。一人前は送らない。
  await expect(readRemoteCalls(canvasElement)).toEqual([
    {
      name: "saveStaffShiftProfiles",
      args: [
        {
          staffId: "staff-1",
          positionSkills: [
            { positionId: hallId, level: "lead" },
            { positionId: registerId, level: "newcomer" },
          ],
        },
        { staffId: "staff-2", positionSkills: [] },
        { staffId: "staff-4", positionSkills: [{ positionId: registerId, level: "lead" }] },
        {
          staffId: "staff-5",
          positionSkills: [
            { positionId: hallId, level: "newcomer" },
            { positionId: kitchenId, level: "lead" },
          ],
        },
      ],
    },
  ]);
  await expectNoPendingChanges(canvasElement);
  // 保存したあとも、切り替えた値が出ている。
  await expect(getStaffLevelCell(canvas, "佐藤 花子", "レジ")).toHaveAccessibleName("佐藤 花子 レジ 見習い");
  await expect(getStaffLevelCell(canvas, "伊藤 さくら", "キッチン")).toHaveAccessibleName(
    "伊藤 さくら キッチン リーダー",
  );
};

export const StaffLevelBehavior: Story = {
  name: "Behavior: マスを押すたびに熟練度が順に切り替わり、保存できる",
  parameters: { screenshot: { skip: true } },
  play: cycleStaffLevelsAndSave,
};

export const MobileStaffLevelBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでもマスを押すたびに熟練度が順に切り替わり、保存できる",
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    // スマートフォンでは表を出さず、スタッフごとにポジションのマスを並べる。
    await expect(within(context.canvasElement).queryByRole("table", { name: "スタッフ" })).not.toBeInTheDocument();
    await cycleStaffLevelsAndSave(context);
  },
};

const skipUnavailableOnLastPosition: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const pressThrough = async (position: string, levels: string[]) => {
    for (const level of levels) await pressStaffLevelCell(canvas, "鈴木 次郎", position, level);
  };

  // 鈴木はキッチンが担当外である。レジも「担当外」にすると、担当できるのはホールだけになる。
  await pressThrough("レジ", ["見習い", "リーダー", "担当外"]);
  // 最後に残ったホールでは、「担当外」を飛ばして一人前へ戻る。
  await pressThrough("ホール", ["見習い", "リーダー", "一人前"]);

  // レジを一人前へ戻すと、ホールも「担当外」へ切り替えられる。今度はレジが最後の1つになる。
  await pressThrough("レジ", ["一人前"]);
  await pressThrough("ホール", ["見習い", "リーダー", "担当外"]);
  await pressThrough("レジ", ["見習い", "リーダー", "一人前"]);

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedStaffProfiles(canvasElement)).toHaveLength(1));
  await expect(readSavedStaffProfiles(canvasElement)[0]).toEqual([
    {
      staffId: "staff-2",
      positionSkills: [
        { positionId: hallId, level: "unavailable" },
        { positionId: kitchenId, level: "unavailable" },
      ],
    },
  ]);
};

export const StaffLastPositionBehavior: Story = {
  name: "Behavior: 最後に残った担当できるポジションでは、担当外を飛ばして一人前へ戻る",
  parameters: { screenshot: { skip: true } },
  play: skipUnavailableOnLastPosition,
};

export const MobileStaffLastPositionBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでも最後に残った担当できるポジションでは、担当外を飛ばして一人前へ戻る",
  parameters: { screenshot: { skip: true } },
  play: skipUnavailableOnLastPosition,
};

export const SinglePositionStaffBehavior: Story = {
  name: "Behavior: ポジションが1件の店舗では、一人前、見習い、リーダーの順に切り替わる",
  args: { setup: notConfiguredSetup },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 担当できるポジションを選ぶ余地がないため、「担当外」にはならない。
    for (const level of ["見習い", "リーダー", "一人前", "見習い"]) {
      await pressStaffLevelCell(canvas, "佐藤 花子", "ホール", level);
    }

    await saveChanges(canvasElement);
    await waitFor(() => expect(readSavedStaffProfiles(canvasElement)).toHaveLength(1));
    await expect(readSavedStaffProfiles(canvasElement)[0]).toEqual([
      { staffId: "staff-1", positionSkills: [{ positionId: hallId, level: "newcomer" }] },
    ]);
  },
};

export const MobileSinglePositionStaffBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルでもポジションが1件の店舗では、一人前、見習い、リーダーの順に切り替わる",
  args: { setup: notConfiguredSetup },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 伊藤は、保存済みの値が見習いである。リーダーの次は、「担当外」を飛ばして一人前へ戻る。
    await pressStaffLevelCell(canvas, "伊藤 さくら", "ホール", "リーダー");
    await pressStaffLevelCell(canvas, "伊藤 さくら", "ホール", "一人前");

    await saveChanges(canvasElement);
    await waitFor(() => expect(readSavedStaffProfiles(canvasElement)).toHaveLength(1));
    await expect(readSavedStaffProfiles(canvasElement)[0]).toEqual([{ staffId: "staff-5", positionSkills: [] }]);
  },
};

export const SkillLegendBehavior: Story = {
  name: "Behavior: スキルの役割を開くと4つのスキルの説明が出て、閉じるとボタンへフォーカスが戻る",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = within(canvasElement).getByRole("button", { name: "スキルの役割" });
    const dialog = await openSkillLegend(canvasElement);

    // 4つのスキルを、見習い、一人前、リーダー、担当外の順で説明する。
    await expect(
      within(dialog)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["見習い", "一人前", "リーダー", "担当外"]);
    await expect(within(dialog).getAllByRole("definition")).toHaveLength(4);

    const actions = dialog.querySelector<HTMLElement>("[data-dialog-action-area]");
    if (!actions) throw new Error("Dialogの操作の行が見つかりません");
    await userEvent.click(within(actions).getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(body.queryByRole("dialog", { name: "スキルの役割" })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const ReadOnlySkillLegendBehavior: Story = {
  name: "Behavior: 閲覧専用でもスキルの役割を開ける",
  args: ReadOnly.args,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const dialog = await openSkillLegend(canvasElement);

    await expect(within(dialog).getAllByRole("definition")).toHaveLength(4);
  },
};

// ---- Behavior: 選択中のボタンのホバー ----

/** `rgb(r, g, b)`の色から、相対輝度を返す。 */
function getRelativeLuminance(color: string) {
  const [red, green, blue] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map((value) => {
    const channel = Number(value) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** 要素の文字の色と地の色の、コントラスト比を返す。 */
function getContrastRatio(element: HTMLElement) {
  const style = getComputedStyle(element);
  const [lighter, darker] = [getRelativeLuminance(style.color), getRelativeLuminance(style.backgroundColor)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

export const SelectedHoverBehavior: Story = {
  name: "Behavior: 選択中のボタンにカーソルを載せても、文字が読める",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const selectedDay = within(canvas.getByRole("group", { name: "通常" })).getByRole("button", { name: "月曜日" });
    const selectedTemplate = getTemplateList(canvas).getByRole("button", { name: "通常 月・火・木・金" });
    const targets = [selectedDay, selectedTemplate];

    for (const target of targets) {
      if (!target) throw new Error("選択中のボタンが見つかりません");
      const restingContrast = getContrastRatio(target);
      // 色の切り替わりの途中を読まないよう、transitionを止めてからホバー中の状態を作る。
      // ChakraのホバーのスタイルはCSSの:hoverと同じ規則で`data-hover`にも当たる。
      target.style.transition = "none";
      target.setAttribute("data-hover", "");
      // 選択中は、ホバー中も濃い地に白い文字のままで、ホバーの前よりコントラストが下がらない。
      await expect(getComputedStyle(target).color).toBe("rgb(255, 255, 255)");
      await expect(getContrastRatio(target)).toBeGreaterThanOrEqual(restingContrast);
    }
  },
};

// ---- Behavior: 閲覧専用 ----

const expectReadOnly: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const weekday = within(canvas.getByRole("group", { name: "通常" }));

  await expect(weekday.getByRole("textbox", { name: "テンプレート名" })).toBeDisabled();
  await expect(weekday.getByRole("button", { name: "月曜日" })).toBeDisabled();
  await expect(weekday.getByRole("button", { name: "祝日" })).toBeDisabled();
  await expect(weekday.getByRole("button", { name: "コピーする" })).toBeDisabled();
  await expect(weekday.getByRole("button", { name: "削除する" })).toBeDisabled();
  // 人数を入れる操作は出さない。人数は読める。
  await expect(weekday.queryByRole("button", { name: "時間を選んで入れる" })).not.toBeInTheDocument();
  await expect(weekday.getByRole("img", { name: "キッチン 11:00〜14:00 2人" })).toBeVisible();
  await expect(canvas.getByRole("button", { name: "テンプレートを追加" })).toBeDisabled();
  // スタッフの値は読めるが、変えられない。
  const kitchenCell = getStaffLevelCell(canvas, "鈴木 次郎", "キッチン");
  await expect(kitchenCell).toHaveAccessibleName("鈴木 次郎 キッチン 担当外");
  await expect(kitchenCell).toBeDisabled();
  for (const editButton of canvas.getAllByRole("button", { name: "ポジションを編集する" })) {
    await expect(editButton).toBeDisabled();
  }
  await expect(canvas.queryByRole("button", { name: "AIで下書きを作る" })).not.toBeInTheDocument();

  // テンプレートの切り替えは、閲覧専用でもできる。
  const weekend = await selectTemplate(canvas, "土日", "土・日");
  await expect(weekend.getByRole("textbox", { name: "テンプレート名" })).toHaveValue("土日");
  // 保存できないため、保存の操作は出さない。
  await expect(canvas.queryByRole("group", { name: "変更の保存" })).not.toBeInTheDocument();
};

export const ReadOnlyBehavior: Story = {
  name: "Behavior: 閲覧専用では編集操作が無効になり、テンプレートの切り替えだけできる",
  args: ReadOnly.args,
  parameters: { screenshot: { skip: true } },
  play: expectReadOnly,
};

export const MobileReadOnlyBehavior: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Behavior: モバイルの閲覧専用でも編集操作が無効になる",
  args: ReadOnly.args,
  parameters: { screenshot: { skip: true } },
  play: expectReadOnly,
};

export const ReadOnlyCountBehavior: Story = {
  name: "Behavior: 閲覧専用では数字の入力欄も無効になる",
  args: {
    setup: { ...shiftTypeSetup, canWriteBusinessData: false, businessWriteBlockReason: "usageLimitExceeded" },
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const template = within(within(canvasElement).getByRole("group", { name: "通常" }));
    for (const input of template.getAllByRole("spinbutton")) await expect(input).toBeDisabled();
  },
};
