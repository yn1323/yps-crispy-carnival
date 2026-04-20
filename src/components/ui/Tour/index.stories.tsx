import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Tour, type TourStep } from "./index";

const meta: Meta<typeof Tour> = {
  title: "UI/Tour",
  component: Tour,
};

export default meta;
type Story = StoryObj<typeof meta>;

const demoSteps: TourStep[] = [
  {
    target: "body",
    placement: "center",
    title: "ツアーをはじめます",
    content: "画面の見方を順にご案内します ごゆっくりどうぞ",
  },
  {
    target: '[data-tour-story="card-a"]',
    placement: "bottom-start",
    title: "最初のカード",
    content: "ここが起点になります まずはここから",
  },
  {
    target: '[data-tour-story="card-b"]',
    placement: "top",
    title: "ふたつめのカード",
    content: "次はこちら 関連する情報がまとまっています",
  },
  {
    target: '[data-tour-story="cta"]',
    placement: "bottom-end",
    title: "最後にここ",
    content: "準備ができたら押してみましょう",
  },
  {
    target: "body",
    placement: "center",
    title: "以上です",
    content: "自由に触ってみてください",
  },
];

const DemoLayout = () => {
  const [run, setRun] = useState(false);

  return (
    <Box minH="100vh" bg="gray.50" p={8}>
      <Stack gap={6} maxW="960px" mx="auto">
        <Flex align="center" justify="space-between">
          <Text fontSize="xl" fontWeight={700} color="gray.900">
            Tour デモ
          </Text>
          <Button data-testid="start-tour" onClick={() => setRun(true)} colorPalette="teal" size="sm">
            ツアー開始
          </Button>
        </Flex>

        <Flex gap={4}>
          <Box
            data-tour-story="card-a"
            flex={1}
            bg="white"
            borderRadius="xl"
            borderWidth="1px"
            borderColor="gray.200"
            p={6}
            boxShadow="0 1px 2px rgba(0,0,0,0.03)"
          >
            <Text fontSize="sm" fontWeight={700} color="gray.800" mb={1}>
              カードA
            </Text>
            <Text fontSize="xs" color="gray.500">
              ツアー1ステップ目の対象
            </Text>
          </Box>

          <Box
            data-tour-story="card-b"
            flex={1}
            bg="white"
            borderRadius="xl"
            borderWidth="1px"
            borderColor="gray.200"
            p={6}
            boxShadow="0 1px 2px rgba(0,0,0,0.03)"
          >
            <Text fontSize="sm" fontWeight={700} color="gray.800" mb={1}>
              カードB
            </Text>
            <Text fontSize="xs" color="gray.500">
              ツアー2ステップ目の対象
            </Text>
          </Box>
        </Flex>

        <Flex justify="flex-end">
          <Button data-tour-story="cta" colorPalette="teal">
            実行
          </Button>
        </Flex>
      </Stack>

      <Tour
        run={run}
        steps={demoSteps}
        onEvent={(e) => {
          if (e.type === "tour:end") setRun(false);
        }}
      />
    </Box>
  );
};

/**
 * シンプルな3カード構成でツアーの見た目と動きを確認する Story。
 * 「ツアー開始」ボタンで発火。
 */
export const Default: Story = {
  render: () => <DemoLayout />,
};

/**
 * 起動→1ステップ目のタイトル表示→「次へ」で2ステップ目へ進む、の最低限を自動検証する Story。
 * react-joyride のツールチップは document.body に描画されるため、canvas ではなく document から探す。
 */
export const Interactive: Story = {
  render: () => <DemoLayout />,
  play: async ({ canvasElement }) => {
    const startButton = canvasElement.querySelector<HTMLButtonElement>('[data-testid="start-tour"]');
    startButton?.click();

    const findByText = async <T extends HTMLElement = HTMLElement>(
      selector: string,
      text: string,
      timeout = 2000,
    ): Promise<T | null> => {
      const start = performance.now();
      while (performance.now() - start < timeout) {
        const match = Array.from(document.querySelectorAll<T>(selector)).find((el) => el.textContent?.trim() === text);
        if (match) return match;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return null;
    };

    const firstTitle = await findByText("*", "ツアーをはじめます");
    if (!firstTitle) throw new Error("1ステップ目のタイトルが表示されなかった");

    const nextButton = await findByText<HTMLButtonElement>("button", "次へ");
    nextButton?.click();

    const secondTitle = await findByText("*", "最初のカード");
    if (!secondTitle) throw new Error("「次へ」で2ステップ目に遷移しなかった");
  },
};
