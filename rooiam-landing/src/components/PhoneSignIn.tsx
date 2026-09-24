import { ScanLine, Smartphone, Check } from 'lucide-react'

const steps = [
    { icon: ScanLine, title: 'Scan', text: 'Scan the QR code on your browser with your enrolled phone.' },
    { icon: Smartphone, title: 'Check', text: 'Review the sign-in request and compare the number shown.' },
    { icon: Check, title: 'Approve', text: 'Approve on your phone, then return to your browser to continue.' },
]

export default function PhoneSignIn() {
    return (
        <section id="phone-sign-in" className="scroll-mt-24 px-6 md:px-12 lg:px-20 py-16"
            style={{ background: 'linear-gradient(135deg, #F8F0FF 0%, #FFF8FC 100%)' }}>
            <div className="max-w-5xl mx-auto">
                <span className="inline-block rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-bold text-purple-700">Android preview</span>
                <h2 className="mt-5 text-3xl md:text-5xl font-black text-gray-800 leading-tight max-w-3xl">
                    Let your users sign in<br className="hidden sm:block" /> with their phone.
                </h2>
                <p className="mt-5 text-base md:text-lg font-semibold text-gray-600 max-w-2xl leading-relaxed">
                    Add phone approval to your app’s sign-in. Your users scan a QR code,
                    check the request, and approve from their Android phone.
                </p>

                <ol className="my-8 grid gap-4 md:grid-cols-3">
                    {steps.map(({ icon: Icon, title, text }, index) => (
                        <li key={title} className="rounded-2xl border border-purple-100 bg-white p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <Icon className="h-5 w-5 text-purple-600" aria-hidden="true" />
                                <h3 className="font-black text-gray-800">{index + 1}. {title}</h3>
                            </div>
                            <p className="text-sm leading-relaxed text-gray-600">{text}</p>
                        </li>
                    ))}
                </ol>

                <div className="grid gap-6 md:grid-cols-2">
                    <div>
                        <h3 className="text-lg font-black text-gray-800">Make it part of your Android app.</h3>
                        <p className="mt-2 text-sm leading-relaxed text-gray-600">
                            Use the SDK for device enrollment and approval. Start with the example app,
                            then make the sign-in, camera and approval screens your own.
                        </p>
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-800">Give each workspace the choice.</h3>
                        <p className="mt-2 text-sm leading-relaxed text-gray-600">
                            Offer phone sign-in alongside passkeys, magic links and social login.
                            Each workspace chooses whether to enable it and where it appears.
                        </p>
                    </div>
                </div>
                <div className="mt-7 flex flex-wrap gap-3">
                    <a href="https://docs.rooiam.com/reference/android-sdk-integration" target="_blank" rel="noreferrer"
                        className="rounded-xl bg-purple-700 px-5 py-3 text-sm font-bold text-white hover:bg-purple-800 transition-colors">
                        Android integration guide →
                    </a>
                    <a href="https://docs.rooiam.com/getting-started/android-phone-sign-in-walkthrough" target="_blank" rel="noreferrer"
                        className="rounded-xl border border-purple-200 bg-white px-5 py-3 text-sm font-bold text-purple-700 hover:bg-purple-50 transition-colors">
                        Follow the app walkthrough →
                    </a>
                </div>
            </div>
        </section>
    )
}
