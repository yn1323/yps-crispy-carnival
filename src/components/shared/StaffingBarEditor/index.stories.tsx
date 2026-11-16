import { Box, Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { type EditableStaffingBar, toEditableStaffingBars } from "@/src/domains/shift/staffingBars";
import { timeToMinutes } from "@/src/domains/shift/time";
import type { StaffingBar } from "@/src/domains/shift/types";
import { RequiredCountStrip, StaffingBarEditor } from ".";
import { getTimelineMetrics } from "./script";

type EditorArgs = ComponentProps<typeof StaffingBarEditor>;

// ==========================================
// fixture: 受付時間 9:00〜22:00、ホールとキッチン
// ==========================================
const hall = { id: "hall", name: "ホール", color: "#3b82f6" };
const kitchen = { id: "kitchen", name: "キッチン", color: "#c2410c" };
const RANGE = { startMinutes: 9 * 60, endMinutes: 22 * 60 };

const bar = (positionId: string, start: string, end: string): StaffingBar => ({ positionId, start, end });

// ホールは5行（9:00〜22:00、昼2本、夜2本+2本）、キッチンは2行に詰まる。
const defaultBars = toEditableStaffingBars([
  bar("hall", "09:00", "22:00"),
  bar("hall", "11:00", "14:00"),
  bar("hall", "11:00", "14:00"),
  bar("hall", "17:00", "22:00"),
  bar("hall", "17:00", "22:00"),
  bar("hall", "18:00", "22:00"),
  bar("hall", "18:00", "22:00"),
  bar("kitchen", "09:00", "22:00"),
  bar("kitchen", "11:00", "14:00"),
  bar("kitchen", "18:00", "21:00"),
]);

// 受付時間を短くしたあとに残る、範囲の外のバー。完全に外が1本、端をまたぐバーが2本。
const outsideBars = toEditableStaffingBars([
  bar("hall", "09:00", "22:00"),
  bar("hall", "07:00", "09:00"),
  bar("hall", "08:00", "12:00"),
  bar("kitchen", "18:00", "23:00"),
  bar("kitchen", "11:00", "14:00"),
]);

/**
 * 値を持つ側の代わり。バーの表と「できあがる必要人数」を、同じ幅で縦に並べる。
 * 狭い画面では、バーの表がポジションごとに人数を出し、RequiredCountStrip は何も出さないため、入れ物ごと隠す。
 */
const EditorStory = (args: EditorArgs) => {
  const [bars, setBars] = useState<readonly EditableStaffingBar[]>(args.bars);
  return (
    <Stack gap={4}>
      <StaffingBarEditor {...args} bars={bars} onChange={setBars} />
      <Box display={{ base: "none", lg: "block" }} pt={3} borderTopWidth="1px" borderColor="gray.200">
        <RequiredCountStrip positions={args.positions} bars={bars} range={args.range} layout={args.layout} />
      </Box>
    </Stack>
  );
};

const meta = {
  title: "Shared/StaffingBarEditor",
  component: StaffingBarEditor,
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
    positions: [hall, kitchen],
    bars: defaultBars,
    onChange: () => {},
    range: RANGE,
  },
} satisfies Meta<typeof StaffingBarEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

// tagはStorybookが静的に読むため、Storyごとに直接書く。スプレッドで渡したtagは読まれない。
const mobile1Globals = { viewport: { value: "mobile1", isRotated: false } };

// tagはStorybookが静的に読むため、Storyごとに直接書く。スプレッドで渡したtagは読まれない。
const mobile2Globals = { viewport: { value: "mobile2", isRotated: false } };

const behaviorOnly = { screenshot: { skip: true } };

// ==========================================
// 見た目
// ==========================================

/** PC: ポジションごとの見出し、番号だけの行、バー、一番下の空の行、できあがる必要人数。 */
export const Default: Story = {};

/** PC: バーが1本もない型。空の行だけが出る。 */
export const Empty: Story = { args: { bars: [] } };

/** PC: 受付時間の外にバーが残っている。本数を知らせ、外にかかるバーは動かせない見た目にする。 */
export const OutsideRange: Story = { args: { bars: outsideBars } };

const halfHourArgs = {
  range: { startMinutes: 9 * 60 + 30, endMinutes: 21 * 60 + 30 },
  bars: toEditableStaffingBars([
    bar("hall", "09:30", "21:30"),
    bar("hall", "11:00", "14:30"),
    bar("kitchen", "09:30", "15:00"),
  ]),
} satisfies Partial<EditorArgs>;

/** PC: 受付時間が30分で始まり30分で終わる。端に残る編集できない時間を灰色にする。 */
export const HalfHourRange: Story = { args: halfHourArgs };

/** PC: 読み取り専用。足すボタンと空の行を出さない。 */
export const ReadOnly: Story = { args: { isReadOnly: true } };

const manyPositionsArgs = {
  positions: [
    hall,
    kitchen,
    { id: "register", name: "レジ・テイクアウト受付カウンター", color: "#7c3aed" },
    { id: "delivery", name: "デリバリー", color: "#15803d" },
  ],
  bars: toEditableStaffingBars([
    ...defaultBars,
    bar("register", "10:00", "20:00"),
    bar("register", "11:30", "13:30"),
    bar("delivery", "17:00", "21:30"),
  ]),
} satisfies Partial<EditorArgs>;

/** PC: 長いポジション名と、ポジションが多い型。 */
export const ManyPositions: Story = { args: manyPositionsArgs };

/** スマートフォン: 1日を画面の幅に収めたバーの表。左の列は行の番号だけにし、ポジションごとに必要人数を出す。 */
export const Mobile: Story = { tags: ["vrt-mobile2"], globals: mobile2Globals };

/** スマートフォン（幅320px）: 1時間の幅が狭くなり、時刻の見出しを間引く。 */
export const MobileSmall: Story = { tags: ["vrt-mobile1"], globals: mobile1Globals };

export const MobileEmpty: Story = { tags: ["vrt-mobile2"], globals: mobile2Globals, args: { bars: [] } };

export const MobileOutsideRange: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  args: { bars: outsideBars },
};

export const MobileReadOnly: Story = { tags: ["vrt-mobile2"], globals: mobile2Globals, args: { isReadOnly: true } };

export const MobileHalfHourRange: Story = { tags: ["vrt-mobile2"], globals: mobile2Globals, args: halfHourArgs };

/** スマートフォン: 長いポジション名は見出しの中で省き、「時刻を選んで足す」を押せる幅で残す。 */
export const MobileManyPositions: Story = { tags: ["vrt-mobile1"], globals: mobile1Globals, args: manyPositionsArgs };

/** スマートフォン: 受付時間が長く、1時間が16pxより狭くなる店舗。1時間を16pxで止め、表を横にスクロールさせる。 */
export const MobileLongRange: Story = {
  tags: ["vrt-mobile1"],
  globals: mobile1Globals,
  args: {
    range: { startMinutes: 5 * 60, endMinutes: 29 * 60 },
    bars: toEditableStaffingBars([
      bar("hall", "05:00", "29:00"),
      bar("hall", "11:00", "14:00"),
      bar("kitchen", "06:00", "24:00"),
    ]),
  },
};

