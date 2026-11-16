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
  { _id: hallId, name: "ホール", color: "#3b82f6", isDefault: true },
  { _id: kitchenId, name: "キッチン", color: "#c2410c", isDefault: false },
  { _id: registerId, name: "レジ", color: "#7c3aed", isDefault: false },
];

const staffNames = ["佐藤 花子", "鈴木 次郎", "高橋 美咲", "田中 太郎", "伊藤 さくら", "渡辺 健"];
const staffs: ShiftSetupData["staffs"] = staffNames.map((name, index) => ({
  _id: `staff-${index + 1}` as Id<"staffs">,
  name,
  // 佐藤はホールの責任者、鈴木はキッチンに入れない、伊藤はホールとキッチンの新人。ほかは全員、全ポジションが標準。
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

// 図の例と同じ、昼と夜に人を足す1日。ホールは5行、キッチンは2行に詰まる。
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
  positions: [{ _id: hallId, name: "シフト", color: "#3b82f6", isDefault: true }],
  dayTemplates: [],
  breakRule: null,
  // ポジションが1件の店舗。伊藤だけが新人。
  staffs: staffs.map((staff, index) => ({
    ...staff,
    positionSkills: index === 4 ? [{ positionId: hallId, level: "newcomer" as const }] : [],
  })),
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

// 受付時間を9:00〜22:00へ短くしたあとに残る、範囲の外のバー。完全に外が1本、端をまたぐバーが2本。
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

// 希望シフトの集め方を時間指定から日付選択へ変えた直後。保存済みの型は、空の必要人数で返る。
const requiresReentrySetup: ShiftSetupData = {
  ...dateOnlySetup,
  dayTemplates: timeSetup.dayTemplates.map((template) => ({
    ...template,
    requirements: { kind: "dateOnly", counts: [] },
    requiresReentry: true,
  })),
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

// 長い名前、ポジション8件、型は上限の20件。
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

/** 見出しの行にある、保存の操作。 */
function getSaveActions(canvasElement: HTMLElement) {
  return within(within(canvasElement).getByRole("group", { name: "変更の保存" }));
}

/** 保存していない変更があり、「保存する」を押せることを確かめる。 */
async function expectPendingChanges(canvasElement: HTMLElement) {
  const actions = getSaveActions(canvasElement);
  await waitFor(() => expect(actions.getByRole("button", { name: "保存する" })).toBeEnabled());
  await expect(actions.getByRole("status")).toHaveTextContent("変更を保存していません");
  await expect(actions.getByRole("button", { name: "元に戻す" })).toBeEnabled();
}

/** 保存していない変更がなく、「保存する」が同じ位置で押せない状態になっていることを確かめる。 */
async function expectNoPendingChanges(canvasElement: HTMLElement) {
  const actions = getSaveActions(canvasElement);
  await waitFor(async () => {
    await expect(actions.getByRole("button", { name: "保存する" })).toBeDisabled();
    await expect(actions.queryByRole("button", { name: "元に戻す" })).not.toBeInTheDocument();
  });
  await expect(actions.getByRole("status")).toBeEmptyDOMElement();
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
  name: "受付時間の外にバーが残っている",
  args: { setup: outsideRangeSetup },
};

export const RequiresReentry: Story = {
  name: "集め方を変えたあと・入れ直しが必要",
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
  name: "長い名前・ポジション8件・型20件",
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

/** 編集する型を切り替える。PCは型の一覧、スマートフォンはセレクトで選ぶ。 */
async function selectTemplate(canvas: Canvas, name: string, usage: string, status?: "要確認" | "入れ直し") {
  const select = canvas.queryByRole("combobox", { name: "編集する型" });
  if (select) {
    await userEvent.selectOptions(select, `${name}（${usage}）`);
  } else {
    const list = within(canvas.getByRole("list", { name: "型の一覧" }));
    // 一覧では、誤りや入れ直しの印も名前に含めて読み上げる。
    await userEvent.click(list.getByRole("button", { name: [name, usage, ...(status ? [status] : [])].join(" ") }));
  }
  return within(await canvas.findByRole("group", { name }));
}

/** 「時刻を選んで足す」から、時刻と本数を選んでバーを足す。PCとスマートフォンで同じ操作になる。 */
async function addBarsByForm(
  canvasElement: HTMLElement,
  positionName: string,
  input: { start: string; end: string; count: string },
) {
  const body = within(canvasElement.ownerDocument.body);
  const section = within(await within(canvasElement).findByRole("region", { name: `${positionName}のバー` }));
  await userEvent.click(section.getByRole("button", { name: "時刻を選んで足す" }));
  const dialog = within(await body.findByRole("dialog", { name: `${positionName}のバーを足す` }));
  await userEvent.selectOptions(dialog.getByRole("combobox", { name: "開始" }), input.start);
  await userEvent.selectOptions(dialog.getByRole("combobox", { name: "終了" }), input.end);
  await userEvent.selectOptions(dialog.getByRole("combobox", { name: "足す本数" }), input.count);
  await userEvent.click(dialog.getByRole("button", { name: "足す" }));
  await waitFor(() =>
    expect(body.queryByRole("dialog", { name: `${positionName}のバーを足す` })).not.toBeInTheDocument(),
  );
}

/**
 * スタッフの、1つのポジションの値を変える。
 * PCは表のマスのメニュー、スマートフォンは行を開いた中の選択肢で選ぶ。
 */
async function changeStaffLevel(
  canvasElement: HTMLElement,
  target: { staff: string; position: string; level: string },
) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  const table = canvas.queryByRole("table", { name: "スタッフ" });
  if (table) {
    const row = within(within(table).getByRole("row", { name: target.staff }));
    await userEvent.click(row.getByRole("button", { name: new RegExp(`^${target.staff} ${target.position} `) }));
    await userEvent.click(await body.findByRole("menuitemradio", { name: target.level }));
    await waitFor(() => expect(body.queryByRole("menu")).not.toBeInTheDocument());
    return;
  }
  const card = await openStaffCard(canvas, target.staff);
  await userEvent.click(
    within(card.getByRole("radiogroup", { name: target.position })).getByRole("radio", { name: target.level }),
  );
}

/** スマートフォンで、スタッフの行を開く。すでに開いていれば、そのまま返す。 */
async function openStaffCard(canvas: Canvas, staff: string) {
  const card = within(canvas.getByRole("group", { name: staff }));
  const toggle = card.getByRole("button", { name: new RegExp(`^${staff}`) });
  if (toggle.getAttribute("aria-expanded") !== "true") await userEvent.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "true"));
  return card;
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

/**
 * 「できあがる必要人数」の、ポジションの行の内容を返す。
 * PCではバーの表の下の行、スマートフォンではバーの表のポジションのグループの中の行にあたる。
 */
function getRequiredCounts(canvas: Canvas, positionName: string) {
  return within(canvas.getByRole("list", { name: `${positionName}の必要人数` }))
    .getAllByRole("listitem")
    .map((item) => item.getAttribute("aria-label"));
}

// ---- 見た目: 操作のあとの状態 ----

export const PendingChanges: Story = {
  name: "保存していない変更あり",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      within(canvas.getByRole("group", { name: "通常" })).getByRole("button", { name: "日曜日・土日で使用中" }),
    );
    await changeStaffLevel(canvasElement, { staff: "高橋 美咲", position: "レジ", level: "新人" });
    await expectPendingChanges(canvasElement);
  },
};

const createFirstTemplate: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "型を作る" }));

  const template = within(await canvas.findByRole("group", { name: "通常" }));
  // 定休日の水曜を除く営業日が、最初から選ばれている。
  await expect(template.getByRole("button", { name: "月曜日" })).toHaveAttribute("aria-pressed", "true");
  await expect(template.getByRole("button", { name: "水曜日・定休日" })).toHaveAttribute("aria-pressed", "false");
  await expect(template.getByRole("button", { name: "祝日" })).toHaveAttribute("aria-pressed", "false");
  // 型が1つだけのときは、コピー元がないのでコピーの操作を出さず、選ぶ相手がないのでセレクトも出さない。
  await expect(template.queryByRole("button", { name: "ほかの型からコピー" })).not.toBeInTheDocument();
  await expect(canvas.queryByRole("combobox", { name: "編集する型" })).not.toBeInTheDocument();
  // 作った型の名前の欄へ移り、初期値をそのまま打ち替えられる。
  const name = template.getByRole("textbox", { name: "型の名前" });
  await waitFor(() => expect(name).toHaveFocus());
  // まだ何も入れていない間は、保存の帯を出さない。
  await expectNoPendingChanges(canvasElement);
  await expect(readRemoteCalls(canvasElement)).toEqual([]);
};

