import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
    children: ReactNode
}

interface State {
    error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null }

    static getDerivedStateFromError(error: Error): State {
        return { error }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack)
    }

    render() {
        if (this.state.error) {
            return (
                <div className="min-h-screen flex items-center justify-center p-6 bg-white">
                    <div className="w-full max-w-md rounded-3xl border border-rose-100 bg-white p-8 shadow-xl text-center">
                        <p className="text-5xl mb-4">⚠️</p>
                        <h1 className="text-xl font-black text-gray-800 mb-2">Something went wrong</h1>
                        <p className="text-sm text-gray-500 mb-5">An unexpected error occurred. Reload the page to try again.</p>
                        <p className="text-xs font-mono text-rose-500 bg-rose-50 rounded-2xl px-4 py-3 text-left break-all">
                            {this.state.error.message}
                        </p>
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="mt-6 px-5 py-2.5 rounded-2xl bg-rose-500 text-white text-sm font-black hover:bg-rose-600 transition-colors"
                        >
                            Reload page
                        </button>
                    </div>
                </div>
            )
        }
        return this.props.children
    }
}
