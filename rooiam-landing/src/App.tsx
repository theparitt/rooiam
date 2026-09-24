import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import DocsRedirectPage from './pages/DocsRedirectPage'
import NewsPage from './pages/NewsPage'

export default function App()
{
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/news" element={<NewsPage />} />
                <Route path="/docs" element={<DocsRedirectPage />} />
                <Route path="/docs/:section" element={<DocsRedirectPage />} />
            </Routes>
        </BrowserRouter>
    )
}