export const FirstTemplateCreated: Story = {
  name: "最初の型を作った直後",
  args: { setup: { ...notConfiguredSetup, positions } },
  play: createFirstTemplate,
};

export const CopyDialog: Story = {
  name: "ほかの型からコピー",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "ほかの型からコピー" }));
    const dialog = await body.findByRole("dialog", { name: "ほかの型からコピー" });
    await waitFor(() => expect(dialog).toBeVisible());
  },
};

export const RemoveDialog: Story = {
  name: "型の削除の確認",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "この型を削除" }));
    const dialog = await body.findByRole("alertdialog", { name: "型を削除" });
    await waitFor(() => expect(dialog).toBeVisible());
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

export const MobileOutsideRange: Story = {
  ...mobile2,
  name: "モバイル414px・受付時間の外にバーが残っている",
  args: { setup: outsideRangeSetup },
};

export const MobileRequiresReentry: Story = {
  ...mobile1,
  name: "モバイル320px・入れ直しが必要",
  args: { setup: requiresReentrySetup },
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

export const MobileStaffRowOpen: Story = {
  ...mobile1,
  name: "モバイル320px・スタッフの行を開いた状態",
  play: async ({ canvasElement }) => {
    // 鈴木はキッチンに入れない。開くと、ポジションごとの4択が出る。
    const card = await openStaffCard(within(canvasElement), "鈴木 次郎");
    await expect(
      within(card.getByRole("radiogroup", { name: "キッチン" })).getByRole("radio", { name: "入れない" }),
    ).toBeChecked();
  },
};

export const MobileFirstTemplateCreated: Story = {
  ...mobile1,
  name: "モバイル320px・最初の型を作った直後",
  args: FirstTemplateCreated.args,
  play: createFirstTemplate,
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

export const MobileCopyDialog: Story = {
  ...mobile1,
  name: "モバイル320px・ほかの型からコピー",
  play: CopyDialog.play,
};

// ---- Behavior: 型の切り替えと追加 ----

const switchTemplates: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);

  // 「通常」の名前を変えてから別の型へ移り、戻っても、変えた名前が残っている。
  // 名前の欄は、入ったときに全体が選ばれるため、消さずにそのまま打ち替えられる。
  const weekday = within(canvas.getByRole("group", { name: "通常" }));
  await userEvent.type(weekday.getByRole("textbox", { name: "型の名前" }), "通常の日");
  const weekend = await selectTemplate(canvas, "土日", "土・日");
  await expect(weekend.getByRole("textbox", { name: "型の名前" })).toHaveValue("土日");
  await expect(weekend.getByRole("button", { name: "土曜日" })).toHaveAttribute("aria-pressed", "true");
  await expect(canvas.queryByRole("group", { name: "通常の日" })).not.toBeInTheDocument();

  const renamed = await selectTemplate(canvas, "通常の日", "月・火・木・金");
  await expect(renamed.getByRole("textbox", { name: "型の名前" })).toHaveValue("通常の日");

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
  await expect(readSavedTemplates(canvasElement)[0].map((template) => [template.id, template.name])).toEqual([
    [weekdayTemplateId, "通常の日"],
    [weekendTemplateId, "土日"],
    [holidayTemplateId, "祝日"],
  ]);
};

