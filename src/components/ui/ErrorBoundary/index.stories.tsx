import { Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ErrorBoundary } from ".";

function ThrowingComponent({ message }: { message: string }): never {
  throw new Error(message);
}

const meta = {
  title: "ui/ErrorBoundary",
  component: ErrorBoundary,
} satisfies Meta<typeof ErrorBoundary>;
export default meta;

export const NoError: StoryObj<typeof meta> = {
  args: {
    fallback: <Text>エラーが発生しました</Text>,
    children: <Text>正常にレンダリングされています</Text>,
  },
};

export const WithStaticFallback: StoryObj<typeof meta> = {
  args: {
    fallback: <Text color="red.500">エラーが発生しました。再度お試しください。</Text>,
    children: <ThrowingComponent message="Test error" />,
  },
};

export const WithRenderFunctionFallback: StoryObj<typeof meta> = {
  args: {
    fallback: (error: Error) => <Text color="red.500">エラー: {error.message}</Text>,
    children: <ThrowingComponent message="Something went wrong" />,
  },
};
