import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { Dialog } from "@/src/components/ui/Dialog";
import { normalizeStaffingSegments, type StaffingSegment } from "@/src/domains/shift/staffingSegments";
import { timeToMinutes } from "@/src/domains/shift/time";
import { StaffingCountBandEditor } from ".";
import { getBandMetrics } from "./script";

type EditorArgs = ComponentProps<typeof StaffingCountBandEditor>;

// ==========================================
// fixture: 受付時間 9:00〜22:00、ホール・キッチン・レジ
// ==========================================
const hall = { id: "hall", name: "ホール", color: "#60a5fa" };
const kitchen = { id: "kitchen", name: "キッチン", color: "#fb923c" };
const register = { id: "register", name: "レジ", color: "#a78bfa" };
const RANGE = { startMinutes: 9 * 60, endMinutes: 22 * 60 };

const seg = (positionId: string, startTime: string, endTime: string, count: number): StaffingSegment => ({
  positionId,
  startTime,
  endTime,
  count,
});

// ホールは昼と夜に増える。キッチンは午後に空く時間がある。レジは開店の1時間後から閉店の2時間前まで1人。
const defaultSegments = normalizeStaffingSegments([
  seg("hall", "09:00", "11:00", 1),
  seg("hall", "11:00", "14:00", 3),
  seg("hall", "14:00", "17:00", 1),
  seg("hall", "17:00", "22:00", 2),
  seg("kitchen", "09:00", "11:00", 1),
  seg("kitchen", "11:00", "14:00", 2),
  seg("kitchen", "17:00", "21:00", 2),
  seg("register", "10:00", "20:00", 1),
]);

// 受付時間を短くしたあとに残る、範囲の外の人数。完全に外の区間と、端をまたぐ区間がある。
const outsideSegments = normalizeStaffingSegments([
  seg("hall", "07:00", "08:00", 1),
  seg("hall", "08:00", "12:00", 2),
  seg("hall", "12:00", "22:00", 1),
  seg("kitchen", "18:00", "23:00", 2),
]);

const tenPositions = [
  hall,
  kitchen,
  register,
  { id: "p04", name: "レジ・テイクアウト受付カウンター", color: "#f472b6" },
  { id: "p05", name: "デリバリー", color: "#eda40a" },
  { id: "p06", name: "洗い場", color: "#14b8a6" },
  { id: "p07", name: "仕込み", color: "#f87171" },
  { id: "p08", name: "ドリンク", color: "#94a3b8" },
  { id: "p09", name: "案内", color: "#78bd14" },
  { id: "p10", name: "清掃", color: "#06b6d4" },
];

const tenPositionSegments = normalizeStaffingSegments([
  ...defaultSegments,
  seg("p04", "11:00", "14:00", 2),
  seg("p04", "17:00", "21:00", 1),
  seg("p05", "17:00", "21:30", 2),
  seg("p06", "12:00", "15:00", 1),
  seg("p06", "19:00", "22:00", 1),
  seg("p07", "09:00", "11:00", 2),
  seg("p08", "18:00", "22:00", 1),
  seg("p10", "09:00", "10:00", 1),
  seg("p10", "21:00", "22:00", 2),
]);

/** 値を持つ側の代わり。 */
const EditorStory = (args: EditorArgs) => {
  const [segments, setSegments] = useState<readonly StaffingSegment[]>(args.segments);
  return <StaffingCountBandEditor {...args} segments={segments} onChange={setSegments} />;
};

const meta = {
  title: "Shared/StaffingCountBandEditor",
  component: StaffingCountBandEditor,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Box maxW="1024px" mx="auto">
        <Story />
      </Box>
    ),
  ],
  render: (args) => <EditorStory {...args} />,
  args: {
    positions: [hall, kitchen, register],
    segments: defaultSegments,
    onChange: () => {},
    range: RANGE,
  },
} satisfies Meta<typeof StaffingCountBandEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

// tagはStorybookが静的に読むため、Storyごとに直接書く。スプレッドで渡したtagは読まれない。
const mobile1Globals = { viewport: { value: "mobile1", isRotated: false } };
const mobile2Globals = { viewport: { value: "mobile2", isRotated: false } };

const behaviorOnly = { screenshot: { skip: true } };

// ==========================================
// 見た目
// ==========================================

/** PC: ポジション1件が1行。同じ人数が続く時間は1つの区間になり、空いた時間には何も出さない。 */
export const Default: Story = {};

/** PC: 人数を1つも入れていない。行の中に案内文を出す。 */
export const Empty: Story = { args: { segments: [] } };

/** PC: ポジションが1件。 */
export const SinglePosition: Story = {
  args: { positions: [hall], segments: defaultSegments.filter((segment) => segment.positionId === "hall") },
};

/** PC: ポジションが10件。長い名前は2行までで省く。 */
export const TenPositions: Story = { args: { positions: tenPositions, segments: tenPositionSegments } };

const fullDayArgs = {
  range: { startMinutes: 5 * 60, endMinutes: 29 * 60 },
  segments: normalizeStaffingSegments([
    seg("hall", "05:00", "11:00", 1),
    seg("hall", "11:00", "14:00", 3),
    seg("hall", "14:00", "29:00", 2),
    seg("kitchen", "06:00", "24:00", 2),
    seg("register", "18:00", "18:30", 10),
  ]),
} satisfies Partial<EditorArgs>;

/** PC: 受付時間が24時間の店舗。1日を幅に収め、24時以降は「翌1:00」の形で出す。 */
export const FullDay: Story = { args: fullDayArgs };

