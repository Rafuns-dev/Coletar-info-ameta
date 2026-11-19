import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let display = error.message || 'Erro inesperado na aplicação.';
    try {
      const parsed = JSON.parse(display) as { error?: string; path?: string };
      if (parsed && typeof parsed.error === 'string') {
        display = parsed.error.toLowerCase().includes('permission')
          ? `Acesso negado ao recurso (${parsed.path || 'Firestore'}). Verifique suas permissões.`
          : parsed.error;
      }
    } catch {
      // mantém mensagem padrão
    }
    return {
      hasError: true,
      message: display,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erro capturado pelo ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Ocorreu um problema ao carregar esta tela
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex h-10 items-center px-4 rounded-lg bg-[#0F2942] hover:bg-[#173A5C] dark:bg-slate-100 dark:hover:bg-white text-xs font-semibold text-white dark:text-[#0F2942] transition-colors"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