// ==========================================
// 操作の補助
// ==========================================

type Metrics = ReturnType<typeof getTimelineMetrics>;

const PC_METRICS = getTimelineMetrics("wide");
const MOBILE_METRICS = getTimelineMetrics("narrow");

/** 画面に出ているバーの名前（ポジション名と時間）を、並びをそろえて返す。 */
const getBarLabels = (root: HTMLElement, positionName: string) =>
  Array.from(root.querySelectorAll<HTMLElement>("[data-staffing-bar]"))
    .map((element) => element.getAttribute("aria-label") ?? "")
    .filter((label) => label.startsWith(`${positionName} `))
    .sort();

const findBars = (root: HTMLElement, label: string) =>
  Array.from(root.querySelectorAll<HTMLElement>(`[data-staffing-bar][aria-label="${label}"]`));

const findTrack = async (canvasElement: HTMLElement, positionId: string) => {
  const selector = `[data-staffing-track="${positionId}"]`;
  await waitFor(() => expect(canvasElement.querySelector(selector)).not.toBeNull());
  return canvasElement.querySelector(selector) as HTMLElement;
};

/** 時間の軸の上で、その時刻と行にあたる位置を返す。行は上から0始まり。 */
const pointAt = (track: HTMLElement, time: string, rowIndex: number, metrics: Metrics = PC_METRICS) => {
  const rect = track.getBoundingClientRect();
  const hourWidth = (rect.width - metrics.axisPadding * 2) / ((RANGE.endMinutes - RANGE.startMinutes) / 60);
  return {
    clientX: rect.left + metrics.axisPadding + ((timeToMinutes(time) - RANGE.startMinutes) / 60) * hourWidth,
    clientY: rect.top + rowIndex * metrics.rowHeight + metrics.rowHeight / 2,
  };
};

type Point = { clientX: number; clientY: number };

/**
 * マウスのドラッグの開始、移動、終了を分けて送る。ボタンを押している状態を引き継ぐため、同じ操作者で送る。
 * 押す場所（空いた行、バーの端）と、離す場所（時間の軸）は別の要素にできる。
 */
const drag = async (from: { target: HTMLElement; coords: Point }, to: { target: HTMLElement; coords: Point }) => {
  const user = userEvent.setup();
  await user.pointer({ keys: "[MouseLeft>]", target: from.target, coords: from.coords });
  await user.pointer({ target: to.target, coords: to.coords });
  await user.pointer({ keys: "[/MouseLeft]", target: to.target, coords: to.coords });
};

const TOUCH_POINTER_ID = 21;

/** 指のPointer Eventを1つ送る。指は触れた要素に捕まるため、続きも同じ要素へ送る。 */
const touch = (type: "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel", target: HTMLElement, at: Point) =>
  fireEvent[type](target, {
    pointerId: TOUCH_POINTER_ID,
    pointerType: "touch",
    isPrimary: true,
    button: type === "pointerMove" ? -1 : 0,
    buttons: type === "pointerDown" || type === "pointerMove" ? 1 : 0,
    ...at,
  });

/** 指で時間の軸をなぞり、離す。行は上から0始まり。 */
const swipe = async (track: HTMLElement, from: { time: string; row: number }, toTime: string) => {
  await touch("pointerDown", track, pointAt(track, from.time, from.row, MOBILE_METRICS));
  await touch("pointerMove", track, pointAt(track, toTime, from.row, MOBILE_METRICS));
  await touch("pointerUp", track, pointAt(track, toTime, from.row, MOBILE_METRICS));
};

const getBarEdge = (barElement: HTMLElement, edge: "start" | "end") =>
  barElement.querySelector(`[data-staffing-bar-edge="${edge}"]`) as HTMLElement;

/**
 * 「できあがる必要人数」の、ポジションの行の内容を返す。
 * PCでは RequiredCountStrip の行、スマートフォンではポジションのグループの中の行にあたる。
 */
const getRequiredCounts = (root: HTMLElement, positionName: string) =>
  within(within(root).getByRole("list", { name: `${positionName}の必要人数` }))
    .getAllByRole("listitem")
    .map((item) => item.getAttribute("aria-label"));

/** スマートフォン: 指でなぞっている途中。プレビューの上に、開始と終了の時刻を出す。 */
export const MobileDragging: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");
    await touch("pointerDown", track, pointAt(track, "14:30", 5, MOBILE_METRICS));
    await touch("pointerMove", track, pointAt(track, "16:30", 5, MOBILE_METRICS));
    await expect(canvasElement.querySelector("[data-staffing-drag-time]")).toHaveTextContent("14:30〜16:30");
  },
};

/** スマートフォン: 「時刻を選んで足す」の入力。足すと人数がどう変わるかを出す。 */
export const MobileAddForm: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  play: async ({ canvasElement }) => {
    const section = within(await within(canvasElement).findByRole("region", { name: "ホールのバー" }));
    await userEvent.click(section.getByRole("button", { name: "時刻を選んで足す" }));
    const dialog = within(await within(document.body).findByRole("dialog", { name: "ホールのバーを足す" }));
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "開始" }), "11:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "終了" }), "14:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "足す本数" }), "2");
    await expect(dialog.getByRole("status")).toHaveTextContent("この時間の必要人数：3人 → 5人");
  },
};

// ==========================================
// 振る舞い（PC）
// ==========================================

/** 空いた場所をドラッグするとバーが増え、置いたバーは空いている一番上の行へ寄る。必要人数もその場で変わる。 */
export const DragToCreateInteractive: Story = {
  name: "Drag To Create Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(7);

    // 一番下の空の行（6行目）で 14:30〜16:30 をなぞる。2行目の 14:00〜17:00 が空いている。
    await drag(
      { target: track, coords: pointAt(track, "14:30", 5) },
      { target: track, coords: pointAt(track, "16:30", 5) },
    );

    await waitFor(() => expect(findBars(canvasElement, "ホール 14:30〜16:30")).toHaveLength(1));
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(8);
    // 2行目にある 11:00〜14:00 のバーと同じ高さへ寄る。
    const [placed] = findBars(canvasElement, "ホール 14:30〜16:30");
    const secondRowTops = findBars(canvasElement, "ホール 11:00〜14:00").map((element) =>
      Math.round(element.getBoundingClientRect().top),
    );
    await expect(Math.round(placed.getBoundingClientRect().top)).toBe(Math.min(...secondRowTops));
    await expect(getRequiredCounts(canvasElement, "ホール")).toEqual([
      "09:00〜11:00 1人",
      "11:00〜14:00 3人",
      "14:00〜14:30 1人",
      "14:30〜16:30 2人",
      "16:30〜17:00 1人",
      "17:00〜18:00 3人",
      "18:00〜22:00 5人",
    ]);
    // PCでは、できあがる必要人数をポジションのグループの中には出さない。
    await expect(
      within(within(canvasElement).getByRole("region", { name: "ホールのバー" })).queryByRole("list"),
    ).not.toBeInTheDocument();

    // 右から左へなぞっても同じ時間のバーになる。動かさずに離した場合は増えない。
    await drag(
      { target: track, coords: pointAt(track, "10:30", 6) },
      { target: track, coords: pointAt(track, "09:30", 6) },
    );
    await waitFor(() => expect(findBars(canvasElement, "ホール 09:30〜10:30")).toHaveLength(1));
    await drag(
      { target: track, coords: pointAt(track, "15:00", 6) },
      { target: track, coords: pointAt(track, "15:00", 6) },
    );
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(9);
  },
};

