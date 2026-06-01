import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import DocsRedirectPage from './pages/DocsRedirectPage'

export default function App()
{
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/docs" element={<DocsRedirectPage />} />
                <Route path="/docs/:section" element={<DocsRedirectPage />} />
            </Routes>
        </BrowserRouter>
    )
}