/** PC: 受付時間の外に人数が残っている。上で知らせ、受付時間に合わせる操作を出す。 */
export const OutsideRange: Story = { args: { segments: outsideSegments } };

const halfHourArgs = {
  range: { startMinutes: 9 * 60 + 30, endMinutes: 21 * 60 + 30 },
  segments: normalizeStaffingSegments([
    seg("hall", "09:30", "21:30", 1),
    seg("kitchen", "11:00", "14:30", 2),
    seg("register", "09:30", "10:00", 1),
  ]),
} satisfies Partial<EditorArgs>;

/** PC: 受付時間が30分で始まり30分で終わる。端に残る編集できない時間を灰色にする。 */
export const HalfHourRange: Story = { args: halfHourArgs };

/** PC: 閲覧専用。説明文と「時間を選んで入れる」を出さない。 */
export const ReadOnly: Story = { args: { isReadOnly: true } };

/** PC: 閲覧専用で、人数が入っていない。 */
export const ReadOnlyEmpty: Story = { args: { isReadOnly: true, segments: [] } };

/** スマートフォン: ポジション名を帯の上に置き、帯を画面の幅いっぱいに使う。 */
export const Mobile: Story = { tags: ["vrt-mobile2"], globals: mobile2Globals };

/** スマートフォン（幅320px）: 狭い区間は「人」を省き、数字だけを出す。 */
export const MobileSmall: Story = { tags: ["vrt-mobile1"], globals: mobile1Globals };

export const MobileEmpty: Story = { tags: ["vrt-mobile2"], globals: mobile2Globals, args: { segments: [] } };

export const MobileOutsideRange: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  args: { segments: outsideSegments },
};

export const MobileReadOnly: Story = { tags: ["vrt-mobile2"], globals: mobile2Globals, args: { isReadOnly: true } };

export const MobileHalfHourRange: Story = { tags: ["vrt-mobile2"], globals: mobile2Globals, args: halfHourArgs };

/** スマートフォン: ポジションが10件。長い名前は2行までで省き、「時間を選んで入れる」を押せる幅で残す。 */
export const MobileTenPositions: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  args: { positions: tenPositions, segments: tenPositionSegments },
};

/** スマートフォン: 受付時間が24時間の店舗。1時間を16pxで止め、帯を横にスクロールさせる。 */
export const MobileFullDay: Story = { tags: ["vrt-mobile1"], globals: mobile1Globals, args: fullDayArgs };

// ==========================================
// 操作の補助
// ==========================================

type Metrics = ReturnType<typeof getBandMetrics>;

const PC_METRICS = getBandMetrics("wide");
const MOBILE_METRICS = getBandMetrics("narrow");

/** そのポジションの帯に並ぶ区間の名前を、左から順に返す。空いた時間（0人）も含む。 */
const getSpanLabels = (root: HTMLElement, positionId: string) =>
  Array.from(root.querySelectorAll<HTMLElement>(`[data-band-span="${positionId}"]`)).map(
    (element) => element.getAttribute("aria-label") ?? "",
  );

const findTrack = async (canvasElement: HTMLElement, positionId: string) => {
  const selector = `[data-band-track="${positionId}"]`;
  await waitFor(() => expect(canvasElement.querySelector(selector)).not.toBeNull());
  return canvasElement.querySelector(selector) as HTMLElement;
};

type Point = { clientX: number; clientY: number };

/** 時間の軸の上で、その時刻から始まるマスの中央の位置を返す。 */
const cellAt = (track: HTMLElement, time: string, metrics: Metrics = PC_METRICS): Point => {
  const rect = track.getBoundingClientRect();
  const hourWidth = (rect.width - metrics.axisPadding * 2) / ((RANGE.endMinutes - RANGE.startMinutes) / 60);
  return {
    clientX: rect.left + metrics.axisPadding + ((timeToMinutes(time) + 15 - RANGE.startMinutes) / 60) * hourWidth,
    clientY: rect.top + rect.height / 2,
  };
};

const POINTER_ID = 21;

type PointerKind = "mouse" | "touch";

/** Pointer Eventを1つ送る。 */
const pointer = (
  type: "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel",
  target: HTMLElement,
  at: Point,
  pointerType: PointerKind,
) =>
  fireEvent[type](target, {
    pointerId: POINTER_ID,
    pointerType,
    isPrimary: true,
    button: type === "pointerMove" ? -1 : 0,
    buttons: type === "pointerDown" || type === "pointerMove" ? 1 : 0,
    ...at,
  });

/** 帯の上を、始めのマスから終わりのマスまでなぞって離す。 */
const swipe = async (
  track: HTMLElement,
  fromTime: string,
  toTime: string,
  options: { pointerType: PointerKind; metrics?: Metrics },
) => {
  const { pointerType, metrics } = options;
  await pointer("pointerDown", track, cellAt(track, fromTime, metrics), pointerType);
  await pointer("pointerMove", track, cellAt(track, toTime, metrics), pointerType);
  await pointer("pointerUp", track, cellAt(track, toTime, metrics), pointerType);
};

const getSpan = (canvasElement: HTMLElement, name: string) => within(canvasElement).getByRole("button", { name });

const findCountDialog = async (positionName: string) =>
  within(await within(document.body).findByRole("dialog", { name: `${positionName}の必要人数を入れる` }));

const expectNoDialog = () => waitFor(() => expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument());

// ==========================================
// 見た目（操作の途中）
// ==========================================

/** PC: なぞって範囲を選んだあとの吹き出し。範囲の中の人数が違うため、選択済みの人数はない。 */
export const CountPopover: Story = {
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");
    await swipe(track, "10:00", "14:30", { pointerType: "mouse" });
    const dialog = await findCountDialog("ホール");
    await expect(dialog.queryByRole("button", { pressed: true })).not.toBeInTheDocument();
  },
};