/**
 * 同じ行で端が接するようにバーを足すと、1本にまとまる。別の行で重なるバーはまとまらない。
 * まとめても、できあがる必要人数は、足した分だけ増えた人数のままになる。
 */
export const MergeAdjacentInteractive: Story = {
  name: "Merge Adjacent Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");

    // 2行目の 11:00〜14:00 と 17:00〜22:00 の間（14:00〜17:00）を、一番下の空の行でなぞる。
    // 足したバーは2行目へ寄り、前後のバーと接するので、3本が 11:00〜22:00 の1本になる。
    await drag(
      { target: track, coords: pointAt(track, "14:00", 5) },
      { target: track, coords: pointAt(track, "17:00", 5) },
    );

    await waitFor(() => expect(findBars(canvasElement, "ホール 11:00〜22:00")).toHaveLength(1));
    // 3行目の 11:00〜14:00 と 17:00〜22:00 は、間が空いたままなのでまとまらない。
    await expect(getBarLabels(canvasElement, "ホール")).toEqual([
      "ホール 09:00〜22:00",
      "ホール 11:00〜14:00",
      "ホール 11:00〜22:00",
      "ホール 17:00〜22:00",
      "ホール 18:00〜22:00",
      "ホール 18:00〜22:00",
    ]);
    // 14:00〜17:00 だけが1人から2人へ増え、ほかの時間の人数は変わらない。
    await expect(getRequiredCounts(canvasElement, "ホール")).toEqual([
      "09:00〜11:00 1人",
      "11:00〜14:00 3人",
      "14:00〜17:00 2人",
      "17:00〜18:00 3人",
      "18:00〜22:00 5人",
    ]);
    // キッチンの、読み込んだままのバーは変わらない。
    await expect(getBarLabels(canvasElement, "キッチン")).toEqual([
      "キッチン 09:00〜22:00",
      "キッチン 11:00〜14:00",
      "キッチン 18:00〜21:00",
    ]);

    // まとまった1本を押して削除すると、丸ごと消える。
    await userEvent.click(findBars(canvasElement, "ホール 11:00〜22:00")[0]);
    const popover = within(await within(document.body).findByRole("dialog", { name: "ホールのバー" }));
    await userEvent.click(popover.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(findBars(canvasElement, "ホール 11:00〜22:00")).toHaveLength(0));
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(5);
  },
};

/** バーの端をドラッグすると伸び縮みする。反対の端を越えても、バーは消えず30分で残る。 */
export const ResizeInteractive: Story = {
  name: "Resize Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "kitchen");
    const lunch = () => findBars(canvasElement, "キッチン 11:00〜14:00")[0];

    // 終了の端を 16:00 まで伸ばす。
    await drag(
      { target: getBarEdge(lunch(), "end"), coords: pointAt(track, "14:00", 1) },
      { target: track, coords: pointAt(track, "16:00", 1) },
    );
    await waitFor(() => expect(findBars(canvasElement, "キッチン 11:00〜16:00")).toHaveLength(1));

    // 開始の端を 12:30 まで縮める。
    await drag(
      {
        target: getBarEdge(findBars(canvasElement, "キッチン 11:00〜16:00")[0], "start"),
        coords: pointAt(track, "11:00", 1),
      },
      { target: track, coords: pointAt(track, "12:30", 1) },
    );
    await waitFor(() => expect(findBars(canvasElement, "キッチン 12:30〜16:00")).toHaveLength(1));

    // 終了の端を、開始より前まで動かす。バーは消えず、最小の30分で残る。
    await drag(
      {
        target: getBarEdge(findBars(canvasElement, "キッチン 18:00〜21:00")[0], "end"),
        coords: pointAt(track, "21:00", 1),
      },
      { target: track, coords: pointAt(track, "10:00", 1) },
    );
    await waitFor(() => expect(findBars(canvasElement, "キッチン 18:00〜18:30")).toHaveLength(1));

    await expect(getBarLabels(canvasElement, "キッチン")).toEqual([
      "キッチン 09:00〜22:00",
      "キッチン 12:30〜16:00",
      "キッチン 18:00〜18:30",
    ]);
    // 端を動かした直後に、バーの欄は開かない。
    await expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();

    // 終了の端を、同じ行の次のバーの開始（18:00）まで伸ばすと、2本が1本にまとまる。
    await drag(
      {
        target: getBarEdge(findBars(canvasElement, "キッチン 12:30〜16:00")[0], "end"),
        coords: pointAt(track, "16:00", 1),
      },
      { target: track, coords: pointAt(track, "18:00", 1) },
    );
    await waitFor(() => expect(findBars(canvasElement, "キッチン 12:30〜18:30")).toHaveLength(1));
    await expect(getBarLabels(canvasElement, "キッチン")).toEqual(["キッチン 09:00〜22:00", "キッチン 12:30〜18:30"]);
    await expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();
  },
};

/**
 * 「時刻を選んで足す」で、選んだ時間のバーが本数分だけ増える。キーボードでも同じ操作ができる。
 * 入力の中には、選んだ時間の必要人数が足すとどう変わるかを出す。
 */
export const AddByFormInteractive: Story = {
  name: "Add By Form Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const section = within(await within(canvasElement).findByRole("region", { name: "キッチンのバー" }));

    await userEvent.click(section.getByRole("button", { name: "時刻を選んで足す" }));
    const dialog = within(await body.findByRole("dialog", { name: "キッチンのバーを足す" }));
    // 初期値は受付時間いっぱい・1本。時間の中で人数が違うので、範囲で出す。
    await expect(dialog.getByRole("combobox", { name: "開始" })).toHaveValue("09:00");
    await expect(dialog.getByRole("combobox", { name: "終了" })).toHaveValue("22:00");
    await expect(dialog.getByRole("combobox", { name: "足す本数" })).toHaveValue("1");
    await expect(dialog.getByRole("status")).toHaveTextContent("この時間の必要人数：1〜2人 → 2〜3人");

    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "開始" }), "17:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "終了" }), "18:00");
    await expect(dialog.getByRole("status")).toHaveTextContent("この時間の必要人数：1人 → 2人");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "終了" }), "21:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "足す本数" }), "3");
    await expect(dialog.getByRole("status")).toHaveTextContent("この時間の必要人数：1〜2人 → 4〜5人");
    await userEvent.click(dialog.getByRole("button", { name: "足す" }));

    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getBarLabels(canvasElement, "キッチン")).toEqual([
      "キッチン 09:00〜22:00",
      "キッチン 11:00〜14:00",
      "キッチン 17:00〜21:00",
      "キッチン 17:00〜21:00",
      "キッチン 17:00〜21:00",
      "キッチン 18:00〜21:00",
    ]);
    await expect(getRequiredCounts(canvasElement, "キッチン")).toEqual([
      "09:00〜11:00 1人",
      "11:00〜14:00 2人",
      "14:00〜17:00 1人",
      "17:00〜18:00 4人",
      "18:00〜21:00 5人",
      "21:00〜22:00 1人",
    ]);
  },
};

