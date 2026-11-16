import { Box, Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { TIME_AXIS_PADDING_PX } from "@/src/components/shared/ShiftTimeline/constants";
import { type EditableStaffingBar, toEditableStaffingBars } from "@/src/domains/shift/staffingBars";
import { timeToMinutes } from "@/src/domains/shift/time";
import type { StaffingBar } from "@/src/domains/shift/types";
import { RequiredCountStrip, StaffingBarEditor } from ".";
import { BAR_ROW_HEIGHT_PX } from "./script";

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

/** 値を持つ側の代わり。バーの表と「できあがる必要人数」を、同じ幅で縦に並べる。 */
const EditorStory = (args: EditorArgs) => {
  const [bars, setBars] = useState<readonly EditableStaffingBar[]>(args.bars);
  return (
    <Stack gap={4}>
      <StaffingBarEditor {...args} bars={bars} onChange={setBars} />
      <Box pt={3} borderTopWidth="1px" borderColor="gray.200">
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

const mobile1 = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
} satisfies Partial<Story>;

const mobile2 = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
} satisfies Partial<Story>;

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

/** PC: 受付時間が30分で始まり30分で終わる。端に残る編集できない時間を灰色にする。 */
export const HalfHourRange: Story = {
  args: {
    range: { startMinutes: 9 * 60 + 30, endMinutes: 21 * 60 + 30 },
    bars: toEditableStaffingBars([
      bar("hall", "09:30", "21:30"),
      bar("hall", "11:00", "14:30"),
      bar("kitchen", "09:30", "15:00"),
    ]),
  },
};

/** PC: 読み取り専用。足すボタンと空の行を出さない。 */
export const ReadOnly: Story = { args: { isReadOnly: true } };

/** PC: 長いポジション名と、ポジションが多い型。 */
export const ManyPositions: Story = {
  args: {
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
  },
};

/** スマートフォン: バーの表を出さず、時間と本数の行で見せる。 */
export const Mobile: Story = { ...mobile2 };

export const MobileSmall: Story = { ...mobile1 };

export const MobileEmpty: Story = { ...mobile2, args: { bars: [] } };

export const MobileOutsideRange: Story = { ...mobile2, args: { bars: outsideBars } };

export const MobileReadOnly: Story = { ...mobile2, args: { isReadOnly: true } };

// ==========================================
// 操作の補助
// ==========================================

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
const pointAt = (track: HTMLElement, time: string, rowIndex: number) => {
  const rect = track.getBoundingClientRect();
  const hourWidth = (rect.width - TIME_AXIS_PADDING_PX * 2) / ((RANGE.endMinutes - RANGE.startMinutes) / 60);
  return {
    clientX: rect.left + TIME_AXIS_PADDING_PX + ((timeToMinutes(time) - RANGE.startMinutes) / 60) * hourWidth,
    clientY: rect.top + rowIndex * BAR_ROW_HEIGHT_PX + BAR_ROW_HEIGHT_PX / 2,
  };
};

type Point = { clientX: number; clientY: number };

/**
 * ドラッグの開始、移動、終了を分けて送る。ボタンを押している状態を引き継ぐため、同じ操作者で送る。
 * 押す場所（空いた行、バーの端）と、離す場所（時間の軸）は別の要素にできる。
 */
const drag = async (from: { target: HTMLElement; coords: Point }, to: { target: HTMLElement; coords: Point }) => {
  const user = userEvent.setup();
  await user.pointer({ keys: "[MouseLeft>]", target: from.target, coords: from.coords });
  await user.pointer({ target: to.target, coords: to.coords });
  await user.pointer({ keys: "[/MouseLeft]", target: to.target, coords: to.coords });
};

const getBarEdge = (barElement: HTMLElement, edge: "start" | "end") =>
  barElement.querySelector(`[data-staffing-bar-edge="${edge}"]`) as HTMLElement;

/** 「できあがる必要人数」の、ポジションの行の内容を返す。 */
const getRequiredCounts = (canvasElement: HTMLElement, positionName: string) =>
  within(within(canvasElement).getByRole("list", { name: `${positionName}の必要人数` }))
    .getAllByRole("listitem")
    .map((item) => item.getAttribute("aria-label") ?? item.textContent);

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

    // 右から左へなぞっても同じ時間のバーになる。動かさずに離した場合は増えない。
    await drag(
      { target: track, coords: pointAt(track, "11:00", 6) },
      { target: track, coords: pointAt(track, "09:30", 6) },
    );
    await waitFor(() => expect(findBars(canvasElement, "ホール 09:30〜11:00")).toHaveLength(1));
    await drag(
      { target: track, coords: pointAt(track, "15:00", 6) },
      { target: track, coords: pointAt(track, "15:00", 6) },
    );
    await expect(getBarLabels(canvasElement, "ホール")).toHaveLength(9);
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
  },
};

/** 「時刻を選んで足す」で、選んだ時間のバーが本数分だけ増える。キーボードでも同じ操作ができる。 */
export const AddByFormInteractive: Story = {
  name: "Add By Form Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const section = within(await within(canvasElement).findByRole("region", { name: "キッチンのバー" }));

    await userEvent.click(section.getByRole("button", { name: "時刻を選んで足す" }));
    const dialog = within(await body.findByRole("dialog", { name: "キッチンのバーを足す" }));
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "開始" }), "17:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "終了" }), "21:00");
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "本数" }), "3");
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
    await userEvent.selectOptions(popover.getByRole("combobox", { name: "終了" }), "15:30");
    await waitFor(() => expect(findBars(canvasElement, "キッチン 11:00〜15:30")).toHaveLength(1));
    await userEvent.selectOptions(popover.getByRole("combobox", { name: "開始" }), "10:30");
    await waitFor(() => expect(findBars(canvasElement, "キッチン 10:30〜15:30")).toHaveLength(1));

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
      { target: track, coords: pointAt(track, "14:00", 5) },
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

