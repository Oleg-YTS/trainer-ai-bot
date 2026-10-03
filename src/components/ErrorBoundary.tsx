import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught Error Boundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
    try {
      (window as any).Telegram?.WebApp?.ready();
    } catch {}
  }

  private handleReload = () => {
    try {
      localStorage.clear();
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[#0A100D] text-[#E8EDEA] font-sans">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>

          <h2 className="text-xl font-bold mb-2 text-center text-white">
            Ошибка загрузки приложения
          </h2>

          <p className="text-sm text-[#8E9E96] text-center max-w-xs mb-6 leading-relaxed">
            Произошёл сбой при инициализации компонентов. Вы можете перезапустить приложение.
          </p>

          {this.state.error && (
            <div className="w-full max-w-xs p-3 mb-6 rounded-xl bg-[#121B17] border border-[#1C2621] text-left text-xs font-mono text-red-300 overflow-x-auto max-h-32">
              {this.state.error.toString()}
            </div>
          )}

          <button
            onClick={this.handleReload}
            className="w-full max-w-xs py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/30 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Перезапустить
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
