import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { PositionManager } from ".";

const meta = {
  title: "Features/Shop/PositionManager",
  component: PositionManager,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof PositionManager>;

export default meta;

type Story = StoryObj<typeof meta>;

const mockPositions = [
  { _id: "pos1" as Id<"shopPositions">, name: "ホール", order: 0 },
  { _id: "pos2" as Id<"shopPositions">, name: "キッチン", order: 1 },
  { _id: "pos3" as Id<"shopPositions">, name: "レジ", order: 2 },
  { _id: "pos4" as Id<"shopPositions">, name: "その他", order: 3 },
];

export const Basic: Story = {
  args: {
    shopId: "shop123" as Id<"shops">,
    positions: mockPositions,
  },
};

export const Empty: Story = {
  args: {
    shopId: "shop123" as Id<"shops">,
    positions: [],
  },
};

export const MaxReached: Story = {
  args: {
    shopId: "shop123" as Id<"shops">,
    positions: [
      { _id: "pos1" as Id<"shopPositions">, name: "ホール", order: 0 },
      { _id: "pos2" as Id<"shopPositions">, name: "キッチン", order: 1 },
      { _id: "pos3" as Id<"shopPositions">, name: "レジ", order: 2 },
      { _id: "pos4" as Id<"shopPositions">, name: "ドリンク", order: 3 },
      { _id: "pos5" as Id<"shopPositions">, name: "デザート", order: 4 },
      { _id: "pos6" as Id<"shopPositions">, name: "清掃", order: 5 },
      { _id: "pos7" as Id<"shopPositions">, name: "接客", order: 6 },
      { _id: "pos8" as Id<"shopPositions">, name: "調理補助", order: 7 },
      { _id: "pos9" as Id<"shopPositions">, name: "発注", order: 8 },
      { _id: "pos10" as Id<"shopPositions">, name: "その他", order: 9 },
    ],
  },
};
