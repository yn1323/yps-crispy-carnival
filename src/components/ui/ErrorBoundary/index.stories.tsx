import { Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { DefaultErrorFallback, ErrorBoundary } from ".";

function ThrowingComponent({ message }: { message: string }): never {
  throw new Error(message);
}

const meta = {
  title: "UI/ErrorBoundary",
  component: ErrorBoundary,
} satisfies Meta<typeof ErrorBoundary>;
export default meta;

type Story = StoryObj<typeof meta>;

const AllVariants = () => (
  <Flex direction="column" gap={4} p={4}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
      エラーなし（正常表示）
    </Text>
    <ErrorBoundary>
      <Text>正常にレンダリングされています</Text>
    </ErrorBoundary>

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      既定フォールバック
    </Text>
    <ErrorBoundary>
      <ThrowingComponent message="Unexpected rendering error" />
    </ErrorBoundary>

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      通信系エラー
    </Text>
    <DefaultErrorFallback error={new TypeError("Failed to fetch")} minH="240px" onRefresh={() => {}} />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      長いエラーでも概要表示
    </Text>
    <DefaultErrorFallback
      error={
        new Error(
          "ArgumentValidationError: Object is missing the required field. This message should not be shown directly to users.",
        )
      }
      minH="240px"
      onRefresh={() => {}}
    />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      静的カスタムフォールバック
    </Text>
    <ErrorBoundary fallback={<Text color="red.500">エラーが発生しました。再度お試しください。</Text>}>
      <ThrowingComponent message="Test error" />
    </ErrorBoundary>

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      関数カスタムフォールバック
    </Text>
    <ErrorBoundary fallback={() => <Text color="red.500">カスタムエラー表示</Text>}>
      <ThrowingComponent message="Something went wrong" />
    </ErrorBoundary>
  </Flex>
);

export const Variants: Story = {
  render: () => <AllVariants />,
  args: {
    fallback: <Text>エラーが発生しました</Text>,
    children: <Text>正常にレンダリングされています</Text>,
  },
};

let refreshClickCount = 0;

export const RefreshAction: Story = {
  args: {
    children: <Text>Story args placeholder</Text>,
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  render: () => (
    <DefaultErrorFallback
      error={new TypeError("Failed to fetch")}
      minH="320px"
      onRefresh={() => {
        refreshClickCount += 1;
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    refreshClickCount = 0;
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("ページを表示できませんでした")).toBeInTheDocument();
    await expect(await canvas.findByText("再読み込みする")).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: "再読み込みする" }));

    expect(refreshClickCount).toBe(1);
  },
};
