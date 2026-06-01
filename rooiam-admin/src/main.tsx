import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './lib/toast'
import DebugBadge from './components/ui/DebugBadge'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <ToastProvider>
                <App />
                <DebugBadge />
            </ToastProvider>
        </BrowserRouter>
    </React.StrictMode>,
)
