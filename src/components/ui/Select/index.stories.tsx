import { Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Select, type SelectItemType } from ".";

const meta = {
  title: "UI/Select",
  component: Select,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
  { value: "1", label: "選択肢1" },
  { value: "2", label: "選択肢2" },
  { value: "3", label: "選択肢3" },
] satisfies SelectItemType[];

const AllVariants = () => (
  <Flex direction="column" gap={3} p={4} minW="240px">
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
      選択済み
    </Text>
    <Select items={items} value="1" onChange={() => {}} />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      未選択（プレースホルダー）
    </Text>
    <Select items={items} value={undefined} onChange={() => {}} placeholder="選択してください" />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      エラー状態
    </Text>
    <Select items={items} value={undefined} onChange={() => {}} invalid placeholder="必須項目です" />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      Portal あり
    </Text>
    <Select items={items} value="1" onChange={() => {}} usePortal={true} />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      Portal なし
    </Text>
    <Select items={items} value="1" onChange={() => {}} usePortal={false} />
  </Flex>
);

const InteractiveDemo = () => {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <div style={{ padding: 16, minWidth: 240 }}>
      <Select items={items} value={value} onChange={setValue} placeholder="選択してください" />
    </div>
  );
};

export const Variants: Story = {
  render: () => <AllVariants />,
  args: {
    onChange: () => {},
  },
};

export const Interactive: Story = {
  render: () => <InteractiveDemo />,
  args: {
    onChange: () => {},
  },
};