export const SwitchTemplateBehavior: Story = {
  name: "Behavior: 型を切り替えても下書きが残る",
  parameters: { screenshot: { skip: true } },
  play: switchTemplates,
};

export const MobileSwitchTemplateBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでもセレクトで型を切り替えられる",
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    // スマートフォンでは型の一覧を出さず、セレクトで切り替える。
    await expect(within(context.canvasElement).queryByRole("list", { name: "型の一覧" })).not.toBeInTheDocument();
    await switchTemplates(context);
  },
};

export const MobileSingleTemplateBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルで型が1つのときはセレクトを出さず、型を足すと出る",
  args: { setup: dateOnlySetup },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = canvas.getByRole("group", { name: "通常" });
    await expect(canvas.queryByRole("combobox", { name: "編集する型" })).not.toBeInTheDocument();
    // 「型を追加」は、型の編集のあとに置く。
    const addButton = canvas.getByRole("button", { name: "型を追加" });
    await expect(editor.compareDocumentPosition(addButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(addButton);

    // 型が2つになると、どの型を編集しているかをセレクトで示す。
    await expect(await canvas.findByRole("combobox", { name: "編集する型" })).toHaveDisplayValue("型2（土・日）");
    await expect(canvas.getByRole("group", { name: "型2" })).toBeVisible();
  },
};

const addTemplate: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "型を追加" }));

  // 足した型がそのまま開く。曜日はすべて別の型か定休日なので、曜日も祝日も選ばれていない。
  const added = within(await canvas.findByRole("group", { name: "型4" }));
  await expect(added.getByRole("button", { name: "月曜日・通常で使用中" })).toHaveAttribute("aria-pressed", "false");
  await expect(added.getByRole("button", { name: "祝日・祝日で使用中" })).toHaveAttribute("aria-pressed", "false");
  await expect(added.getByText(/曜日も祝日も選ばない型は、シフト表で日付を選んで当てられます。/)).toBeVisible();

  // 足しただけでは保存の帯を出さない。名前の欄へ移り、初期値を選んだ状態になる。
  await expectNoPendingChanges(canvasElement);
  const name = added.getByRole<HTMLInputElement>("textbox", { name: "型の名前" });
  await waitFor(() => expect(name).toHaveFocus());
  await expect([name.selectionStart, name.selectionEnd]).toEqual([0, "型4".length]);

  // 初期値を消さずに、そのまま打ち替えられる。名前を入れると、保存の帯が出る。
  await userEvent.keyboard("年末年始");
  const renamed = within(await canvas.findByRole("group", { name: "年末年始" }));
  await expectPendingChanges(canvasElement);
  await userEvent.click(renamed.getByRole("button", { name: "水曜日・定休日" }));

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
  // 足した型はidを持たず、空の必要人数で保存される。
  await expect(readSavedTemplates(canvasElement)[0].at(-1)).toEqual({
    name: "年末年始",
    weekdays: ["wed"],
    appliesToHolidays: false,
    requirements: { kind: "time", bars: [] },
  });
  await expect(readSavedTemplates(canvasElement)[0]).toHaveLength(4);
  // 保存したあとも、足した型を開いたままにする。
  await expect(await canvas.findByRole("group", { name: "年末年始" })).toBeVisible();
};

export const AddTemplateBehavior: Story = {
  name: "Behavior: 型を足して保存する",
  parameters: { screenshot: { skip: true } },
  play: addTemplate,
};

export const MobileAddTemplateBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでも型を足して保存する",
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
  name: "Behavior: 最初の型を作った直後は帯を出さず、何か入れると帯が出て保存できる",
  args: FirstTemplateCreated.args,
  parameters: { screenshot: { skip: true } },
  play: createFirstTemplateAndSave,
};

export const MobileCreateFirstTemplateBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでも最初の型を作った直後は帯を出さず、何か入れると保存できる",
  args: FirstTemplateCreated.args,
  parameters: { screenshot: { skip: true } },
  play: createFirstTemplateAndSave,
};