/** PC: なぞっている途中。選んでいる範囲の上に、開始と終了の時刻を出す。 */
export const Swiping: Story = {
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "kitchen");
    await pointer("pointerDown", track, cellAt(track, "14:00"), "mouse");
    await pointer("pointerMove", track, cellAt(track, "16:30"), "mouse");
    await expect(canvasElement.querySelector("[data-band-swipe-time]")).toHaveTextContent("14:00〜17:00");
  },
};

/** PC: 人数を選ぶ欄を、帯のすぐ下にその場で出す。Dialogの中に置く場合の出し方。 */
export const InlineForm: Story = {
  args: { formPresentation: "inline" },
  play: async ({ canvasElement }) => {
    await findTrack(canvasElement, "hall");
    await userEvent.click(getSpan(canvasElement, "ホール 11:00〜14:00 3人"));
    const panel = within(await within(canvasElement).findByRole("group", { name: "ホールの必要人数を入れる" }));
    await expect(panel.getByRole("button", { name: "3人" })).toHaveAttribute("aria-pressed", "true");
  },
};

/** スマートフォン（幅320px）: 区間を押すと、その帯のすぐ下に、開始・終了・人数の欄が開く。 */
export const MobileForm: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  play: async ({ canvasElement }) => {
    await findTrack(canvasElement, "hall");
    await userEvent.click(getSpan(canvasElement, "ホール 11:00〜14:00 3人"));
    const panel = within(await within(canvasElement).findByRole("group", { name: "ホールの必要人数を入れる" }));
    await expect(panel.getByRole("button", { name: "3人" })).toHaveAttribute("aria-pressed", "true");
  },
};

/** スマートフォン: 指でなぞっている途中。 */
export const MobileSwiping: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "kitchen");
    await pointer("pointerDown", track, cellAt(track, "14:00", MOBILE_METRICS), "touch");
    await pointer("pointerMove", track, cellAt(track, "16:30", MOBILE_METRICS), "touch");
    await expect(canvasElement.querySelector("[data-band-swipe-time]")).toHaveTextContent("14:00〜17:00");
  },
};

// ==========================================
// 振る舞い（PC）
// ==========================================

/** 帯の上をなぞると範囲が選ばれ、離すと人数を選ぶ欄が開く。人数を押すと、その範囲の人数が置き換わる。 */
export const SwipeToSetInteractive: Story = {
  name: "Swipe To Set Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");

    // 14:00のマスから16:30のマスまでなぞる。離すまでは、欄を開かない。
    await pointer("pointerDown", track, cellAt(track, "14:00"), "mouse");
    await pointer("pointerMove", track, cellAt(track, "16:30"), "mouse");
    await expect(canvasElement.querySelector("[data-band-swipe-time]")).toHaveTextContent("14:00〜17:00");
    await expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();
    await pointer("pointerUp", track, cellAt(track, "16:30"), "mouse");
    await expect(canvasElement.querySelector("[data-band-swipe-time]")).toBeNull();

    const dialog = await findCountDialog("ホール");
    await expect(dialog.getByRole("combobox", { name: "開始" })).toHaveValue("14:00");
    await expect(dialog.getByRole("combobox", { name: "終了" })).toHaveValue("17:00");
    await expect(dialog.getByRole("button", { name: "1人" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(dialog.getByRole("button", { name: "4人" }));
    await expectNoDialog();
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜11:00 1人",
      "ホール 11:00〜14:00 3人",
      "ホール 14:00〜17:00 4人",
      "ホール 17:00〜22:00 2人",
    ]);
    // 欄を閉じたあと、フォーカスは人数を入れた区間へ戻る。
    await waitFor(() => expect(getSpan(canvasElement, "ホール 14:00〜17:00 4人")).toHaveFocus());

    // 右から左へなぞっても、同じ範囲になる。人数の違う区間にまたがると、いまの人数を範囲で出す。
    await swipe(track, "12:30", "10:00", { pointerType: "mouse" });
    const second = await findCountDialog("ホール");
    await expect(second.getByRole("combobox", { name: "開始" })).toHaveValue("10:00");
    await expect(second.getByRole("combobox", { name: "終了" })).toHaveValue("13:00");
    // 人数がそろっていない範囲では、どのボタンも選択済みにしない。
    await expect(second.queryByRole("button", { pressed: true })).not.toBeInTheDocument();
    await userEvent.click(second.getByRole("button", { name: "2人" }));
    await expectNoDialog();
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜10:00 1人",
      "ホール 10:00〜13:00 2人",
      "ホール 13:00〜14:00 3人",
      "ホール 14:00〜17:00 4人",
      "ホール 17:00〜22:00 2人",
    ]);
    // 1つの区間の中だけをマウスでなぞった場合も、区間の全体ではなく、なぞった範囲が選ばれる。
    const evening = getSpan(canvasElement, "ホール 17:00〜22:00 2人");
    const user = userEvent.setup();
    await user.pointer({ keys: "[MouseLeft>]", target: evening, coords: cellAt(track, "18:00") });
    await user.pointer({ target: evening, coords: cellAt(track, "19:30") });
    await user.pointer({ keys: "[/MouseLeft]", target: evening, coords: cellAt(track, "19:30") });
    const third = await findCountDialog("ホール");
    await expect(third.getByRole("combobox", { name: "開始" })).toHaveValue("18:00");
    await expect(third.getByRole("combobox", { name: "終了" })).toHaveValue("20:00");
    await userEvent.click(third.getByRole("button", { name: "閉じる" }));
    await expectNoDialog();

    // ほかのポジションの人数は変わらない。
    await expect(getSpanLabels(canvasElement, "register")).toEqual([
      "レジ 09:00〜10:00 0人",
      "レジ 10:00〜20:00 1人",
      "レジ 20:00〜22:00 0人",
    ]);
  },
};

