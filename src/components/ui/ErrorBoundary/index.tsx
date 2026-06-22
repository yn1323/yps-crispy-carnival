import type { BoxProps } from "@chakra-ui/react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";

const FALLBACK_DESCRIPTION = "一時的な問題が発生しました。ページを再読み込みして、もう一度お試しください。";
const NETWORK_ERROR_DESCRIPTION = "通信が不安定な可能性があります。ページを再読み込みして、もう一度お試しください。";

type DefaultErrorFallbackProps = {
  error: unknown;
  onRefresh?: () => void;
  minH?: BoxProps["minH"];
};

type Props = {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
};

type State = { error: Error | null };

function getErrorDescription(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("load failed") ||
    normalizedMessage.includes("timeout")
  ) {
    return NETWORK_ERROR_DESCRIPTION;
  }

  return FALLBACK_DESCRIPTION;
}

function reloadPage(): void {
  window.location.reload();
}

export function DefaultErrorFallback({ error, onRefresh = reloadPage, minH = "100dvh" }: DefaultErrorFallbackProps) {
  return (
    <Empty
      icon={LuTriangleAlert}
      title="ページを表示できませんでした"
      description={getErrorDescription(error)}
      tone="danger"
      minH={minH}
      action={
        <Button colorPalette="teal" size="md" borderRadius="lg" px={6} onClick={onRefresh}>
          再読み込みする
        </Button>
      }
    />
  );
}

export function RouteErrorFallback({ error }: { error: unknown; reset?: () => void }) {
  return <DefaultErrorFallback error={error} />;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.error) {
      const { fallback } = this.props;
      if (!fallback) return <DefaultErrorFallback error={this.state.error} />;
      return typeof fallback === "function" ? fallback(this.state.error) : fallback;
    }
    return this.props.children;
  }
}