export const RemoveTemplateBehavior: Story = {
  name: "Behavior: 型を削除すると、確かめてから一覧から外れる",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const weekend = await selectTemplate(canvas, "土日", "土・日");

    await userEvent.click(weekend.getByRole("button", { name: "この型を削除" }));
    const confirmation = within(await body.findByRole("alertdialog", { name: "型を削除" }));
    await userEvent.click(confirmation.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(body.queryByRole("alertdialog", { name: "型を削除" })).not.toBeInTheDocument());
    await expect(canvas.getByRole("group", { name: "土日" })).toBeVisible();

    await userEvent.click(weekend.getByRole("button", { name: "この型を削除" }));
    await userEvent.click(
      within(await body.findByRole("alertdialog", { name: "型を削除" })).getByRole("button", { name: "削除する" }),
    );

    // 削除した型のすぐ下にあった型を開く。
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

export const WeekdayMoveBehavior: Story = {
  name: "Behavior: 別の型の曜日を押すと、その型へ移る",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const weekend = await selectTemplate(canvas, "土日", "土・日");

    await userEvent.click(weekend.getByRole("button", { name: "金曜日・通常で使用中" }));
    await expect(weekend.getByRole("button", { name: "金曜日" })).toHaveAttribute("aria-pressed", "true");

    const weekday = await selectTemplate(canvas, "通常", "月・火・木");
    await expect(weekday.getByRole("button", { name: "金曜日・土日で使用中" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await saveChanges(canvasElement);
    await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
    await expect(readSavedTemplates(canvasElement)[0].map((template) => [template.name, template.weekdays])).toEqual([
      ["通常", ["mon", "tue", "thu"]],
      ["土日", ["sun", "fri", "sat"]],
      ["祝日", []],
    ]);
  },
};

const moveHoliday: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const weekend = await selectTemplate(canvas, "土日", "土・日");

  // 祝日は「祝日」の型が使っている。押すと「土日」へ移る。
  await userEvent.click(weekend.getByRole("button", { name: "祝日・祝日で使用中" }));
  await expect(weekend.getByRole("button", { name: "祝日" })).toHaveAttribute("aria-pressed", "true");

  const holiday = await selectTemplate(canvas, "祝日", "個別に当てる");
  await expect(holiday.getByRole("button", { name: "祝日・土日で使用中" })).toHaveAttribute("aria-pressed", "false");

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
  await expect(
    readSavedTemplates(canvasElement)[0].map((template) => [template.name, template.appliesToHolidays]),
  ).toEqual([
    ["通常", false],
    ["土日", true],
    ["祝日", false],
  ]);
};

export const HolidayBehavior: Story = {
  name: "Behavior: 祝日を選ぶと、別の型から移って保存される",
  parameters: { screenshot: { skip: true } },
  play: moveHoliday,
};

export const MobileHolidayBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでも祝日を選んで保存する",
  parameters: { screenshot: { skip: true } },
  play: moveHoliday,
};

// ---- Behavior: 必要人数 ----

const addBarsAndSave: Story["play"] = async ({ canvasElement }) => {
  await addBarsByForm(canvasElement, "キッチン", { start: "17:00", end: "21:00", count: "2" });

  await expectPendingChanges(canvasElement);
  await expect(readRemoteCalls(canvasElement)).toEqual([]);
  await saveChanges(canvasElement);

  await expectNoPendingChanges(canvasElement);
  const calls = readRemoteCalls(canvasElement);
  await expect(calls.map((call) => call.name)).toEqual(["saveDayTemplates"]);
  const [savedWeekday] = readSavedTemplates(canvasElement)[0];
  await expect(savedWeekday.id).toBe(weekdayTemplateId);
  // 足した2本が、同じ時間のバーとして保存の引数に入る。ほかのバーは変わらない。
  await expect(
    savedWeekday.requirements.kind === "time"
      ? savedWeekday.requirements.bars.filter((item) => item.positionId === kitchenId)
      : null,
  ).toEqual([
    bar(kitchenId, "09:00", "22:00"),
    bar(kitchenId, "11:00", "14:00"),
    bar(kitchenId, "17:00", "21:00"),
    bar(kitchenId, "17:00", "21:00"),
    bar(kitchenId, "18:00", "21:00"),
  ]);
  await expect(savedWeekday.requirements.kind === "time" ? savedWeekday.requirements.bars.length : null).toBe(
    weekdayBars.length + 2,
  );
};

export const TimeBarBehavior: Story = {
  name: "Behavior: バーを足すと、できあがる必要人数が変わり、保存の引数に入る",
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    const canvas = within(context.canvasElement);
    await expect(getRequiredCounts(canvas, "キッチン")).toEqual([
      "09:00〜11:00 1人",
      "11:00〜14:00 2人",
      "14:00〜18:00 1人",
      "18:00〜21:00 2人",
      "21:00〜22:00 1人",
    ]);
    await addBarsAndSave(context);
    await expect(getRequiredCounts(canvas, "キッチン")).toEqual([
      "09:00〜11:00 1人",
      "11:00〜14:00 2人",
      "14:00〜17:00 1人",
      "17:00〜18:00 3人",
      "18:00〜21:00 4人",
      "21:00〜22:00 1人",
    ]);
  },
};

export const MobileTimeBarBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでも時刻を選んでバーを足し、保存する",
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    await addBarsAndSave(context);
    // スマートフォンでもバーの表を出し、できあがる必要人数をポジションのグループの中に出す。
    await expect(getRequiredCounts(within(context.canvasElement), "キッチン")).toEqual([
      "09:00〜11:00 1人",
      "11:00〜14:00 2人",
      "14:00〜17:00 1人",
      "17:00〜18:00 3人",
      "18:00〜21:00 4人",
      "21:00〜22:00 1人",
    ]);
  },
};

const trimOutsideRangeAndSave: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const template = within(canvas.getByRole("group", { name: "通常" }));

  // 外に出たバーを残したまま保存を試すと、保存されず、その型に誤りが出る。
  await userEvent.click(template.getByRole("button", { name: "日曜日" }));
  await saveChanges(canvasElement);
  await expect(await template.findByRole("alert")).toHaveTextContent("受付時間の外に出ているバーがあります");
  await expect(readRemoteCalls(canvasElement)).toEqual([]);

  await userEvent.click(template.getByRole("button", { name: "受付時間に合わせる" }));
  await waitFor(() => expect(template.queryByRole("alert")).not.toBeInTheDocument());
  await expect(template.queryByText("受付時間の外にあるバーが3本あります")).not.toBeInTheDocument();

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedTemplates(canvasElement)).toHaveLength(1));
  // 完全に外のバーは消え、端をまたぐバーは内側だけが残る。
  await expect(readSavedTemplates(canvasElement)[0][0].requirements).toEqual({
    kind: "time",
    bars: [bar(hallId, "09:00", "12:00"), bar(kitchenId, "11:00", "14:00"), bar(kitchenId, "18:00", "22:00")],
  });
};

export const TrimOutsideRangeBehavior: Story = {
  name: "Behavior: 範囲の外のバーは、切りそろえてから保存できる",
  args: { setup: outsideRangeSetup },
  parameters: { screenshot: { skip: true } },
  play: trimOutsideRangeAndSave,
};

export const MobileTrimOutsideRangeBehavior: Story = {
  ...mobile2,
  name: "Behavior: モバイルでも範囲の外のバーを切りそろえて保存できる",
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
  ...mobile1,
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
  ...mobile1,
  name: "Behavior: モバイルでも日付選択の数字を打って保存する",
  args: { setup: dateOnlySetup },
  parameters: { screenshot: { skip: true } },
  play: typeDateOnlyCountsAndSave,
};