/** 区間を押すと、その区間の全体が選ばれる。いまの人数のボタンは選択済みになり、別の人数を押すと変わる。 */
export const PressSpanInteractive: Story = {
  name: "Press Span Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    await findTrack(canvasElement, "kitchen");

    await userEvent.click(getSpan(canvasElement, "キッチン 11:00〜14:00 2人"));
    const dialog = await findCountDialog("キッチン");
    await expect(dialog.getByRole("combobox", { name: "開始" })).toHaveValue("11:00");
    await expect(dialog.getByRole("combobox", { name: "終了" })).toHaveValue("14:00");
    await expect(dialog.getByRole("button", { name: "2人" })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getAllByRole("button", { pressed: true })).toHaveLength(1);

    await userEvent.click(dialog.getByRole("button", { name: "5人" }));
    await expectNoDialog();
    await expect(getSpanLabels(canvasElement, "kitchen")).toEqual([
      "キッチン 09:00〜11:00 1人",
      "キッチン 11:00〜14:00 5人",
      "キッチン 14:00〜17:00 0人",
      "キッチン 17:00〜21:00 2人",
      "キッチン 21:00〜22:00 0人",
    ]);

    // 空いた時間を押しても、その時間の全体が選ばれる。
    await userEvent.click(getSpan(canvasElement, "キッチン 14:00〜17:00 0人"));
    const second = await findCountDialog("キッチン");
    await userEvent.click(second.getByRole("button", { name: "1人" }));
    await expectNoDialog();
    await expect(getSpanLabels(canvasElement, "kitchen")).toEqual([
      "キッチン 09:00〜11:00 1人",
      "キッチン 11:00〜14:00 5人",
      "キッチン 14:00〜17:00 1人",
      "キッチン 17:00〜21:00 2人",
      "キッチン 21:00〜22:00 0人",
    ]);
  },
};

/** 0人を押すと、その範囲の人数が消える。閉じるを押した場合は、人数を変えない。 */
export const ClearWithZeroInteractive: Story = {
  name: "Clear With Zero Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    await findTrack(canvasElement, "hall");
    const before = getSpanLabels(canvasElement, "hall");

    await userEvent.click(getSpan(canvasElement, "ホール 11:00〜14:00 3人"));
    const dialog = await findCountDialog("ホール");
    await userEvent.click(dialog.getByRole("button", { name: "閉じる" }));
    await expectNoDialog();
    await expect(getSpanLabels(canvasElement, "hall")).toEqual(before);

    await userEvent.click(getSpan(canvasElement, "ホール 11:00〜14:00 3人"));
    const second = await findCountDialog("ホール");
    await userEvent.click(second.getByRole("button", { name: "必要人数を削除" }));
    await expectNoDialog();
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜11:00 1人",
      "ホール 11:00〜14:00 0人",
      "ホール 14:00〜17:00 1人",
      "ホール 17:00〜22:00 2人",
    ]);
  },
};

/** 隣と同じ人数にすると、1つの区間にまとまる。 */
export const MergeAdjacentInteractive: Story = {
  name: "Merge Adjacent Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    await findTrack(canvasElement, "hall");

    await userEvent.click(getSpan(canvasElement, "ホール 11:00〜14:00 3人"));
    const dialog = await findCountDialog("ホール");
    await userEvent.click(dialog.getByRole("button", { name: "1人" }));
    await expectNoDialog();
    // 前後の1人の区間とつながり、09:00〜17:00 の1つになる。
    await expect(getSpanLabels(canvasElement, "hall")).toEqual(["ホール 09:00〜17:00 1人", "ホール 17:00〜22:00 2人"]);
    // 押した区間はなくなるため、フォーカスは、選んだ範囲を含む区間へ戻る。
    await waitFor(() => expect(getSpan(canvasElement, "ホール 09:00〜17:00 1人")).toHaveFocus());
  },
};

/** 選んでいる範囲の枠が、その名前の区間と同じ位置にあることを確かめる。 */
const expectSelectionOn = async (canvasElement: HTMLElement, spanName: string) => {
  const span = getSpan(canvasElement, spanName).getBoundingClientRect();
  await waitFor(() => {
    const selection = canvasElement.querySelector("[data-band-selection]")?.getBoundingClientRect();
    expect(selection).toBeDefined();
    expect(Math.abs((selection?.left ?? 0) - span.left)).toBeLessThanOrEqual(1);
    expect(Math.abs((selection?.right ?? 0) - span.right)).toBeLessThanOrEqual(1);
  });
};

const HALL_BEFORE_EDIT = [
  "ホール 09:00〜11:00 1人",
  "ホール 11:00〜14:00 3人",
  "ホール 14:00〜17:00 1人",
  "ホール 17:00〜22:00 2人",
];

/**
 * 人数の入った区間を押して開いた欄では、開始か終了を変えた時点で、すぐ帯が変わる。欄は開いたままで、続けて直せる。
 * 隣の区間へ伸ばすと重なった分を置き換え、縮め直すと、重ねた隣の人数は元に戻る。
 */
