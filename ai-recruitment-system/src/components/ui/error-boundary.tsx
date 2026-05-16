import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <div className="size-16 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-red-400" style={{ fontSize: 32 }}>error</span>
          </div>
          <h3 className="text-white font-bold text-lg mb-2">Something went wrong</h3>
          <p className="text-sm text-text-muted mb-4 max-w-sm">{this.state.error?.message || 'An unexpected error occurred in this section.'}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="px-4 py-2 bg-surface-hover hover:bg-surface-card border border-border-dark rounded-xl text-sm text-white transition-colors">
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