export const ReentryBehavior: Story = {
  name: "Behavior: 入れ直しの知らせは、人数を入れると消える",
  args: { setup: requiresReentrySetup },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const template = within(canvas.getByRole("group", { name: "通常" }));
    const notice = "希望シフトの集め方を変えたため、必要人数を入れ直してください";
    await expect(template.getByText(notice)).toBeVisible();

    await userEvent.type(template.getByRole("spinbutton", { name: "1日のホールの必要人数" }), "3");

    await waitFor(() => expect(template.queryByText(notice)).not.toBeInTheDocument());
    // まだ入れ直していない別の型には、知らせが残る。
    const weekend = await selectTemplate(canvas, "土日", "土・日", "入れ直し");
    await expect(weekend.getByText(notice)).toBeVisible();
  },
};

const copyRequirements: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  const holiday = await selectTemplate(canvas, "祝日", "祝日");

  await userEvent.click(holiday.getByRole("button", { name: "ほかの型からコピー" }));
  const dialog = within(await body.findByRole("dialog", { name: "ほかの型からコピー" }));
  await userEvent.selectOptions(dialog.getByRole("combobox", { name: "コピーする型" }), "土日");
  await userEvent.click(dialog.getByRole("button", { name: "コピーする" }));
  await waitFor(() => expect(body.queryByRole("dialog", { name: "ほかの型からコピー" })).not.toBeInTheDocument());
  // 見えている範囲がほとんど変わらないため、どの型から写したかを通知で伝える。
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
  name: "Behavior: ほかの型からコピーすると、必要人数が置き換わる",
  parameters: { screenshot: { skip: true } },
  play: copyRequirements,
};

export const MobileCopyRequirementsBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでもほかの型からコピーできる",
  parameters: { screenshot: { skip: true } },
  play: copyRequirements,
};

// ---- Behavior: 保存 ----

export const ValidationBehavior: Story = {
  name: "Behavior: 誤りのある型を開いて、その型に誤りを出す",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const weekend = await selectTemplate(canvas, "土日", "土・日");
    await userEvent.clear(weekend.getByRole("textbox", { name: "型の名前" }));
    // 入力の途中では誤りを出さない。
    const unnamed = within(await canvas.findByRole("group", { name: "名前のない型" }));
    await expect(unnamed.queryByRole("alert")).not.toBeInTheDocument();

    await selectTemplate(canvas, "通常", "月・火・木・金");
    await saveChanges(canvasElement);

    // 保存を試すと、誤りのある型へ切り替わり、その型の中に誤りが出る。
    const invalid = within(await canvas.findByRole("group", { name: "名前のない型" }));
    await expect(await invalid.findByRole("alert")).toHaveTextContent("型の名前を入力してください");
    await expect(
      within(canvas.getByRole("list", { name: "型の一覧" })).getByRole("button", {
        name: "名前のない型 土・日 要確認",
      }),
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
    await userEvent.click(
      within(canvas.getByRole("group", { name: "通常" })).getByRole("button", { name: "祝日・祝日で使用中" }),
    );
    await expectPendingChanges(canvasElement);
    const pendingBar = getSaveActions(canvasElement);
    const saveButton = pendingBar.getByRole("button", { name: "保存する" });

    await userEvent.click(saveButton);
    await waitFor(() => expect(saveButton).toBeDisabled());
    await expect(pendingBar.getByRole("button", { name: "元に戻す" })).toBeDisabled();
    saveButton.click();
    await expect(readRemoteCalls(canvasElement)).toHaveLength(1);

    // 応答を待っている間は、型とスタッフを操作できない。待っている間の編集が、応答のあとで消えないようにするためである。
    const templates = canvas.getByRole("region", { name: "必要人数" });
    const staffSection = canvas.getByRole("region", { name: "スタッフ" });
    await expect(templates).toHaveAttribute("inert");
    await expect(staffSection).toHaveAttribute("inert");
    // ポジションは、Dialogで別に保存するため止めない。
    await expect(canvas.getByRole("region", { name: "ポジション" })).not.toHaveAttribute("inert");
    const name = within(templates).getByRole("textbox", { name: "型の名前" });
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

export const ResetChangesBehavior: Story = {
  name: "Behavior: 元に戻すと保存済みの内容へ戻る",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "型を追加" }));
    const added = within(await canvas.findByRole("group", { name: "型4" }));
    // 足しただけでは帯を出さない。使う日を選ぶと帯が出る。
    await expectNoPendingChanges(canvasElement);
    await userEvent.click(added.getByRole("button", { name: "水曜日・定休日" }));

    await expectPendingChanges(canvasElement);
    await userEvent.click(getSaveActions(canvasElement).getByRole("button", { name: "元に戻す" }));
    const confirmation = await body.findByRole("alertdialog", { name: "変更を元に戻す" });
    await userEvent.click(within(confirmation).getByRole("button", { name: "元に戻す" }));

    // 足した型はなくなり、残っている型を開く。
    await waitFor(() => expect(canvas.queryByRole("group", { name: "型4" })).not.toBeInTheDocument());
    await expect(await canvas.findByRole("group", { name: "祝日" })).toBeVisible();
    await expectNoPendingChanges(canvasElement);
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

  // 下書きの先頭の型が開く。
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
  // 下書きは、バーの形で保存の引数に入る。
  await expect(
    saved[0].requirements.kind === "time"
      ? saved[0].requirements.bars.filter((item) => item.positionId === kitchenId)
      : null,
  ).toEqual([bar(kitchenId, "09:00", "22:00"), bar(kitchenId, "11:00", "14:00"), bar(kitchenId, "17:00", "21:00")]);
};

export const AssistDraftBehavior: Story = {
  name: "Behavior: AIの下書きは表に入るだけで、保存するまで保存されない",
  args: { setup: { ...notConfiguredSetup, positions } },
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    await applyAssistDraft(context);
    await expect(getRequiredCounts(within(context.canvasElement), "キッチン")).toEqual([
      "09:00〜11:00 1人",
      "11:00〜14:00 2人",
      "14:00〜17:00 1人",
      "17:00〜21:00 2人",
      "21:00〜22:00 1人",
    ]);
  },
};