// ==========================================
// 振る舞い（スマートフォン）
// ==========================================

/** 一覧の行の内容（時間と本数）を返す。 */
const getGroupLabels = (section: HTMLElement) =>
  within(section)
    .queryAllByRole("button", { name: /本$/ })
    .map((element) => element.getAttribute("aria-label"));

/** スマートフォンでは、ボタンと時刻の選択で、足す・変える・削除ができる。 */
export const MobileAddEditDeleteInteractive: Story = {
  ...mobile2,
  name: "Mobile Add Edit Delete Interactive",
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const sectionElement = await within(canvasElement).findByRole("region", { name: "キッチンのバー" });
    const section = within(sectionElement);
    await expect(getGroupLabels(sectionElement)).toEqual(["09:00〜22:00 1本", "11:00〜14:00 1本", "18:00〜21:00 1本"]);

    // 足す: 同じ時間のバーは1行にまとまり、本数が出る。
    await userEvent.click(section.getByRole("button", { name: "時刻を選んで足す" }));
    const addDialog = within(await body.findByRole("dialog", { name: "キッチンのバーを足す" }));
    await userEvent.selectOptions(addDialog.getByRole("combobox", { name: "開始" }), "11:00");
    await userEvent.selectOptions(addDialog.getByRole("combobox", { name: "終了" }), "14:00");
    await userEvent.selectOptions(addDialog.getByRole("combobox", { name: "本数" }), "2");
    await userEvent.click(addDialog.getByRole("button", { name: "足す" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getGroupLabels(sectionElement)).toEqual(["09:00〜22:00 1本", "11:00〜14:00 3本", "18:00〜21:00 1本"]);

    // 変える: 行を押して開くシートで、時間と本数を変える。
    await userEvent.click(section.getByRole("button", { name: "11:00〜14:00 3本" }));
    const editDialog = within(await body.findByRole("dialog", { name: "キッチンのバーを変える" }));
    await expect(editDialog.getByRole("combobox", { name: "本数" })).toHaveValue("3");
    await userEvent.selectOptions(editDialog.getByRole("combobox", { name: "終了" }), "15:00");
    await userEvent.selectOptions(editDialog.getByRole("combobox", { name: "本数" }), "2");
    await userEvent.click(editDialog.getByRole("button", { name: "変更する" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getGroupLabels(sectionElement)).toEqual(["09:00〜22:00 1本", "11:00〜15:00 2本", "18:00〜21:00 1本"]);
    await expect(
      within(within(canvasElement).getByRole("list", { name: "キッチンの必要人数" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["09:00〜11:001人", "11:00〜15:003人", "15:00〜18:001人", "18:00〜21:002人", "21:00〜22:001人"]);

    // 削除: まとめた本数ごと消える。
    await userEvent.click(section.getByRole("button", { name: "11:00〜15:00 2本" }));
    const deleteDialog = within(await body.findByRole("dialog", { name: "キッチンのバーを変える" }));
    await userEvent.click(deleteDialog.getByRole("button", { name: "2本とも削除" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getGroupLabels(sectionElement)).toEqual(["09:00〜22:00 1本", "18:00〜21:00 1本"]);
  },
};

/** スマートフォンでも、上限を超える本数は受け付けず、シートの中に理由を出す。 */
export const MobileLimitInteractive: Story = {
  ...mobile2,
  name: "Mobile Limit Interactive",
  parameters: behaviorOnly,
  args: { limits: { maxConcurrentPerPosition: 3, maxBars: 200 } },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const sectionElement = await within(canvasElement).findByRole("region", { name: "キッチンのバー" });
    const section = within(sectionElement);

    // 11:00〜14:00 は、9:00〜22:00 のバーと合わせて2本が重なっている。3本にすると4本が重なる。
    await userEvent.click(section.getByRole("button", { name: "11:00〜14:00 1本" }));
    const dialog = within(await body.findByRole("dialog", { name: "キッチンのバーを変える" }));
    await userEvent.selectOptions(dialog.getByRole("combobox", { name: "本数" }), "3");
    await userEvent.click(dialog.getByRole("button", { name: "変更する" }));

    await expect(await dialog.findByRole("alert")).toHaveTextContent("同じ時間に重ねられるバーは3本までです");
    // シートは閉じず、入力を直せる。閉じると、バーは変わっていない。
    await userEvent.click(dialog.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(getGroupLabels(sectionElement)).toEqual(["09:00〜22:00 1本", "11:00〜14:00 1本", "18:00〜21:00 1本"]);
  },
};

/** スマートフォンでも、受付時間の外のバーを知らせ、切りそろえられる。 */
export const MobileTrimOutsideRangeInteractive: Story = {
  ...mobile2,
  name: "Mobile Trim Outside Range Interactive",
  parameters: behaviorOnly,
  args: { bars: outsideBars },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sectionElement = await canvas.findByRole("region", { name: "ホールのバー" });
    // 外にかかるバーは、切りそろえるまで押して変えられない。
    await expect(getGroupLabels(sectionElement)).toEqual(["09:00〜22:00 1本"]);

    await userEvent.click(canvas.getByRole("button", { name: "受付時間に合わせる" }));

    await waitFor(() => expect(canvas.queryByText(/受付時間の外にあるバー/)).not.toBeInTheDocument());
    await expect(getGroupLabels(sectionElement)).toEqual(["09:00〜12:00 1本", "09:00〜22:00 1本"]);
  },
};