export const EditSpanTimeInteractive: Story = {
  name: "Edit Span Time Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    await findTrack(canvasElement, "hall");

    await userEvent.click(getSpan(canvasElement, "ホール 11:00〜14:00 3人"));
    const dialog = await findCountDialog("ホール");
    const start = dialog.getByRole("combobox", { name: "開始" });
    const end = dialog.getByRole("combobox", { name: "終了" });

    // 終了を後ろへ伸ばすと、すぐ帯が変わる。隣の1人の区間に重なった分は、3人で置き換わる。
    await userEvent.selectOptions(end, "15:00");
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜11:00 1人",
      "ホール 11:00〜15:00 3人",
      "ホール 15:00〜17:00 1人",
      "ホール 17:00〜22:00 2人",
    ]);
    // 欄は開いたままで、選んでいる範囲の枠も新しい時間へ動く。人数のボタンは3人のままである。
    await expect(end).toHaveValue("15:00");
    await expect(dialog.getByRole("button", { name: "3人" })).toHaveAttribute("aria-pressed", "true");
    await expectSelectionOn(canvasElement, "ホール 11:00〜15:00 3人");

    // 終了を前へ縮めると、外れた時間は人数なしになる。先に重ねた隣の1人は、元に戻る。
    await userEvent.selectOptions(end, "13:00");
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜11:00 1人",
      "ホール 11:00〜13:00 3人",
      "ホール 13:00〜14:00 0人",
      "ホール 14:00〜17:00 1人",
      "ホール 17:00〜22:00 2人",
    ]);
    await expectSelectionOn(canvasElement, "ホール 11:00〜13:00 3人");

    // 開始を前へ伸ばしても、すぐ帯が変わる。
    await userEvent.selectOptions(start, "10:00");
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜10:00 1人",
      "ホール 10:00〜13:00 3人",
      "ホール 13:00〜14:00 0人",
      "ホール 14:00〜17:00 1人",
      "ホール 17:00〜22:00 2人",
    ]);
    await expect(within(document.body).getByRole("dialog", { name: "ホールの必要人数を入れる" })).toBeVisible();

    // 開始を終了よりあとにすると、終了が開始の30分あとへ動き、長さ0の区間は作らない。
    await userEvent.selectOptions(start, "16:00");
    await expect(end).toHaveValue("16:30");
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜11:00 1人",
      "ホール 11:00〜14:00 0人",
      "ホール 14:00〜16:00 1人",
      "ホール 16:00〜16:30 3人",
      "ホール 16:30〜17:00 1人",
      "ホール 17:00〜22:00 2人",
    ]);

    // 元の時間へ戻すと、帯も開いたときの人数へ戻る。
    await userEvent.selectOptions(start, "11:00");
    await userEvent.selectOptions(end, "14:00");
    await expect(getSpanLabels(canvasElement, "hall")).toEqual(HALL_BEFORE_EDIT);

    // 人数を変えると、すぐ入り、欄が閉じる。
    await userEvent.click(dialog.getByRole("button", { name: "5人" }));
    await expectNoDialog();
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜11:00 1人",
      "ホール 11:00〜14:00 5人",
      "ホール 14:00〜17:00 1人",
      "ホール 17:00〜22:00 2人",
    ]);
  },
};

/** 新しく選んだ範囲（なぞった範囲、空いた時間）は、開始と終了を直しても、人数を選ぶまで帯へ入らない。 */
export const NewRangeWaitsForCountInteractive: Story = {
  name: "New Range Waits For Count Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");

    // 人数の入った区間の上でも、なぞって選んだ範囲は、新しく選んだ範囲として扱う。
    await swipe(track, "11:00", "13:30", { pointerType: "mouse" });
    const dialog = await findCountDialog("ホール");
    await expect(dialog.getByRole("combobox", { name: "終了" })).toHaveValue("14:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "終了" }), "15:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "開始" }), "12:00");
    await expect(getSpanLabels(canvasElement, "hall")).toEqual(HALL_BEFORE_EDIT);
    // 人数の違う時間にかかると、選択済みのボタンがなくなる。
    await expect(dialog.queryByRole("button", { pressed: true })).not.toBeInTheDocument();

    await userEvent.click(dialog.getByRole("button", { name: "2人" }));
    await expectNoDialog();
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜11:00 1人",
      "ホール 11:00〜12:00 3人",
      "ホール 12:00〜15:00 2人",
      "ホール 15:00〜17:00 1人",
      "ホール 17:00〜22:00 2人",
    ]);

    // 空いた時間を押して開いた欄でも、時間を直しただけでは入らない。
    const kitchenBefore = getSpanLabels(canvasElement, "kitchen");
    await userEvent.click(getSpan(canvasElement, "キッチン 14:00〜17:00 0人"));
    const kitchenDialog = await findCountDialog("キッチン");
    await userEvent.selectOptions(kitchenDialog.getByRole("combobox", { name: "終了" }), "16:00");
    await expect(getSpanLabels(canvasElement, "kitchen")).toEqual(kitchenBefore);
    await userEvent.click(kitchenDialog.getByRole("button", { name: "1人" }));
    await expectNoDialog();
    await expect(getSpanLabels(canvasElement, "kitchen")).toEqual([
      "キッチン 09:00〜11:00 1人",
      "キッチン 11:00〜14:00 2人",
      "キッチン 14:00〜16:00 1人",
      "キッチン 16:00〜17:00 0人",
      "キッチン 17:00〜21:00 2人",
      "キッチン 21:00〜22:00 0人",
    ]);
  },
};