/** バーを押すと開く欄で、開始と終了を変え、削除できる。 */
export const EditAndDeleteInteractive: Story = {
  name: "Edit And Delete Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    await findTrack(canvasElement, "kitchen");

    await userEvent.click(findBars(canvasElement, "キッチン 11:00〜14:00")[0]);
    const popover = within(await body.findByRole("dialog", { name: "キッチンのバー" }));

    // 欄は表の外へ描画するが、Reactのイベントは表まで伝わる。欄の中を押したまま動かしても、バーを引く操作は始まらない。
    const title = popover.getByText("キッチンのバー");
    const titleRect = title.getBoundingClientRect();
    const pressAt = { clientX: titleRect.left + 4, clientY: titleRect.top + 4 };
    const releaseAt = { clientX: pressAt.clientX + 200, clientY: pressAt.clientY };
    const user = userEvent.setup();
    await user.pointer({ keys: "[MouseLeft>]", target: title, coords: pressAt });
    await user.pointer({ target: title, coords: releaseAt });
    await expect(canvasElement.querySelector("[data-staffing-preview]")).toBeNull();
    await user.pointer({ keys: "[/MouseLeft]", target: title, coords: releaseAt });
    await expect(getBarLabels(canvasElement, "キッチン")).toHaveLength(3);

    await userEvent.selectOptions(popover.getByRole("combobox", { name: "終了" }), "15:30");
    await waitFor(() => expect(findBars(canvasElement, "キッチン 11:00〜15:30")).toHaveLength(1));
    await userEvent.selectOptions(popover.getByRole("combobox", { name: "開始" }), "10:30");
    await waitFor(() => expect(findBars(canvasElement, "キッチン 10:30〜15:30")).toHaveLength(1));
    // 開始を終了よりあとにすると、終了が開始の30分あとへ動く。
    await userEvent.selectOptions(popover.getByRole("combobox", { name: "開始" }), "16:00");
    await waitFor(() => expect(findBars(canvasElement, "キッチン 16:00〜16:30")).toHaveLength(1));

    await userEvent.click(popover.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getBarLabels(canvasElement, "キッチン")).toEqual(["キッチン 09:00〜22:00", "キッチン 18:00〜21:00"]);
    // ホールのバーは変わらない。
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(7);
  },
};

/** キーボードでバーの欄を開き、Escapeで閉じると、押したバーへフォーカスが戻る。 */
export const KeyboardOpenBarInteractive: Story = {
  name: "Keyboard Open Bar Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    await findTrack(canvasElement, "kitchen");
    const target = findBars(canvasElement, "キッチン 18:00〜21:00")[0];

    target.focus();
    await userEvent.keyboard("{Enter}");
    // 欄が開くと、フォーカスは欄の中へ移る。
    const popover = await body.findByRole("dialog", { name: "キッチンのバー" });
    await waitFor(() => expect(popover).toContainElement(document.activeElement as HTMLElement));

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(target).toHaveFocus());
  },
};

/** 上限を超える操作は受け付けず、理由を出す。同時に重ねられる本数と、全体の本数の両方を確かめる。 */
export const LimitInteractive: Story = {
  name: "Limit Interactive",
  parameters: behaviorOnly,
  args: {
    // ホールは 11:00〜14:00 に3本、18:00〜22:00 に5本が重なっている。全体は10本。
    limits: { maxConcurrentPerPosition: 5, maxBars: 11 },
  },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const track = await findTrack(canvasElement, "hall");
    const section = within(await within(canvasElement).findByRole("region", { name: "ホールのバー" }));

    // ドラッグ: 5本が重なっている夜の時間に、6本目は引けない。
    await drag(
      { target: track, coords: pointAt(track, "19:00", 5) },
      { target: track, coords: pointAt(track, "21:00", 5) },
    );
    await expect(await section.findByRole("alert")).toHaveTextContent("同じ時間に重ねられるバーは5本までです");
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(7);

    // 端のドラッグ: 17:00〜22:00 のバーへ、昼のバーを伸ばして重ねることもできない。
    await drag(
      {
        target: getBarEdge(findBars(canvasElement, "ホール 11:00〜14:00")[0], "end"),
        coords: pointAt(track, "14:00", 1),
      },
      { target: track, coords: pointAt(track, "19:00", 1) },
    );
    await expect(findBars(canvasElement, "ホール 11:00〜14:00")).toHaveLength(2);

    // 受け付けられる操作をすると、理由は消える。全体は11本になる。
    await drag(
      { target: track, coords: pointAt(track, "14:30", 5) },
      { target: track, coords: pointAt(track, "16:00", 5) },
    );
    await waitFor(() => expect(section.queryByRole("alert")).not.toBeInTheDocument());
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(8);

    // 時刻を選んで足す: 全体の上限（11本）を超える本数は足せず、Dialogの中に理由を出す。
    await userEvent.click(section.getByRole("button", { name: "時刻を選んで足す" }));
    const dialog = within(await body.findByRole("dialog", { name: "ホールのバーを足す" }));
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "終了" }), "10:00");
    await userEvent.click(dialog.getByRole("button", { name: "足す" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("バーは全部で11本までです");
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(8);
  },
};

/** 受付時間の外にあるバーは消さずに本数を知らせ、「受付時間に合わせる」で切りそろえる。 */
export const TrimOutsideRangeInteractive: Story = {
  name: "Trim Outside Range Interactive",
  parameters: behaviorOnly,
  args: { bars: outsideBars },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await findTrack(canvasElement, "hall");
    await expect(canvas.getByText("受付時間の外にあるバーが3本あります")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "受付時間に合わせる" }));

    await waitFor(() => expect(canvas.queryByText(/受付時間の外にあるバー/)).not.toBeInTheDocument());
    // 完全に外のバー（7:00〜9:00）は消え、またぐバーは内側へ切られる。
    await expect(getBarLabels(canvasElement, "ホール")).toEqual(["ホール 09:00〜12:00", "ホール 09:00〜22:00"]);
    await expect(getBarLabels(canvasElement, "キッチン")).toEqual(["キッチン 11:00〜14:00", "キッチン 18:00〜22:00"]);
    // 切りそろえたバーは、押して欄を開けるようになる。
    await userEvent.click(findBars(canvasElement, "キッチン 18:00〜22:00")[0]);
    await expect(await within(document.body).findByRole("dialog", { name: "キッチンのバー" })).toBeInTheDocument();
  },
};

