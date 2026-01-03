import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { type LocalPosition, PositionEditor } from ".";

const meta = {
  title: "features/Shop/PositionEditor",
  component: PositionEditor,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "600px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PositionEditor>;

export default meta;

const defaultPositions: LocalPosition[] = [
  { id: "1", name: "ホール", order: 0 },
  { id: "2", name: "キッチン", order: 1 },
  { id: "3", name: "レジ", order: 2 },
  { id: "4", name: "その他", order: 3 },
];

const PositionEditorWithState = ({
  initialPositions = defaultPositions,
  disabled = false,
}: {
  initialPositions?: LocalPosition[];
  disabled?: boolean;
}) => {
  const [positions, setPositions] = useState(initialPositions);
  return <PositionEditor positions={positions} onChange={setPositions} disabled={disabled} />;
};

export const Basic: StoryObj = {
  render: () => <PositionEditorWithState />,
};

export const Empty: StoryObj = {
  render: () => <PositionEditorWithState initialPositions={[]} />,
};

export const MaxReached: StoryObj = {
  render: () => (
    <PositionEditorWithState
      initialPositions={[
        { id: "1", name: "ポジション1", order: 0 },
        { id: "2", name: "ポジション2", order: 1 },
        { id: "3", name: "ポジション3", order: 2 },
        { id: "4", name: "ポジション4", order: 3 },
        { id: "5", name: "ポジション5", order: 4 },
        { id: "6", name: "ポジション6", order: 5 },
        { id: "7", name: "ポジション7", order: 6 },
        { id: "8", name: "ポジション8", order: 7 },
        { id: "9", name: "ポジション9", order: 8 },
        { id: "10", name: "ポジション10", order: 9 },
      ]}
    />
  ),
};

export const Disabled: StoryObj = {
  render: () => <PositionEditorWithState disabled />,
};
