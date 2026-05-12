import { Flex, Icon, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LuCircleCheck, LuInbox, LuPlus, LuSearch, LuTriangleAlert, LuUsers, LuWifiOff } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
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
    <Empty title="データがありません" description="新しいデータを追加してください" minH="240px" />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      アイコン付き
    </Text>
    <Empty icon={LuInbox} title="受信トレイは空です" description="新しいメッセージはありません" minH="240px" />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      アクション付き
    </Text>
    <Empty
      icon={LuUsers}
      title="スタッフがいません"
      description="スタッフを追加して始めましょう"
      tone="brand"
      minH="240px"
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
    <Empty
      icon={LuSearch}
      title="検索結果が見つかりません"
      description="別のキーワードで検索してみてください"
      minH="240px"
    />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      ページ状態
    </Text>
    <Empty
      icon={LuWifiOff}
      title="ページを開けませんでした"
      description={"通信が切れた可能性があります。\nもう一度読み込むか、Safari、Chrome、Edgeで開いてください。"}
      tone="warning"
      minH="240px"
      action={
        <Button colorPalette="teal" size="md" borderRadius="lg" px={6}>
          再試行する
        </Button>
      }
    />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      サークルアイコン
    </Text>
    <Empty
      icon={LuCircleCheck}
      title="提出が完了しました"
      description={"シフト作成担当者からの連絡をお待ちください\nこのページは閉じて大丈夫です"}
      tone="success"
      iconVariant="circle"
      size="lg"
      minH="240px"
    />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      セクション内の空状態
    </Text>
    <Empty
      icon={LuTriangleAlert}
      title="表示できる情報がありません"
      description="条件を変えてもう一度お試しください。"
      tone="warning"
      variant="section"
    />
  </Flex>
);

export const Variants: StoryObj<typeof meta> = {
  render: () => <AllVariants />,
};
