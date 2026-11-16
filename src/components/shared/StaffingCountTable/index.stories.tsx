import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { StaffingCountTable, type StaffingCountTableCounts } from ".";

type TableArgs = ComponentProps<typeof StaffingCountTable>;
type Change = { rowId: string; positionId: string; count: number };

// ==========================================
// fixture: 早番・遅番の勤務パターンと、ホール・キッチン・レジ
// ==========================================
const positions = [
  { id: "hall", name: "ホール", color: "#3b82f6" },
  { id: "kitchen", name: "キッチン", color: "#c2410c" },
  { id: "register", name: "レジ", color: "#7c3aed" },
];

const shiftTypeRows = [
  { id: "early", label: "早番", detail: "09:00〜15:00" },
  { id: "late", label: "遅番", detail: "15:00〜22:00" },
];

const dateOnlyRows = [{ id: "allDay", label: "1日" }];

const shiftTypeCounts: StaffingCountTableCounts = {
  early: { hall: 2, kitchen: 1 },
  late: { hall: 3, kitchen: 2, register: 1 },
};

/** 値を持つ側の代わり。変えたマスを`changes`へ記録し、Behavior Storyが通知の内容を確かめられるようにする。 */
const TableStory = (args: TableArgs) => {
  const [counts, setCounts] = useState<StaffingCountTableCounts>(args.counts);
  const [changes, setChanges] = useState<Change[]>([]);
  return (
    <>
      <output hidden data-testid="changes">
        {JSON.stringify(changes)}
      </output>
      <StaffingCountTable
        {...args}
        counts={counts}
        onChange={(rowId, positionId, count) => {
          setChanges((current) => [...current, { rowId, positionId, count }]);
          setCounts((current) => ({ ...current, [rowId]: { ...current[rowId], [positionId]: count } }));
        }}
      />
    </>
  );
};

const meta = {
  title: "Shared/StaffingCountTable",
  component: StaffingCountTable,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Box maxW="800px" mx="auto" bg="white" px={4}>
        <Story />
      </Box>
    ),
  ],
  render: (args) => <TableStory {...args} />,
  args: {
    positions,
    rows: shiftTypeRows,
    counts: shiftTypeCounts,
    onChange: () => {},
  },
} satisfies Meta<typeof StaffingCountTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const mobile1 = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
} satisfies Partial<Story>;

const behaviorOnly = { screenshot: { skip: true } };

function readChanges(canvasElement: HTMLElement): Change[] {
  return JSON.parse(within(canvasElement).getByTestId("changes").textContent ?? "[]");
}

// ==========================================
// 見た目
// ==========================================

/** パターン選択: 行は勤務パターン。名前の下に時刻を出す。 */
export const ShiftType: Story = {};

/** 日付選択: 「1日」の1行だけを出す。 */
export const DateOnly: Story = {
  args: { rows: dateOnlyRows, counts: { allDay: { hall: 4, kitchen: 2 } } },
};

/** 人数を1つも入れていない。空欄は0人として扱う。 */
export const Empty: Story = { args: { counts: {} } };

/** 読み取り専用。入力欄を無効にする。 */
export const ReadOnly: Story = { args: { isReadOnly: true } };

/** 長い名前と、ポジションが多い店舗。入力欄の位置は行が変わってもそろう。 */
export const ManyPositions: Story = {
  args: {
    positions: [
      ...positions,
      { id: "takeout", name: "レジ・テイクアウト受付カウンター", color: "#db2777" },
      { id: "delivery", name: "デリバリー", color: "#b45309" },
      { id: "dish", name: "洗い場", color: "#0f766e" },
      { id: "prep", name: "仕込み", color: "#475569" },
    ],
    rows: [{ id: "early", label: "早番（開店準備と仕込みを含む）", detail: "09:00〜15:00" }, shiftTypeRows[1]],
    counts: { early: { hall: 12, takeout: 1 }, late: { hall: 3, delivery: 2 } },
  },
};

/** スマートフォン: 勤務パターンごとに、ポジションを縦に並べる。 */
export const Mobile: Story = { ...mobile1 };

export const MobileDateOnly: Story = { ...mobile1, args: DateOnly.args };

// ==========================================
// Behavior
// ==========================================

const typeCounts: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const earlyRegister = canvas.getByRole("spinbutton", { name: "早番のレジの必要人数" });
  const lateHall = canvas.getByRole("spinbutton", { name: "遅番のホールの必要人数" });

  // 空欄のマスへ数字を打つと、行とポジションと人数が通知される。
  await userEvent.type(earlyRegister, "4");
  await expect(earlyRegister).toHaveValue(4);

  // 消すと0人として通知され、空欄へ戻る。
  await userEvent.clear(lateHall);
  await expect(lateHall).toHaveValue(null);

  await expect(readChanges(canvasElement)).toEqual([
    { rowId: "early", positionId: "register", count: 4 },
    { rowId: "late", positionId: "hall", count: 0 },
  ]);
};

export const TypeCountInteractive: Story = {
  parameters: behaviorOnly,
  play: typeCounts,
};

export const MobileTypeCountInteractive: Story = {
  ...mobile1,
  parameters: behaviorOnly,
  play: typeCounts,
};

/** 上限を超える数字は、上限に収めて通知する。 */
export const MaxInteractive: Story = {
  args: { counts: {}, max: 20 },
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("spinbutton", { name: "早番のホールの必要人数" });

    await userEvent.type(input, "150");

    await expect(input).toHaveValue(20);
    await expect(readChanges(canvasElement).at(-1)).toEqual({ rowId: "early", positionId: "hall", count: 20 });
  },
};

/** 読み取り専用では、どのマスも入力できない。 */
export const ReadOnlyInteractive: Story = {
  args: { isReadOnly: true },
  parameters: behaviorOnly,
  play: async ({ canvasElement }) => {
    const inputs = within(canvasElement).getAllByRole("spinbutton");

    await expect(inputs).toHaveLength(shiftTypeRows.length * positions.length);
    for (const input of inputs) await expect(input).toBeDisabled();
    await expect(readChanges(canvasElement)).toEqual([]);
  },
};