/** 「時間を選んで入れる」から、なぞらずに開始・終了・人数を選んで入れられる。 */
export const PickTimeInteractive: Story = {
  name: "Pick Time Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const group = within(await within(canvasElement).findByRole("group", { name: "レジの必要人数" }));
    const pickButton = group.getByRole("button", { name: "時間を選んで入れる" });

    await userEvent.click(pickButton);
    const dialog = await findCountDialog("レジ");
    // 初期値は受付時間の全体。
    await expect(dialog.getByRole("combobox", { name: "開始" })).toHaveValue("09:00");
    await expect(dialog.getByRole("combobox", { name: "終了" })).toHaveValue("22:00");

    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "開始" }), "12:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "終了" }), "13:00");
    await userEvent.click(dialog.getByRole("button", { name: "2人" }));
    await expectNoDialog();
    await expect(getSpanLabels(canvasElement, "register")).toEqual([
      "レジ 09:00〜10:00 0人",
      "レジ 10:00〜12:00 1人",
      "レジ 12:00〜13:00 2人",
      "レジ 13:00〜20:00 1人",
      "レジ 20:00〜22:00 0人",
    ]);
    await waitFor(() => expect(pickButton).toHaveFocus());
  },
};

/** キーボードだけで、区間をたどって人数を変えられる。Escapeで閉じると、フォーカスは押した区間へ戻る。 */
export const KeyboardInteractive: Story = {
  name: "Keyboard Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    await findTrack(canvasElement, "hall");
    const span = getSpan(canvasElement, "ホール 11:00〜14:00 3人");

    span.focus();
    await userEvent.keyboard("{Enter}");
    const dialog = await findCountDialog("ホール");
    // 開いたら、いまの人数のボタンへフォーカスを移す。
    await waitFor(() => expect(dialog.getByRole("button", { name: "3人" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await expectNoDialog();
    await waitFor(() => expect(span).toHaveFocus());

    await userEvent.keyboard("{Enter}");
    const second = await findCountDialog("ホール");
    await waitFor(() => expect(second.getByRole("button", { name: "3人" })).toHaveFocus());
    // 隣のボタン（4人）へ進み、Enterで入れる。
    await userEvent.tab();
    await expect(second.getByRole("button", { name: "4人" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expectNoDialog();
    await waitFor(() => expect(getSpan(canvasElement, "ホール 11:00〜14:00 4人")).toHaveFocus());
  },
};

/** 人数を1つも入れていないポジションでも、なぞって入れられる。入れたあとは、空いた時間の案内文が消える。 */
export const EmptyInteractive: Story = {
  name: "Empty Interactive",
  parameters: behaviorOnly,
  args: { segments: [] },
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");
    await expect(getSpanLabels(canvasElement, "hall")).toEqual(["ホール 09:00〜22:00 0人"]);

    await swipe(track, "11:00", "13:30", { pointerType: "mouse" });
    const dialog = await findCountDialog("ホール");
    // 空いた範囲には消す人数がない。
    await expect(dialog.getByRole("button", { name: "必要人数を削除" })).toBeDisabled();
    // ボタンにない人数は、入力欄に入れてEnterで入る。上限を超える数字は入らない。
    const input = dialog.getByRole("textbox", { name: "人数を数字で入力" });
    await userEvent.type(input, "51{Enter}");
    await expect(dialog.getByRole("alert")).toHaveTextContent("1〜50の数字を入れてください");
    await userEvent.clear(input);
    await userEvent.type(input, "10{Enter}");
    await expectNoDialog();
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜11:00 0人",
      "ホール 11:00〜14:00 10人",
      "ホール 14:00〜22:00 0人",
    ]);
  },
};

/** 「受付時間に合わせる」で、範囲の外の人数が消え、知らせも消える。 */
export const TrimOutsideRangeInteractive: Story = {
  name: "Trim Outside Range Interactive",
  parameters: behaviorOnly,
  args: { segments: outsideSegments },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await findTrack(canvasElement, "hall");

    await userEvent.click(canvas.getByRole("button", { name: "受付時間に合わせる" }));
    await waitFor(() => expect(canvas.queryByRole("alert")).not.toBeInTheDocument());
    await expect(getSpanLabels(canvasElement, "hall")).toEqual(["ホール 09:00〜12:00 2人", "ホール 12:00〜22:00 1人"]);
    await expect(getSpanLabels(canvasElement, "kitchen")).toEqual([
      "キッチン 09:00〜18:00 0人",
      "キッチン 18:00〜22:00 2人",
    ]);
  },
};

/** 閲覧専用では、なぞっても押しても欄が開かない。人数は読める。 */
export const ReadOnlyInteractive: Story = {
  name: "Read Only Interactive",
  parameters: behaviorOnly,
  args: { isReadOnly: true },
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");
    const group = within(within(canvasElement).getByRole("group", { name: "ホールの必要人数" }));

    await expect(group.getAllByRole("img").map((element) => element.getAttribute("aria-label"))).toEqual([
      "ホール 09:00〜11:00 1人",
      "ホール 11:00〜14:00 3人",
      "ホール 14:00〜17:00 1人",
      "ホール 17:00〜22:00 2人",
    ]);
    await expect(within(canvasElement).queryAllByRole("button")).toHaveLength(0);

    await swipe(track, "14:00", "16:30", { pointerType: "mouse" });
    await userEvent.click(group.getByRole("img", { name: "ホール 11:00〜14:00 3人" }));
    await expect(canvasElement.querySelector("[data-band-selection]")).toBeNull();
    await expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();
    await expect(
      within(canvasElement).queryByRole("group", { name: "ホールの必要人数を入れる" }),
    ).not.toBeInTheDocument();
  },
};

/** その場に出す欄でも、人数を入れると閉じ、フォーカスは人数を入れた区間へ戻る。吹き出しは出さない。 */
export const InlineFormInteractive: Story = {
  name: "Inline Form Interactive",
  parameters: behaviorOnly,
  args: { formPresentation: "inline" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const track = await findTrack(canvasElement, "kitchen");

    await swipe(track, "14:00", "16:30", { pointerType: "mouse" });
    const hallGroup = within(canvas.getByRole("group", { name: "キッチンの必要人数" }));
    const panel = within(await hallGroup.findByRole("group", { name: "キッチンの必要人数を入れる" }));
    await expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();
    await expect(panel.getByRole("combobox", { name: "開始" })).toHaveValue("14:00");
    await expect(panel.getByRole("combobox", { name: "終了" })).toHaveValue("17:00");

    await userEvent.click(panel.getByRole("button", { name: "3人" }));
    await waitFor(() =>
      expect(canvas.queryByRole("group", { name: "キッチンの必要人数を入れる" })).not.toBeInTheDocument(),
    );
    await expect(getSpanLabels(canvasElement, "kitchen")).toEqual([
      "キッチン 09:00〜11:00 1人",
      "キッチン 11:00〜14:00 2人",
      "キッチン 14:00〜17:00 3人",
      "キッチン 17:00〜21:00 2人",
      "キッチン 21:00〜22:00 0人",
    ]);
    await waitFor(() => expect(getSpan(canvasElement, "キッチン 14:00〜17:00 3人")).toHaveFocus());
  },
};

/** その場に出す欄でも、人数の入った区間の時間を変えると、すぐ帯が変わり、欄は開いたままになる。 */
export const InlineEditSpanTimeInteractive: Story = {
  name: "Inline Edit Span Time Interactive",
  parameters: behaviorOnly,
  args: { formPresentation: "inline" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await findTrack(canvasElement, "hall");

    await userEvent.click(getSpan(canvasElement, "ホール 11:00〜14:00 3人"));
    const panel = within(await canvas.findByRole("group", { name: "ホールの必要人数を入れる" }));
    await userEvent.selectOptions(panel.getByRole("combobox", { name: "終了" }), "12:30");
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜11:00 1人",
      "ホール 11:00〜12:30 3人",
      "ホール 12:30〜14:00 0人",
      "ホール 14:00〜17:00 1人",
      "ホール 17:00〜22:00 2人",
    ]);
    await userEvent.selectOptions(panel.getByRole("combobox", { name: "開始" }), "10:30");
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜10:30 1人",
      "ホール 10:30〜12:30 3人",
      "ホール 12:30〜14:00 0人",
      "ホール 14:00〜17:00 1人",
      "ホール 17:00〜22:00 2人",
    ]);
    // 欄は開いたままで、フォーカスも欄の中に残る。
    await expect(canvas.getByRole("group", { name: "ホールの必要人数を入れる" })).toBeVisible();
    await expect(panel.getByRole("combobox", { name: "開始" })).toHaveFocus();
    await expectSelectionOn(canvasElement, "ホール 10:30〜12:30 3人");
  },
};

