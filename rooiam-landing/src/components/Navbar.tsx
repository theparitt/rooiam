import { useState } from 'react'
import { Menu, X, Github } from 'lucide-react'
import { DOCS_HOME_URL, DOCS_GETTING_STARTED_URL, GITHUB_REPO_URL } from '../lib/site'

export default function Navbar()
{
    const [open, setOpen] = useState(false)

    return (
        <nav className="sticky top-0 z-50 px-6 md:px-12 lg:px-20 py-4 flex items-center justify-between"
            style={{ background: 'rgba(255,251,253,0.88)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #FFE8F0' }}>

            <a href="/" className="flex items-center">
                <img src="/wordmark.svg" alt="Rooiam" className="h-9 w-auto" style={{ maxWidth: '155px' }} />
            </a>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8 text-sm font-bold text-gray-500">
                <a href="#features" className="hover:text-gray-800 transition-colors">Features</a>
                <a href="#how-it-works" className="hover:text-gray-800 transition-colors">Self-Host</a>
                <a href={DOCS_HOME_URL} className="hover:text-gray-800 transition-colors">Docs</a>
                <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 hover:text-gray-800 transition-colors">
                    <Github className="w-4 h-4" /> GitHub
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                        style={{ background: '#FFE8F0', color: '#c96b8a' }}>
                        soon
                    </span>
                </a>
            </div>

            {/* CTA */}
            <div className="hidden md:flex items-center">
                <a href={DOCS_GETTING_STARTED_URL}
                    className="px-5 py-2.5 rounded-full text-sm font-black shadow-md hover:scale-105 transition-all"
                    style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)', color: '#5a2d3f' }}>
                    Get Started →
                </a>
            </div>

            {/* Mobile toggle */}
            <button className="md:hidden p-2 rounded-xl hover:bg-pink-50 transition-colors" onClick={() => setOpen(!open)}>
                {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Mobile Nav */}
            {open && (
                <div className="absolute top-full left-0 right-0 bg-white border-b border-pink-100 p-6 flex flex-col gap-4 shadow-lg z-50">
                    <a href="#features" className="font-bold text-gray-700" onClick={() => setOpen(false)}>Features</a>
                    <a href="#how-it-works" className="font-bold text-gray-700" onClick={() => setOpen(false)}>Self-Host Guide</a>
                    <a href={DOCS_HOME_URL} className="font-bold text-gray-700" onClick={() => setOpen(false)}>Docs</a>
                    <a href={DOCS_GETTING_STARTED_URL} className="text-center py-3 rounded-2xl font-black text-sm shadow-md"
                        style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)', color: '#5a2d3f' }}>
                        Get Started →
                    </a>
                </div>
            )}
        </nav>
    )
}
