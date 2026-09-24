import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import DemoShowcase from '../components/DemoShowcase'
import Stats from '../components/Stats'
import Features from '../components/Features'
import HowItWorks from '../components/HowItWorks'
import OpenSource from '../components/OpenSource'
import Roadmap from '../components/Roadmap'
import Pricing from '../components/Pricing'
import Footer from '../components/Footer'

export default function LandingPage()
{
    return (
        <div className="min-h-screen" style={{ background: '#FFFBFD' }}>
            <Navbar />
            <Hero />
            <DemoShowcase />
            <Stats />
            <Features />
            <HowItWorks />
            <OpenSource />
            <Roadmap />
            <Pricing />
            <Footer />
        </div>
    )
}