export const MobileAssistDraftBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでもAIの下書きが表に入る",
  args: { setup: { ...notConfiguredSetup, positions } },
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    await applyAssistDraft(context);
    // スマートフォンでも、下書きのバーから決まる必要人数が、ポジションのグループの中に出る。
    await expect(getRequiredCounts(within(context.canvasElement), "キッチン")).toEqual([
      "09:00〜11:00 1人",
      "11:00〜14:00 2人",
      "14:00〜17:00 1人",
      "17:00〜21:00 2人",
      "21:00〜22:00 1人",
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
    await waitFor(() => expect(canvas.getByRole("group", { name: "通常" })).toBeVisible());
    await expectNoPendingChanges(canvasElement);
  },
};

// ---- Behavior: ポジション ----

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
    // 最初からあるポジションも、ほかのポジションと同じように並び替えと削除ができる。
    await expect(dialog.getByRole("button", { name: "ホールを削除" })).toBeEnabled();
    await expect(dialog.getByRole("button", { name: "ホールを下へ移動" })).toBeEnabled();
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

export const PositionLastOneBehavior: Story = {
  name: "Behavior: ポジションが1件のときは削除できず、2件になると最初の1件も削除できる",
  args: { setup: notConfiguredSetup },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const section = within(canvas.getByRole("region", { name: "ポジション" }));
    await userEvent.click(section.getByRole("button", { name: "編集する" }));
    const dialog = within(await body.findByRole("dialog", { name: "ポジションを編集" }));

    await expect(dialog.getByRole("button", { name: "シフトを削除" })).toBeDisabled();
    await waitFor(() =>
      expect(dialog.getByText("ポジションは1件以上必要なため、最後の1件は削除できません")).toBeVisible(),
    );

    await userEvent.click(dialog.getByRole("button", { name: "ポジションを追加" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "ポジション2の名前" }), "キッチン");
    await userEvent.click(dialog.getByRole("button", { name: "シフトを削除" }));

    await expect(dialog.queryByRole("textbox", { name: "ポジション2の名前" })).not.toBeInTheDocument();
    await expect(dialog.getByRole("textbox", { name: "ポジション1の名前" })).toHaveValue("キッチン");
    await expect(dialog.getByText(/削除したポジションの勤務は、シフト表で「キッチン/)).toBeVisible();
  },
};

// ---- Behavior: スタッフ ----

type SavedStaffProfile = { staffId: string; positionSkills: Array<{ positionId: string; level: string }> };

function readSavedStaffProfiles(canvasElement: HTMLElement): SavedStaffProfile[][] {
  return readRemoteCalls(canvasElement)
    .filter((call) => call.name === "saveStaffShiftProfiles")
    .map((call) => call.args as SavedStaffProfile[]);
}

const changeStaffLevelsAndSave: Story["play"] = async ({ canvasElement }) => {
  // 佐藤: キッチンに入れない、レジは新人にする。保存済みのホールの責任者は変えない。
  await changeStaffLevel(canvasElement, { staff: "佐藤 花子", position: "キッチン", level: "入れない" });
  await changeStaffLevel(canvasElement, { staff: "佐藤 花子", position: "レジ", level: "新人" });
  // 鈴木: 入れなかったキッチンを、標準へ戻す。
  await changeStaffLevel(canvasElement, { staff: "鈴木 次郎", position: "キッチン", level: "標準" });
  // 高橋: 変えてから標準へ戻したスタッフは、変更に数えない。
  await changeStaffLevel(canvasElement, { staff: "高橋 美咲", position: "ホール", level: "責任者" });
  await changeStaffLevel(canvasElement, { staff: "高橋 美咲", position: "ホール", level: "標準" });

  await expectPendingChanges(canvasElement);
  await saveChanges(canvasElement);

  await waitFor(() => expect(readRemoteCalls(canvasElement)).toHaveLength(1));
  // 変えた2人だけを、ポジションの並び順で保存する。標準は送らない。
  await expect(readRemoteCalls(canvasElement)).toEqual([
    {
      name: "saveStaffShiftProfiles",
      args: [
        {
          staffId: "staff-1",
          positionSkills: [
            { positionId: hallId, level: "lead" },
            { positionId: kitchenId, level: "unavailable" },
            { positionId: registerId, level: "newcomer" },
          ],
        },
        { staffId: "staff-2", positionSkills: [] },
      ],
    },
  ]);
  await expectNoPendingChanges(canvasElement);
};

export const StaffLevelBehavior: Story = {
  name: "Behavior: 表のマスのメニューで値を変えて保存する",
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    await changeStaffLevelsAndSave(context);
    // 保存したあとも、マスに選んだ値が出ている。
    const row = within(within(context.canvasElement).getByRole("row", { name: "佐藤 花子" }));
    await expect(row.getByRole("button", { name: "佐藤 花子 キッチン 入れない" })).toBeVisible();
    await expect(row.getByRole("button", { name: "佐藤 花子 レジ 新人" })).toBeVisible();
  },
};

