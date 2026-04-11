import { Button, Flex, Icon, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LuInbox, LuPlus, LuSearch, LuUsers } from "react-icons/lu";
import { Empty } from ".";

const meta = {
  title: "UI/Empty",
  component: Empty,
  args: {
    title: "データがありません",
    description: "新しいデータを追加してください",
  },
} satisfies Meta<typeof Empty>;
export default meta;

const AllVariants = () => (
  <Flex direction="column" gap={4} p={4}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
      基本
    </Text>
    <Empty title="データがありません" description="新しいデータを追加してください" />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      アイコン付き
    </Text>
    <Empty icon={LuInbox} title="受信トレイは空です" description="新しいメッセージはありません" />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      アクション付き
    </Text>
    <Empty
      icon={LuUsers}
      title="スタッフがいません"
      description="スタッフを追加して始めましょう"
      action={
        <Button colorPalette="teal">
          <Icon as={LuPlus} mr={1} />
          スタッフを追加
        </Button>
      }
    />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      検索結果なし
    </Text>
    <Empty icon={LuSearch} title="検索結果が見つかりません" description="別のキーワードで検索してみてください" />
  </Flex>
);

export const Variants: StoryObj<typeof meta> = {
  render: () => <AllVariants />,
};
