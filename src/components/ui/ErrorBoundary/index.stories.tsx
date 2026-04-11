import { Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ErrorBoundary } from ".";

function ThrowingComponent({ message }: { message: string }): never {
  throw new Error(message);
}

const meta = {
  title: "UI/ErrorBoundary",
  component: ErrorBoundary,
} satisfies Meta<typeof ErrorBoundary>;
export default meta;

const AllVariants = () => (
  <Flex direction="column" gap={4} p={4}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
      エラーなし（正常表示）
    </Text>
    <ErrorBoundary fallback={<Text>エラーが発生しました</Text>}>
      <Text>正常にレンダリングされています</Text>
    </ErrorBoundary>

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      静的フォールバック
    </Text>
    <ErrorBoundary fallback={<Text color="red.500">エラーが発生しました。再度お試しください。</Text>}>
      <ThrowingComponent message="Test error" />
    </ErrorBoundary>

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      関数フォールバック（エラーメッセージ表示）
    </Text>
    <ErrorBoundary fallback={(error: Error) => <Text color="red.500">エラー: {error.message}</Text>}>
      <ThrowingComponent message="Something went wrong" />
    </ErrorBoundary>
  </Flex>
);

export const Variants: StoryObj<typeof meta> = {
  render: () => <AllVariants />,
  args: {
    fallback: <Text>エラーが発生しました</Text>,
    children: <Text>正常にレンダリングされています</Text>,
  },
};
