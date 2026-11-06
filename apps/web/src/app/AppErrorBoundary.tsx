import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { useRouteError } from 'react-router';
import { ErrorFallback } from '../features/diagnostics/ErrorFallback';
import { recordError } from '../shared/utilities/diagnostics';

/** Catches a failure anywhere below it, including the layout, so nobody is left on a blank page. */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown; failed: boolean }
> {
  override state = { error: undefined as unknown, failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    recordError('screen', error);
    console.error('Screen failed', error, info.componentStack);
  }

  override render() {
    return this.state.failed ? (
      <ErrorFallback
        error={this.state.error}
        onRetry={() => this.setState({ error: undefined, failed: false })}
      />
    ) : (
      this.props.children
    );
  }
}

/** The router's error element: a failing screen leaves the navigation in place. */
export function RouteErrorPage() {
  const error = useRouteError();
  useEffect(() => {
    recordError('screen', error);
  }, [error]);
  return <ErrorFallback error={error} />;
}