/** 読み取り専用では、ドラッグしてもバーは増えず、バーを押しても欄は開かない。 */
export const ReadOnlyInteractive: Story = {
  name: "Read Only Interactive",
  parameters: behaviorOnly,
  args: { isReadOnly: true },
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");

    await drag(
      { target: track, coords: pointAt(track, "14:30", 1) },
      { target: track, coords: pointAt(track, "16:30", 1) },
    );
    await userEvent.setup({ pointerEventsCheck: 0 }).click(findBars(canvasElement, "ホール 11:00〜14:00")[0]);

    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(7);
    await expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();
    await expect(within(canvasElement).queryByRole("button", { name: "時刻を選んで足す" })).not.toBeInTheDocument();
  },
};

/** ポジションの見出しを押すと、そのポジションの行を畳める。 */
export const CollapseInteractive: Story = {
  name: "Collapse Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const section = within(await within(canvasElement).findByRole("region", { name: "ホールのバー" }));
    const toggle = section.getByRole("button", { expanded: true });
    await findTrack(canvasElement, "hall");
    await expect(findBars(canvasElement, "ホール 09:00〜22:00")[0]).toBeVisible();

    await userEvent.click(toggle);

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(findBars(canvasElement, "ホール 09:00〜22:00")[0]).not.toBeVisible();
    // ほかのポジションは開いたまま。
    await expect(findBars(canvasElement, "キッチン 09:00〜22:00")[0]).toBeVisible();
  },
};

// 読み込んだままの、1行目にすき間なく並ぶ3本（30分の短いバーを別の行に1本）。受付時間は 9:30〜21:30。
const touchingArgs = {
  range: { startMinutes: 9 * 60 + 30, endMinutes: 21 * 60 + 30 },
  bars: toEditableStaffingBars([
    bar("hall", "09:30", "15:00"),
    bar("hall", "15:00", "16:00"),
    bar("hall", "16:00", "21:30"),
    bar("hall", "12:00", "12:30"),
    bar("kitchen", "09:30", "21:30"),
  ]),
} satisfies Partial<EditorArgs>;

/** その位置でいちばん手前にあるバーの名前を返す。押したときに、どのバーが受け取るかを確かめる。 */
const getBarLabelAt = (point: Point) =>
  document.elementFromPoint(point.clientX, point.clientY)?.closest("[data-staffing-bar]")?.getAttribute("aria-label") ??
  null;

const offsetX = (point: Point, dx: number) => ({ ...point, clientX: point.clientX + dx });

/**
 * 端が接しているバーと、30分〜1時間の短いバーでも、押したバーの欄が開き、そのバーだけを削除できる。
 * 読み込んだだけのバーは、接していてもまとめない。削除しても、残ったバーはまとめ直さない。
 */
export const TouchingBarsInteractive: Story = {
  name: "Touching Bars Interactive",
  parameters: behaviorOnly,
  args: touchingArgs,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const track = await findTrack(canvasElement, "hall");
    const openedTimes = async () => {
      const popover = within(await body.findByRole("dialog", { name: "ホールのバー" }));
      return [
        (popover.getByRole("combobox", { name: "開始" }) as HTMLSelectElement).value,
        (popover.getByRole("combobox", { name: "終了" }) as HTMLSelectElement).value,
      ];
    };
    const closePopover = async () => {
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    };
    await expect(getBarLabels(canvasElement, "ホール")).toEqual([
      "ホール 09:30〜15:00",
      "ホール 12:00〜12:30",
      "ホール 15:00〜16:00",
      "ホール 16:00〜21:30",
    ]);

    // 接した境目（15:00と16:00）の左右3pxは、それぞれ自分の側のバーが受け取る。
    await expect(getBarLabelAt(offsetX(pointAt(track, "15:00", 0), -3))).toBe("ホール 09:30〜15:00");
    await expect(getBarLabelAt(offsetX(pointAt(track, "15:00", 0), 3))).toBe("ホール 15:00〜16:00");
    await expect(getBarLabelAt(offsetX(pointAt(track, "16:00", 0), -3))).toBe("ホール 15:00〜16:00");
    await expect(getBarLabelAt(offsetX(pointAt(track, "16:00", 0), 3))).toBe("ホール 16:00〜21:30");

    // 短いバーの端（伸び縮みのつかむ場所）を動かさずに押しても、そのバーの欄が開く。
    const short = () => findBars(canvasElement, "ホール 15:00〜16:00")[0];
    await userEvent.click(getBarEdge(short(), "start"));
    await expect(await openedTimes()).toEqual(["15:00", "16:00"]);
    await closePopover();
    await userEvent.click(getBarEdge(short(), "end"));
    await expect(await openedTimes()).toEqual(["15:00", "16:00"]);
    await closePopover();
    // 隣の長いバーの、接した側の端を押すと、長いバーの欄が開く。
    await userEvent.click(getBarEdge(findBars(canvasElement, "ホール 09:30〜15:00")[0], "end"));
    await expect(await openedTimes()).toEqual(["09:30", "15:00"]);
    await closePopover();
    // 押しただけでは、接したバーはまとまらない。
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(4);

    // 30分のバーも、押せば欄が開き、削除できる。
    await userEvent.click(findBars(canvasElement, "ホール 12:00〜12:30")[0]);
    await expect(await openedTimes()).toEqual(["12:00", "12:30"]);
    await userEvent.click(body.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getBarLabels(canvasElement, "ホール")).toEqual([
      "ホール 09:30〜15:00",
      "ホール 15:00〜16:00",
      "ホール 16:00〜21:30",
    ]);

    // 間の短いバーを削除すると、そのバーだけが消える。
    await userEvent.click(short());
    await expect(await openedTimes()).toEqual(["15:00", "16:00"]);
    await userEvent.click(body.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getBarLabels(canvasElement, "ホール")).toEqual(["ホール 09:30〜15:00", "ホール 16:00〜21:30"]);
    await expect(getRequiredCounts(canvasElement, "ホール")).toEqual(["09:30〜15:00 1人", "16:00〜21:30 1人"]);

    // 空いた 15:00〜16:00 をなぞって足すと、前後のバーと接するので、1本にまとまる。
    await drag(
      { target: track, coords: pointAt(track, "15:00", 1) },
      { target: track, coords: pointAt(track, "16:00", 1) },
    );
    await waitFor(() => expect(getBarLabels(canvasElement, "ホール")).toEqual(["ホール 09:30〜21:30"]));
    await expect(getRequiredCounts(canvasElement, "ホール")).toEqual(["09:30〜21:30 1人"]);
  },
};

