import { Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoGuide } from "./index";

const meta = {
  title: "UI/InfoGuide",
  component: InfoGuide,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof InfoGuide>;

export default meta;
type Story = StoryObj<typeof InfoGuide>;

// 単一ページ
export const SinglePage: Story = {
  args: {
    title: "シフト申請について",
    pages: [
      <Text key="1">スタッフがシフトの希望を提出できる機能です。提出された希望をもとにシフトを作成します。</Text>,
    ],
  },
};

// 複数ページ（ページ送り）— ダイアログを開いた状態でキャプチャ
export const MultiPage: Story = {
  args: {
    title: "使い方ガイド",
    pages: [
      <Text key="1">ステップ1: まず店舗情報を登録します。店舗名と営業時間を入力してください。</Text>,
      <Text key="2">ステップ2: スタッフを追加します。名前とメールアドレスを入力すると招待が送られます。</Text>,
      <Text key="3">ステップ3: シフト募集を開始すると、スタッフに通知が届きます。</Text>,
    ],
  },
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector("button");
    button?.click();
  },
};
