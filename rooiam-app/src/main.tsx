import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './lib/toast'
import ServerBuildBadge from './components/ui/ServerBuildBadge'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <ToastProvider>
                <App />
                <ServerBuildBadge />
            </ToastProvider>
        </BrowserRouter>
    </React.StrictMode>,
)