/** PCで formPresentation="inline" にすると、「時刻を選んで足す」の入力をDialogではなくその場に出す。 */
export const InlineFormInteractive: Story = {
  name: "Inline Form Interactive",
  parameters: behaviorOnly,
  args: { formPresentation: "inline" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const section = within(await canvas.findByRole("region", { name: "キッチンのバー" }));

    await userEvent.click(section.getByRole("button", { name: "時刻を選んで足す" }));
    const panel = within(await canvas.findByRole("group", { name: "キッチンのバーを足す" }));
    await expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.selectOptions(panel.getByRole("combobox", { name: "開始" }), "15:00");
    await userEvent.selectOptions(panel.getByRole("combobox", { name: "終了" }), "17:00");
    await userEvent.click(panel.getByRole("button", { name: "足す" }));

    await waitFor(() => expect(canvas.queryByRole("group", { name: "キッチンのバーを足す" })).not.toBeInTheDocument());
    await expect(findBars(canvasElement, "キッチン 15:00〜17:00")).toHaveLength(1);
    // その場の入力を閉じると、押したボタンへフォーカスが戻る。
    await waitFor(() => expect(section.getByRole("button", { name: "時刻を選んで足す" })).toHaveFocus());
  },
};

// ==========================================
// 振る舞い（スマートフォン）
// ==========================================

/** スマートフォンでは、指で空いた場所をなぞるとバーが増える。なぞっている間は、開始と終了の時刻を出す。 */
export const MobileSwipeToCreateInteractive: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "Mobile Swipe To Create Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");
    const section = await within(canvasElement).findByRole("region", { name: "ホールのバー" });
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(7);
    // 縦の動きは画面のスクロールに任せ、横の動きだけを受け取る。
    await expect(getComputedStyle(track).touchAction).toBe("pan-y pinch-zoom");
    // 1日が画面の幅に収まり、表は横にスクロールしない。
    await expect(track.getBoundingClientRect().right).toBeLessThanOrEqual(section.getBoundingClientRect().right);
    await expect(section.getBoundingClientRect().right).toBeLessThanOrEqual(
      canvasElement.getBoundingClientRect().right,
    );

    // 一番下の空の行（6行目）で 14:30〜16:30 をなぞる。
    await touch("pointerDown", track, pointAt(track, "14:30", 5, MOBILE_METRICS));
    await expect(canvasElement.querySelector("[data-staffing-drag-time]")).toBeNull();
    await touch("pointerMove", track, pointAt(track, "15:30", 5, MOBILE_METRICS));
    await expect(canvasElement.querySelector("[data-staffing-drag-time]")).toHaveTextContent("14:30〜15:30");
    // 指が行の外（上の行）へ出ても、同じ行のまま続きを受け取る。
    await touch("pointerMove", track, pointAt(track, "16:30", 2, MOBILE_METRICS));
    const timeLabel = canvasElement.querySelector("[data-staffing-drag-time]") as HTMLElement;
    await expect(timeLabel).toHaveTextContent("14:30〜16:30");
    // 時刻は、指で隠れないよう、なぞっている行の上に出す。
    const preview = canvasElement.querySelector("[data-staffing-preview]") as HTMLElement;
    await expect(timeLabel.getBoundingClientRect().bottom).toBeLessThanOrEqual(preview.getBoundingClientRect().top);
    // ほかの指の終了では、確定しない。
    await fireEvent.pointerUp(track, { pointerId: TOUCH_POINTER_ID + 1, pointerType: "touch" });
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(7);
    await touch("pointerUp", track, pointAt(track, "16:30", 2, MOBILE_METRICS));

    await waitFor(() => expect(findBars(canvasElement, "ホール 14:30〜16:30")).toHaveLength(1));
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(8);
    await expect(canvasElement.querySelector("[data-staffing-drag-time]")).toBeNull();
    // できあがる必要人数は、入力しているポジションのグループの中に出て、その場で変わる。
    await expect(getRequiredCounts(section, "ホール")).toEqual([
      "09:00〜11:00 1人",
      "11:00〜14:00 3人",
      "14:00〜14:30 1人",
      "14:30〜16:30 2人",
      "16:30〜17:00 1人",
      "17:00〜18:00 3人",
      "18:00〜22:00 5人",
    ]);
    // 全ポジションをまとめた「できあがる必要人数」は、狭い画面では出さない。
    await expect(within(canvasElement).queryByRole("region", { name: "できあがる必要人数" })).not.toBeInTheDocument();

    // 右から左へなぞっても同じ時間のバーになる。動かさずに離した場合は増えない。
    await swipe(track, { time: "10:30", row: 6 }, "09:30");
    await waitFor(() => expect(findBars(canvasElement, "ホール 09:30〜10:30")).toHaveLength(1));
    await swipe(track, { time: "15:00", row: 6 }, "15:00");
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(9);
  },
};

/** なぞっている途中で画面のスクロールになった場合（pointercancel）は、バーを足さずに捨てる。 */
export const MobileSwipeCancelInteractive: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "Mobile Swipe Cancel Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");

    await touch("pointerDown", track, pointAt(track, "14:30", 5, MOBILE_METRICS));
    await touch("pointerMove", track, pointAt(track, "16:30", 5, MOBILE_METRICS));
    await expect(canvasElement.querySelector("[data-staffing-preview]")).not.toBeNull();
    await touch("pointerCancel", track, pointAt(track, "16:30", 5, MOBILE_METRICS));

    await expect(canvasElement.querySelector("[data-staffing-preview]")).toBeNull();
    await expect(canvasElement.querySelector("[data-staffing-drag-time]")).toBeNull();
    // 捨てたあとに指が離れても、バーは増えない。
    await touch("pointerUp", track, pointAt(track, "16:30", 5, MOBILE_METRICS));
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(7);

    // 捨てたあとも、続けてなぞってバーを足せる。
    await swipe(track, { time: "14:30", row: 5 }, "16:30");
    await waitFor(() => expect(findBars(canvasElement, "ホール 14:30〜16:30")).toHaveLength(1));
  },
};