export const MobileStaffLevelBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでは行を開いて4択で選び、保存する",
  parameters: { screenshot: { skip: true } },
  play: async (context) => {
    const canvas = within(context.canvasElement);
    // スマートフォンでは表を出さず、閉じた行に標準以外の値だけを示す。
    await expect(canvas.queryByRole("table", { name: "スタッフ" })).not.toBeInTheDocument();
    const sato = within(canvas.getByRole("group", { name: "佐藤 花子" }));
    await expect(sato.getByRole("button", { name: "佐藤 花子 ホール 責任者" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(
      within(canvas.getByRole("group", { name: "高橋 美咲" })).getByRole("button", { name: "高橋 美咲 すべて標準" }),
    ).toBeVisible();

    await changeStaffLevelsAndSave(context);

    // 閉じても、選んだ値が行に出ている。
    await userEvent.click(sato.getByRole("button", { name: /^佐藤 花子/ }));
    await expect(
      sato.getByRole("button", { name: "佐藤 花子 ホール 責任者 キッチン 入れない レジ 新人" }),
    ).toHaveAttribute("aria-expanded", "false");
  },
};

export const StaffLastPositionBehavior: Story = {
  name: "Behavior: 最後に残った入れるポジションは、入れないを選べず理由が出る",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    // 鈴木はキッチンに入れない。レジも入れないにすると、入れるのはホールだけになる。
    await changeStaffLevel(canvasElement, { staff: "鈴木 次郎", position: "レジ", level: "入れない" });

    const row = within(canvas.getByRole("row", { name: "鈴木 次郎" }));
    await userEvent.click(row.getByRole("button", { name: "鈴木 次郎 ホール 標準" }));
    const menu = within(await body.findByRole("menu"));
    await expect(menu.getByRole("menuitemradio", { name: "入れない" })).toHaveAttribute("aria-disabled", "true");
    // メニューが開ききるまで待つ。
    await waitFor(() => expect(menu.getByText("入れるポジションは1つ以上必要です")).toBeVisible());
    // 新人と責任者には変えられる。
    await userEvent.click(menu.getByRole("menuitemradio", { name: "責任者" }));
    await expect(await row.findByRole("button", { name: "鈴木 次郎 ホール 責任者" })).toBeVisible();

    // 入れるポジションが2つある佐藤のメニューには、理由を出さない。
    await userEvent.click(
      within(canvas.getByRole("row", { name: "佐藤 花子" })).getByRole("button", { name: "佐藤 花子 ホール 責任者" }),
    );
    const satoMenu = within(await body.findByRole("menu"));
    await expect(satoMenu.getByRole("menuitemradio", { name: "入れない" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(satoMenu.queryByText("入れるポジションは1つ以上必要です")).not.toBeInTheDocument();
  },
};

export const MobileStaffLastPositionBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでも最後の1つは入れないを選べず、理由が出る",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await changeStaffLevel(canvasElement, { staff: "鈴木 次郎", position: "レジ", level: "入れない" });

    const card = await openStaffCard(canvas, "鈴木 次郎");
    const hall = within(card.getByRole("radiogroup", { name: "ホール" }));
    await expect(hall.getByRole("radio", { name: "入れない" })).toBeDisabled();
    await expect(hall.getByRole("radio", { name: "新人" })).toBeEnabled();
    await expect(card.getByText("入れるポジションは1つ以上必要です")).toBeVisible();
    // すでに入れないポジションは、標準へ戻せる。
    await expect(
      within(card.getByRole("radiogroup", { name: "レジ" })).getByRole("radio", { name: "標準" }),
    ).toBeEnabled();
  },
};

/** ポジションのバッジのメニューから、全員の値をまとめて変える。 */
async function setLevelForAll(canvasElement: HTMLElement, position: string, item: string) {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(within(canvasElement).getByRole("button", { name: `${position}をまとめて設定` }));
  await userEvent.click(await body.findByRole("menuitem", { name: item }));
  await waitFor(() => expect(body.queryByRole("menu")).not.toBeInTheDocument());
}

const setLevelsForAllAndSave: Story["play"] = async ({ canvasElement }) => {
  const body = within(canvasElement.ownerDocument.body);
  // 高橋が入れるのは、キッチンだけにする。
  await changeStaffLevel(canvasElement, { staff: "高橋 美咲", position: "ホール", level: "入れない" });
  await changeStaffLevel(canvasElement, { staff: "高橋 美咲", position: "レジ", level: "入れない" });

  // 全員をキッチンに入れないにすると、入れるポジションがなくなる高橋だけは変えず、人数を伝える。
  await setLevelForAll(canvasElement, "キッチン", "全員を入れないにする");
  await expect(await body.findByText("入れるポジションがなくなる1人は変えていません")).toBeVisible();
  // レジは、全員を標準へ戻す。高橋のレジも入れるようになる。
  await setLevelForAll(canvasElement, "レジ", "全員を標準にする");

  await saveChanges(canvasElement);
  await waitFor(() => expect(readSavedStaffProfiles(canvasElement)).toHaveLength(1));
  const kitchenUnavailable = { positionId: kitchenId, level: "unavailable" };
  // 保存済みの値と変わらない鈴木（もとからキッチンに入れない）は送らない。
  await expect(readSavedStaffProfiles(canvasElement)[0]).toEqual([
    { staffId: "staff-1", positionSkills: [{ positionId: hallId, level: "lead" }, kitchenUnavailable] },
    { staffId: "staff-3", positionSkills: [{ positionId: hallId, level: "unavailable" }] },
    { staffId: "staff-4", positionSkills: [kitchenUnavailable] },
    { staffId: "staff-5", positionSkills: [{ positionId: hallId, level: "newcomer" }, kitchenUnavailable] },
    { staffId: "staff-6", positionSkills: [kitchenUnavailable] },
  ]);
};

export const StaffBulkLevelBehavior: Story = {
  name: "Behavior: 列の見出しから、全員の値をまとめて変える",
  parameters: { screenshot: { skip: true } },
  play: setLevelsForAllAndSave,
};

export const MobileStaffBulkLevelBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでも一覧の上のバッジから、全員の値をまとめて変える",
  parameters: { screenshot: { skip: true } },
  play: setLevelsForAllAndSave,
};

const filterStaffs: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const section = within(canvas.getByRole("region", { name: "スタッフ" }));
  const filter = section.getByRole("searchbox", { name: "名前で絞り込む" });
  const getStaffNames = () =>
    staffNames.filter((name) => section.queryByRole(section.queryByRole("table") ? "row" : "group", { name }) !== null);

  // 空白の有無を区別せずに絞り込む。
  await userEvent.type(filter, "鈴木次");
  await waitFor(() => expect(getStaffNames()).toEqual(["鈴木 次郎"]));

  await userEvent.clear(filter);
  await userEvent.type(filter, "山田");
  await expect(await section.findByText("条件に合うスタッフがいません")).toBeVisible();
  await expect(getStaffNames()).toEqual([]);

  await userEvent.click(section.getByRole("button", { name: "絞り込みを解除" }));
  await waitFor(() => expect(getStaffNames()).toEqual(staffNames));
  await expect(filter).toHaveValue("");
};

