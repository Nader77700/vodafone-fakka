// ── حاجز الأخطاء لكل صفحة — يعزل العطل ولا يُسقط التطبيق بالكامل ──────────
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props  { children: ReactNode; pageName?: string; }
interface State  { hasError: boolean; errorMsg: string; }

export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMsg: error?.message ?? 'خطأ غير معروف' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PageErrorBoundary]', this.props.pageName ?? 'page', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMsg: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        dir="rtl"
        className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6 text-center"
      >
        <AlertTriangle className="w-10 h-10 text-destructive" />
        <div>
          <p className="font-semibold text-base text-foreground">
            حدث خطأ في هذه الصفحة
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {this.state.errorMsg}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={this.handleRetry} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </Button>
      </div>
    );
  }
}

/** HOC لتغليف أي صفحة بحاجز الأخطاء */
export function withPageErrorBoundary<T extends object>(
  WrappedComponent: React.ComponentType<T>,
  pageName?: string
) {
  return function BoundedPage(props: T) {
    return (
      <PageErrorBoundary pageName={pageName}>
        <WrappedComponent {...props} />
      </PageErrorBoundary>
    );
  };
}