/** スマートフォンでは、バーを押すと入力のDialogが開き、その1本の時刻を変え、削除できる。 */
export const MobileEditAndDeleteInteractive: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "Mobile Edit And Delete Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    await findTrack(canvasElement, "kitchen");
    const sectionElement = await within(canvasElement).findByRole("region", { name: "キッチンのバー" });
    // 指ではつかめない大きさになるため、端の伸び縮みは出さない。
    await expect(canvasElement.querySelectorAll("[data-staffing-bar-edge]")).toHaveLength(0);

    // 変える: 開始を終了よりあとにすると、終了が開始の30分あとへ動く。選択肢は互いに絞らない。
    await userEvent.click(findBars(canvasElement, "キッチン 11:00〜14:00")[0]);
    const editDialog = within(await body.findByRole("dialog", { name: "キッチンのバーを変える" }));
    await expect(editDialog.queryByRole("combobox", { name: "足す本数" })).not.toBeInTheDocument();
    await userEvent.selectOptions(editDialog.getByRole("combobox", { name: "開始" }), "15:00");
    await expect(editDialog.getByRole("combobox", { name: "終了" })).toHaveValue("15:30");
    await userEvent.selectOptions(editDialog.getByRole("combobox", { name: "終了" }), "17:00");
    // 「変更する」を押すまでは、バーは変わらない。
    await expect(findBars(canvasElement, "キッチン 11:00〜14:00")).toHaveLength(1);
    await userEvent.click(editDialog.getByRole("button", { name: "変更する" }));

    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getBarLabels(canvasElement, "キッチン")).toEqual([
      "キッチン 09:00〜22:00",
      "キッチン 15:00〜17:00",
      "キッチン 18:00〜21:00",
    ]);
    await expect(getRequiredCounts(sectionElement, "キッチン")).toEqual([
      "09:00〜15:00 1人",
      "15:00〜17:00 2人",
      "17:00〜18:00 1人",
      "18:00〜21:00 2人",
      "21:00〜22:00 1人",
    ]);
    // 閉じると、押したバーへフォーカスが戻る。
    await waitFor(() => expect(findBars(canvasElement, "キッチン 15:00〜17:00")[0]).toHaveFocus());

    // 削除: 押した1本だけが消え、フォーカスは「時刻を選んで足す」へ移る。
    await userEvent.click(findBars(canvasElement, "キッチン 15:00〜17:00")[0]);
    const deleteDialog = within(await body.findByRole("dialog", { name: "キッチンのバーを変える" }));
    await userEvent.click(deleteDialog.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getBarLabels(canvasElement, "キッチン")).toEqual(["キッチン 09:00〜22:00", "キッチン 18:00〜21:00"]);
    await waitFor(() => expect(within(sectionElement).getByRole("button", { name: "時刻を選んで足す" })).toHaveFocus());
    // ホールのバーは変わらない。
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(7);
  },
};

/** スマートフォンでも、端が接しているバーと短いバーは、押したバーの入力が開き、そのバーだけを削除できる。 */
export const MobileTouchingBarsInteractive: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "Mobile Touching Bars Interactive",
  parameters: behaviorOnly,
  args: touchingArgs,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const track = await findTrack(canvasElement, "hall");
    const at = (time: string, dx: number) => offsetX(pointAt(track, time, 0, MOBILE_METRICS), dx);

    // 接した境目の左右3pxは、それぞれ自分の側のバーが受け取る。バーの上下の余白（行の端から2px）も、そのバーが受け取る。
    await expect(getBarLabelAt(at("15:00", -3))).toBe("ホール 09:30〜15:00");
    await expect(getBarLabelAt(at("15:00", 3))).toBe("ホール 15:00〜16:00");
    await expect(getBarLabelAt(at("16:00", -3))).toBe("ホール 15:00〜16:00");
    await expect(getBarLabelAt(at("16:00", 3))).toBe("ホール 16:00〜21:30");
    const rowTop = track.getBoundingClientRect().top;
    await expect(getBarLabelAt({ ...at("15:30", 0), clientY: rowTop + 2 })).toBe("ホール 15:00〜16:00");
    await expect(getBarLabelAt({ ...at("15:30", 0), clientY: rowTop + MOBILE_METRICS.rowHeight - 2 })).toBe(
      "ホール 15:00〜16:00",
    );

    // 30分のバーを押して、削除する。
    await userEvent.click(findBars(canvasElement, "ホール 12:00〜12:30")[0]);
    const halfHour = within(await body.findByRole("dialog", { name: "ホールのバーを変える" }));
    await expect(halfHour.getByRole("combobox", { name: "開始" })).toHaveValue("12:00");
    await expect(halfHour.getByRole("combobox", { name: "終了" })).toHaveValue("12:30");
    await userEvent.click(halfHour.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());

    // 間の短いバーを押して、時刻を変える。前のバーから離れ、次のバーとは重なるので、まとまらない。
    await userEvent.click(findBars(canvasElement, "ホール 15:00〜16:00")[0]);
    const short = within(await body.findByRole("dialog", { name: "ホールのバーを変える" }));
    await expect(short.getByRole("combobox", { name: "開始" })).toHaveValue("15:00");
    await userEvent.selectOptions(short.getByRole("combobox", { name: "開始" }), "15:30");
    await userEvent.selectOptions(short.getByRole("combobox", { name: "終了" }), "16:30");
    await userEvent.click(short.getByRole("button", { name: "変更する" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getBarLabels(canvasElement, "ホール")).toEqual([
      "ホール 09:30〜15:00",
      "ホール 15:30〜16:30",
      "ホール 16:00〜21:30",
    ]);

    // 時刻を変えて前後のバーと接すると、1本にまとまる。フォーカスは、まとまった先のバーがないときは「時刻を選んで足す」へ移る。
    await userEvent.click(findBars(canvasElement, "ホール 15:30〜16:30")[0]);
    const merged = within(await body.findByRole("dialog", { name: "ホールのバーを変える" }));
    await userEvent.selectOptions(merged.getByRole("combobox", { name: "開始" }), "15:00");
    await userEvent.selectOptions(merged.getByRole("combobox", { name: "終了" }), "16:00");
    await userEvent.click(merged.getByRole("button", { name: "変更する" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getBarLabels(canvasElement, "ホール")).toEqual(["ホール 09:30〜21:30"]);
    const section = await within(canvasElement).findByRole("region", { name: "ホールのバー" });
    await expect(getRequiredCounts(section, "ホール")).toEqual(["09:30〜21:30 1人"]);
    await waitFor(() => expect(within(section).getByRole("button", { name: "時刻を選んで足す" })).toHaveFocus());

    // まとまった1本を押して削除すると、丸ごと消える。
    await userEvent.click(findBars(canvasElement, "ホール 09:30〜21:30")[0]);
    const whole = within(await body.findByRole("dialog", { name: "ホールのバーを変える" }));
    await userEvent.click(whole.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getBarLabels(canvasElement, "ホール")).toEqual([]);
  },
};

/** スマートフォンでも、「時刻を選んで足す」で選んだ時間のバーが本数分だけ増える。 */
export const MobileAddByFormInteractive: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "Mobile Add By Form Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const sectionElement = await within(canvasElement).findByRole("region", { name: "キッチンのバー" });

    await userEvent.click(within(sectionElement).getByRole("button", { name: "時刻を選んで足す" }));
    const dialog = within(await body.findByRole("dialog", { name: "キッチンのバーを足す" }));
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "開始" }), "11:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "終了" }), "14:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "足す本数" }), "2");
    // いまの2人に、2本を足して4人になる。
    await expect(dialog.getByRole("status")).toHaveTextContent("この時間の必要人数：2人 → 4人");
    await userEvent.click(dialog.getByRole("button", { name: "足す" }));

    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getBarLabels(canvasElement, "キッチン")).toEqual([
      "キッチン 09:00〜22:00",
      "キッチン 11:00〜14:00",
      "キッチン 11:00〜14:00",
      "キッチン 11:00〜14:00",
      "キッチン 18:00〜21:00",
    ]);
    await expect(getRequiredCounts(sectionElement, "キッチン")).toEqual([
      "09:00〜11:00 1人",
      "11:00〜14:00 4人",
      "14:00〜18:00 1人",
      "18:00〜21:00 2人",
      "21:00〜22:00 1人",
    ]);
  },
};

/** スマートフォンでも、上限を超える操作は受け付けず、理由を出す。 */
export const MobileLimitInteractive: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "Mobile Limit Interactive",
  parameters: behaviorOnly,
  args: { limits: { maxConcurrentPerPosition: 3, maxBars: 200 } },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const track = await findTrack(canvasElement, "kitchen");
    const section = within(await within(canvasElement).findByRole("region", { name: "キッチンのバー" }));

    // 時刻を選んで足す: 11:00〜14:00 は2本が重なっている。2本を足すと4本になり、上限の3本を超える。
    await userEvent.click(section.getByRole("button", { name: "時刻を選んで足す" }));
    const dialog = within(await body.findByRole("dialog", { name: "キッチンのバーを足す" }));
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "開始" }), "11:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "終了" }), "14:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "足す本数" }), "2");
    await userEvent.click(dialog.getByRole("button", { name: "足す" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("同じ時間に重ねられるバーは3本までです");
    // Dialogは閉じず、入力を直せる。1本なら足せる。
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "足す本数" }), "1");
    await userEvent.click(dialog.getByRole("button", { name: "足す" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(findBars(canvasElement, "キッチン 11:00〜14:00")).toHaveLength(2);

    // なぞる: 3本が重なった時間に、4本目は引けない。理由をポジションの見出しの下に出す。
    await swipe(track, { time: "12:00", row: 3 }, "13:00");
    await expect(await section.findByRole("alert")).toHaveTextContent("同じ時間に重ねられるバーは3本までです");
    await expect(getBarLabels(canvasElement, "キッチン")).toHaveLength(4);
  },
};

/** スマートフォンでも、受付時間の外のバーを知らせ、切りそろえると押して変えられるようになる。 */
export const MobileTrimOutsideRangeInteractive: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "Mobile Trim Outside Range Interactive",
  parameters: behaviorOnly,
  args: { bars: outsideBars },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await findTrack(canvasElement, "hall");
    await expect(canvas.getByText("受付時間の外にあるバーが3本あります")).toBeInTheDocument();
    // 外にかかるバーは、切りそろえるまで押して変えられない。
    await expect(canvas.queryByRole("button", { name: "キッチン 18:00〜23:00" })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "受付時間に合わせる" }));

    await waitFor(() => expect(canvas.queryByText(/受付時間の外にあるバー/)).not.toBeInTheDocument());
    await expect(getBarLabels(canvasElement, "ホール")).toEqual(["ホール 09:00〜12:00", "ホール 09:00〜22:00"]);
    await expect(getBarLabels(canvasElement, "キッチン")).toEqual(["キッチン 11:00〜14:00", "キッチン 18:00〜22:00"]);
    await userEvent.click(canvas.getByRole("button", { name: "キッチン 18:00〜22:00" }));
    await expect(
      await within(document.body).findByRole("dialog", { name: "キッチンのバーを変える" }),
    ).toBeInTheDocument();
  },
};

/** スマートフォンの読み取り専用では、なぞってもバーは増えず、バーを押しても入力は開かない。 */
export const MobileReadOnlyInteractive: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "Mobile Read Only Interactive",
  parameters: behaviorOnly,
  args: { isReadOnly: true },
  play: async ({ canvasElement }) => {
    const track = await findTrack(canvasElement, "hall");
    const section = await within(canvasElement).findByRole("region", { name: "ホールのバー" });

    await swipe(track, { time: "14:30", row: 1 }, "16:30");
    await userEvent.setup({ pointerEventsCheck: 0 }).click(findBars(canvasElement, "ホール 11:00〜14:00")[0]);

    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(7);
    await expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();
    await expect(within(canvasElement).queryByRole("button", { name: "時刻を選んで足す" })).not.toBeInTheDocument();
    // 読み取り専用でも、できあがる必要人数はポジションのグループの中で確かめられる。
    await expect(getRequiredCounts(section, "ホール")).toEqual([
      "09:00〜11:00 1人",
      "11:00〜14:00 3人",
      "14:00〜17:00 1人",
      "17:00〜18:00 3人",
      "18:00〜22:00 5人",
    ]);
  },
};

/** スマートフォンで formPresentation="inline" にすると、バーを押したときの入力も、Dialogではなくその場に出す。 */
export const MobileInlineFormInteractive: Story = {
  tags: ["vrt-mobile2"],
  globals: mobile2Globals,
  name: "Mobile Inline Form Interactive",
  parameters: behaviorOnly,
  args: { formPresentation: "inline" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await findTrack(canvasElement, "kitchen");

    // 変える
    await userEvent.click(findBars(canvasElement, "キッチン 11:00〜14:00")[0]);
    const editPanel = within(await canvas.findByRole("group", { name: "キッチンのバーを変える" }));
    await expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.selectOptions(editPanel.getByRole("combobox", { name: "終了" }), "15:00");
    await userEvent.click(editPanel.getByRole("button", { name: "変更する" }));
    await waitFor(() =>
      expect(canvas.queryByRole("group", { name: "キッチンのバーを変える" })).not.toBeInTheDocument(),
    );
    await expect(findBars(canvasElement, "キッチン 11:00〜15:00")).toHaveLength(1);
    // その場の入力を閉じると、押したバーへフォーカスが戻る。
    await waitFor(() => expect(findBars(canvasElement, "キッチン 11:00〜15:00")[0]).toHaveFocus());

    // 削除
    await userEvent.click(findBars(canvasElement, "キッチン 11:00〜15:00")[0]);
    const deletePanel = within(await canvas.findByRole("group", { name: "キッチンのバーを変える" }));
    await userEvent.click(deletePanel.getByRole("button", { name: "削除" }));
    await waitFor(() =>
      expect(canvas.queryByRole("group", { name: "キッチンのバーを変える" })).not.toBeInTheDocument(),
    );

    // 足す
    const section = within(canvas.getByRole("region", { name: "キッチンのバー" }));
    await userEvent.click(section.getByRole("button", { name: "時刻を選んで足す" }));
    const addPanel = within(await canvas.findByRole("group", { name: "キッチンのバーを足す" }));
    await userEvent.selectOptions(addPanel.getByRole("combobox", { name: "終了" }), "12:00");
    await expect(addPanel.getByRole("status")).toHaveTextContent("この時間の必要人数：1人 → 2人");
    await userEvent.click(addPanel.getByRole("button", { name: "足す" }));
    await waitFor(() => expect(canvas.queryByRole("group", { name: "キッチンのバーを足す" })).not.toBeInTheDocument());

    await expect(getBarLabels(canvasElement, "キッチン")).toEqual([
      "キッチン 09:00〜12:00",
      "キッチン 09:00〜22:00",
      "キッチン 18:00〜21:00",
    ]);
  },
};
