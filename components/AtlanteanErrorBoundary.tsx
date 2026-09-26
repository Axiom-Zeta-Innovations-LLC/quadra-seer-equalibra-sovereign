import React from 'react';

interface AtlanteanErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface AtlanteanErrorBoundaryState {
  hasError: boolean;
}

class AtlanteanErrorBoundary extends React.Component<
  AtlanteanErrorBoundaryProps,
  AtlanteanErrorBoundaryState
> {
  constructor(props: AtlanteanErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AtlanteanErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Atlantean UI boundary caught an error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-amber-300">
            {this.props.fallbackTitle || 'Atlantean Interface Error'}
          </div>
          <div className="mt-1 text-[10px] text-amber-100/80">
            Intelligence module failed to render. Refresh the view to recover.
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AtlanteanErrorBoundary;