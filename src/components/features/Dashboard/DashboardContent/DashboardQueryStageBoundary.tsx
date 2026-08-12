import { Component, Fragment, type ReactNode } from "react";

export type DashboardQueryRecoveryActions = {
  onRetry: () => void;
  onReload: () => void;
};

type Props = {
  children: ReactNode;
  fallback: (actions: DashboardQueryRecoveryActions) => ReactNode;
  onReload?: () => void;
};

type State = {
  hasError: boolean;
  retryRevision: number;
};

const reloadPage = () => window.location.reload();

export class DashboardQueryStageBoundary extends Component<Props, State> {
  state: State = { hasError: false, retryRevision: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  private retry = () => {
    this.setState(({ retryRevision }) => ({
      hasError: false,
      retryRevision: retryRevision + 1,
    }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback({
        onRetry: this.retry,
        onReload: this.props.onReload ?? reloadPage,
      });
    }

    return <Fragment key={this.state.retryRevision}>{this.props.children}</Fragment>;
  }
}
