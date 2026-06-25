'use client';

import {Component,type ReactNode} from 'react';
import {Button,Card} from '@/app/components/common/ui';
import {reportClientError,storedClientLogSession} from '@/lib/clientLogging';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<Props,State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  componentDidCatch(error: Error) {
    reportClientError(error, {
      event: 'frontend.react_error_boundary',
      module: 'react',
    }, storedClientLogSession());
  }

  resetSession = () => {
    localStorage.removeItem('medizinhub.session');
    this.setState({error: null});
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4 text-slate-900">
        <Card className="w-full max-w-xl rounded-2xl p-6">
          <h1 className="text-2xl font-bold">MedizinHub HMS</h1>
          <p className="mt-2 text-sm text-slate-500">
            The screen could not continue because the current browser session or backend response is invalid.
          </p>
          <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">
            {this.state.error.message || 'Unexpected frontend error'}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={this.resetSession}>Reset Session</Button>
            <button
              type="button"
              onClick={() => this.setState({error: null})}
              className="rounded-2xl border px-4 py-3 text-sm font-bold"
            >
              Try Again
            </button>
          </div>
        </Card>
      </main>
    );
  }
}
