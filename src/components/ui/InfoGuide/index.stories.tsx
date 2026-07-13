import { Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { useLayoutEffect, useRef } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
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

const multiPageArgs = {
  title: "使い方ガイド",
  pages: [
    <Text key="1">ステップ1: まず店舗情報を登録します。店舗名と営業時間を入力してください。</Text>,
    <Text key="2">ステップ2: スタッフを追加します。名前とメールアドレスを入力すると招待が送られます。</Text>,
    <Text key="3">ステップ3: シフト募集を開始すると、スタッフに通知が届きます。</Text>,
  ],
} satisfies ComponentProps<typeof InfoGuide>;

// 初期状態はVRTで守る。
export const MultiPage: Story = {
  args: multiPageArgs,
};

// ダイアログを開いた代表状態は、操作テストと分離してVRTで守る。
export const MultiPageDialogOpen: Story = {
  args: multiPageArgs,
  render: (args) => <OpenInfoGuideStory {...args} />,
};

export const MultiPageBehavior: Story = {
  args: multiPageArgs,
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "使い方ガイド" }));
    const dialog = await screen.findByRole("dialog", { name: "使い方ガイド" });
    await waitFor(() => expect(dialog).toBeVisible());

    await userEvent.click(screen.getByRole("button", { name: "次へ" }));
    await expect(
      await screen.findByText("ステップ2: スタッフを追加します。名前とメールアドレスを入力すると招待が送られます。"),
    ).toBeVisible();
  },
};

function OpenInfoGuideStory(props: ComponentProps<typeof InfoGuide>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasOpened = useRef(false);

  useLayoutEffect(() => {
    if (hasOpened.current) return;
    const trigger = rootRef.current?.querySelector<HTMLButtonElement>("button");
    if (!trigger) return;

    hasOpened.current = true;
    trigger.click();
  }, []);

  return (
    <div ref={rootRef}>
      <InfoGuide {...props} />
    </div>
  );
}