/** Dialogの中に置いた例。値を持つ側の代わりに、Dialogの開閉も持つ。 */
const EditorInDialogStory = (args: EditorArgs) => {
  const [segments, setSegments] = useState<readonly StaffingSegment[]>(args.segments);
  const [isOpen, setIsOpen] = useState(true);
  return (
    <Dialog
      title="この日の必要人数"
      isOpen={isOpen}
      onOpenChange={(details) => setIsOpen(details.open)}
      onClose={() => setIsOpen(false)}
      maxW={{ md: "min(1040px, calc(100vw - 48px))" }}
    >
      <StaffingCountBandEditor {...args} segments={segments} onChange={setSegments} />
    </Dialog>
  );
};

/**
 * Dialogの中では、人数を選ぶ欄を帯のすぐ下に出す。
 * 欄の中でEscapeを押すと欄だけが閉じ、Dialogは開いたままになる。欄を閉じたあとのEscapeは、Dialogを閉じる。
 */
export const InDialogInteractive: Story = {
  name: "In Dialog Interactive",
  args: { formPresentation: "inline" },
  render: (args) => <EditorInDialogStory {...args} />,
  parameters: behaviorOnly,
  play: async () => {
    const body = within(document.body);
    const dialog = within(await body.findByRole("dialog", { name: "この日の必要人数" }));
    const span = await dialog.findByRole("button", { name: "ホール 11:00〜14:00 3人" });

    await userEvent.click(span);
    const panel = within(await dialog.findByRole("group", { name: "ホールの必要人数を入れる" }));
    await waitFor(() => expect(panel.getByRole("button", { name: "3人" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(dialog.queryByRole("group", { name: "ホールの必要人数を入れる" })).not.toBeInTheDocument(),
    );
    await expect(body.getByRole("dialog", { name: "この日の必要人数" })).toBeVisible();
    await waitFor(() => expect(span).toHaveFocus());

    // 人数を入れても、Dialogは開いたままで、帯の人数が変わる。
    await userEvent.click(span);
    const reopened = within(await dialog.findByRole("group", { name: "ホールの必要人数を入れる" }));
    await userEvent.click(reopened.getByRole("button", { name: "5人" }));
    await expect(await dialog.findByRole("button", { name: "ホール 11:00〜14:00 5人" })).toBeVisible();

    // 欄を閉じたあとのEscapeは、Dialogを閉じる。
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("dialog", { name: "この日の必要人数" })).not.toBeInTheDocument());
  },
};

// ==========================================
// 振る舞い（スマートフォン）
// ==========================================

/** スマートフォン: 指でなぞるか区間を押すと、その帯のすぐ下に欄が開き、人数を入れられる。 */
export const MobileFormInteractive: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "Mobile Form Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const track = await findTrack(canvasElement, "hall");
    const hallGroup = within(canvas.getByRole("group", { name: "ホールの必要人数" }));

    // 指でなぞる。
    await swipe(track, "14:00", "16:30", { pointerType: "touch", metrics: MOBILE_METRICS });
    const panel = within(await hallGroup.findByRole("group", { name: "ホールの必要人数を入れる" }));
    await expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();
    await expect(panel.getByRole("combobox", { name: "開始" })).toHaveValue("14:00");
    await expect(panel.getByRole("combobox", { name: "終了" })).toHaveValue("17:00");
    // 人数のボタンは、指で押せる44pxにする。
    const countButton = panel.getByRole("button", { name: "4人" });
    await expect(Math.round(countButton.getBoundingClientRect().width)).toBe(44);
    await expect(Math.round(countButton.getBoundingClientRect().height)).toBe(44);
    await userEvent.click(countButton);
    await waitFor(() =>
      expect(canvas.queryByRole("group", { name: "ホールの必要人数を入れる" })).not.toBeInTheDocument(),
    );
    await expect(getSpanLabels(canvasElement, "hall")).toEqual([
      "ホール 09:00〜11:00 1人",
      "ホール 11:00〜14:00 3人",
      "ホール 14:00〜17:00 4人",
      "ホール 17:00〜22:00 2人",
    ]);

    // 区間を押す。別のポジションで開くと、欄はそのポジションの帯の下へ移る。
    await userEvent.click(getSpan(canvasElement, "キッチン 11:00〜14:00 2人"));
    const kitchenGroup = within(canvas.getByRole("group", { name: "キッチンの必要人数" }));
    const kitchenPanel = within(await kitchenGroup.findByRole("group", { name: "キッチンの必要人数を入れる" }));
    await expect(kitchenPanel.getByRole("button", { name: "2人" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(kitchenPanel.getByRole("button", { name: "閉じる" }));
    await waitFor(() =>
      expect(canvas.queryByRole("group", { name: "キッチンの必要人数を入れる" })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(getSpan(canvasElement, "キッチン 11:00〜14:00 2人")).toHaveFocus());
  },
};

/** スマートフォン: 区間を押して開いた欄で時間を変えると、すぐ帯が変わり、欄は開いたままになる。 */
export const MobileEditSpanTimeInteractive: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  name: "Mobile Edit Span Time Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await findTrack(canvasElement, "kitchen");

    await userEvent.click(getSpan(canvasElement, "キッチン 11:00〜14:00 2人"));
    const panel = within(await canvas.findByRole("group", { name: "キッチンの必要人数を入れる" }));
    await userEvent.selectOptions(panel.getByRole("combobox", { name: "終了" }), "16:00");
    await expect(getSpanLabels(canvasElement, "kitchen")).toEqual([
      "キッチン 09:00〜11:00 1人",
      "キッチン 11:00〜16:00 2人",
      "キッチン 16:00〜17:00 0人",
      "キッチン 17:00〜21:00 2人",
      "キッチン 21:00〜22:00 0人",
    ]);
    await expect(canvas.getByRole("group", { name: "キッチンの必要人数を入れる" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "2人" })).toHaveAttribute("aria-pressed", "true");

    // 隣の同じ人数の区間に接するまで伸ばすと、帯では1つにまとまる。欄の時間は、選んだ時間のままである。
    await userEvent.selectOptions(panel.getByRole("combobox", { name: "終了" }), "17:00");
    await expect(getSpanLabels(canvasElement, "kitchen")).toEqual([
      "キッチン 09:00〜11:00 1人",
      "キッチン 11:00〜21:00 2人",
      "キッチン 21:00〜22:00 0人",
    ]);
    await expect(panel.getByRole("combobox", { name: "終了" })).toHaveValue("17:00");

    // 縮め直すと、まとまった先の区間は残り、外れた時間だけが人数なしになる。
    await userEvent.selectOptions(panel.getByRole("combobox", { name: "終了" }), "14:00");
    await expect(getSpanLabels(canvasElement, "kitchen")).toEqual([
      "キッチン 09:00〜11:00 1人",
      "キッチン 11:00〜14:00 2人",
      "キッチン 14:00〜17:00 0人",
      "キッチン 17:00〜21:00 2人",
      "キッチン 21:00〜22:00 0人",
    ]);
  },
};

/** スマートフォン: 指の動きが画面のスクロールになった場合（pointercancel）は、選んだ範囲を捨てる。 */
export const MobileSwipeCancelInteractive: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "Mobile Swipe Cancel Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");
    const before = getSpanLabels(canvasElement, "hall");

    await pointer("pointerDown", track, cellAt(track, "14:00", MOBILE_METRICS), "touch");
    await pointer("pointerMove", track, cellAt(track, "16:30", MOBILE_METRICS), "touch");
    await expect(canvasElement.querySelector("[data-band-selection]")).not.toBeNull();
    await pointer("pointerCancel", track, cellAt(track, "16:30", MOBILE_METRICS), "touch");

    await expect(canvasElement.querySelector("[data-band-selection]")).toBeNull();
    await expect(canvasElement.querySelector("[data-band-swipe-time]")).toBeNull();
    await expect(
      within(canvasElement).queryByRole("group", { name: "ホールの必要人数を入れる" }),
    ).not.toBeInTheDocument();
    await expect(getSpanLabels(canvasElement, "hall")).toEqual(before);
    // 帯は、指の縦の動きを画面のスクロールへ渡す。
    await expect(getComputedStyle(track).touchAction).toContain("pan-y");
  },
};