export const StaffFilterBehavior: Story = {
  name: "Behavior: 名前で絞り込み、0件のときは解除できる",
  parameters: { screenshot: { skip: true } },
  play: filterStaffs,
};

export const MobileStaffFilterBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでも名前で絞り込める",
  parameters: { screenshot: { skip: true } },
  play: filterStaffs,
};

export const SinglePositionStaffBehavior: Story = {
  name: "Behavior: ポジションが1件の店舗では、熟練度だけを3つから選ぶ",
  args: { setup: notConfiguredSetup },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const table = within(canvas.getByRole("table", { name: "スタッフ" }));
    // 列は「熟練度」の1つで、まとめて設定は出さない。
    await expect(table.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["名前", "熟練度"]);
    await expect(table.queryByRole("button", { name: "シフトをまとめて設定" })).not.toBeInTheDocument();

    await userEvent.click(table.getByRole("button", { name: "佐藤 花子 シフト 標準" }));
    const menu = within(await body.findByRole("menu"));
    await expect(menu.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "新人",
      "標準",
      "責任者",
    ]);
    await userEvent.click(menu.getByRole("menuitemradio", { name: "責任者" }));

    await saveChanges(canvasElement);
    await waitFor(() => expect(readSavedStaffProfiles(canvasElement)).toHaveLength(1));
    await expect(readSavedStaffProfiles(canvasElement)[0]).toEqual([
      { staffId: "staff-1", positionSkills: [{ positionId: hallId, level: "lead" }] },
    ]);
  },
};

export const MobileSinglePositionStaffBehavior: Story = {
  ...mobile1,
  name: "Behavior: モバイルでもポジションが1件の店舗では、熟練度だけを3つから選ぶ",
  args: { setup: notConfiguredSetup },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("group", { name: "まとめて設定" })).not.toBeInTheDocument();
    const card = await openStaffCard(canvas, "伊藤 さくら");
    const levels = within(card.getByRole("radiogroup", { name: "熟練度" }));
    await expect(levels.getAllByRole("radio").map((radio) => radio.closest("label")?.textContent)).toEqual([
      "新人",
      "標準",
      "責任者",
    ]);
    await expect(levels.getByRole("radio", { name: "新人" })).toBeChecked();
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
  // 熟練度の選択肢は、スマートフォンの行を開いた中に出る。
  ...mobile2,
  name: "Behavior: 選択中のボタンにカーソルを載せても、文字が読める",
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = await openStaffCard(canvas, "佐藤 花子");
    const selectedRadio = within(card.getByRole("radiogroup", { name: "ホール" })).getByRole("radio", {
      name: "責任者",
    });
    const selectedDay = within(canvas.getByRole("group", { name: "通常" })).getByRole("button", { name: "月曜日" });
    const targets = [selectedRadio.closest("label"), selectedDay];

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

  await expect(weekday.getByRole("textbox", { name: "型の名前" })).toBeDisabled();
  await expect(weekday.getByRole("button", { name: "月曜日" })).toBeDisabled();
  await expect(weekday.getByRole("button", { name: "祝日・祝日で使用中" })).toBeDisabled();
  await expect(weekday.getByRole("button", { name: "ほかの型からコピー" })).toBeDisabled();
  await expect(weekday.getByRole("button", { name: "この型を削除" })).toBeDisabled();
  // バーを足す操作は出さない。
  await expect(weekday.queryByRole("button", { name: "時刻を選んで足す" })).not.toBeInTheDocument();
  await expect(canvas.getByRole("button", { name: "型を追加" })).toBeDisabled();
  // スタッフの値は読めるが、変えられない。まとめて設定も出さない。
  await expect(canvas.queryByRole("button", { name: "キッチンをまとめて設定" })).not.toBeInTheDocument();
  if (canvas.queryByRole("table", { name: "スタッフ" })) {
    await expect(
      within(canvas.getByRole("row", { name: "鈴木 次郎" })).getByRole("button", {
        name: "鈴木 次郎 キッチン 入れない",
      }),
    ).toBeDisabled();
  } else {
    const card = await openStaffCard(canvas, "鈴木 次郎");
    const kitchen = within(card.getByRole("radiogroup", { name: "キッチン" }));
    await expect(kitchen.getByRole("radio", { name: "入れない" })).toBeChecked();
    for (const radio of kitchen.getAllByRole("radio")) await expect(radio).toBeDisabled();
  }
  for (const editButton of canvas.getAllByRole("button", { name: "編集する" })) {
    await expect(editButton).toBeDisabled();
  }
  await expect(canvas.queryByRole("button", { name: "AIで下書きを作る" })).not.toBeInTheDocument();

  // 型の切り替えは、閲覧専用でもできる。
  const weekend = await selectTemplate(canvas, "土日", "土・日");
  await expect(weekend.getByRole("textbox", { name: "型の名前" })).toHaveValue("土日");
  // 保存できないため、保存の操作は出さない。
  await expect(canvas.queryByRole("group", { name: "変更の保存" })).not.toBeInTheDocument();
};

export const ReadOnlyBehavior: Story = {
  name: "Behavior: 閲覧専用では編集操作が無効になり、型の切り替えだけできる",
  args: ReadOnly.args,
  parameters: { screenshot: { skip: true } },
  play: expectReadOnly,
};

export const MobileReadOnlyBehavior: Story = {
  ...mobile1,
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
