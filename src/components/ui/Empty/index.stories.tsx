import { Button, Icon } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LuInbox, LuPlus, LuSearch, LuUsers } from "react-icons/lu";
import { Empty } from ".";

const meta = {
  title: "ui/Empty",
  component: Empty,
  args: {
    title: "データがありません",
    description: "新しいデータを追加してください",
  },
} satisfies Meta<typeof Empty>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};

export const WithIcon: StoryObj<typeof meta> = {
  args: {
    icon: LuInbox,
    title: "受信トレイは空です",
    description: "新しいメッセージはありません",
  },
};

export const WithAction: StoryObj<typeof meta> = {
  args: {
    icon: LuUsers,
    title: "スタッフがいません",
    description: "スタッフを追加して始めましょう",
    action: (
      <Button colorPalette="teal">
        <Icon as={LuPlus} mr={1} />
        スタッフを追加
      </Button>
    ),
  },
};

export const SearchNoResults: StoryObj<typeof meta> = {
  args: {
    icon: LuSearch,
    title: "検索結果が見つかりません",
    description: "別のキーワードで検索してみてください",
  },
};
