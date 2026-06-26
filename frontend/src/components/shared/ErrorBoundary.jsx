// src/components/shared/ErrorBoundary.jsx
import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // In production: send to error tracking (Sentry, etc.)
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-civic-slate flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-elevated p-10 max-w-md w-full text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="font-display text-2xl font-bold text-navy mb-2">Something went wrong</h1>
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              An unexpected error occurred. Please refresh the page or contact support if the issue persists.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <details className="text-left bg-red-50 rounded-xl p-4 mb-6 text-xs text-red-700 overflow-auto max-h-40">
                <summary className="font-bold cursor-pointer mb-2">Error Details (Dev Only)</summary>
                <pre className="whitespace-pre-wrap">{this.state.error.toString()}</pre>
                <pre className="whitespace-pre-wrap mt-2 text-red-500">
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="btn-primary flex-1"
              >
                Refresh Page
              </button>
              <a href="/" className="btn-outline flex-1">Go Home</a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// HOC wrapper for functional components
export function withErrorBoundary(Component, fallback) {
  return function WrappedComponent(props) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
