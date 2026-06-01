/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            fontFamily: { sans: ['"Nunito"', 'system-ui', 'sans-serif'] },
            colors: {
                pastel: {
                    pink: '#FFB5C8', rose: '#FFC5D3', purple: '#D5B7FF', lavender: '#E8D9FF',
                    blue: '#B5D5FF', mint: '#B5EFD5', yellow: '#FFE5B5', peach: '#FFD5B5',
                },
            },
            borderRadius: { '4xl': '2rem', '5xl': '2.5rem' },
            keyframes: {
                fadeInUp: { '0%': { opacity: '0', transform: 'translateY(30px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
                float: { '0%,100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-12px)' } },
                shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
                blob: { '0%,100%': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' }, '33%': { borderRadius: '30% 60% 70% 40% / 50% 60% 30% 60%' }, '66%': { borderRadius: '20% 60% 80% 40% / 70% 30% 50% 60%' } },
            },
            animation: {
                'fade-in-up': 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
                'float': 'float 4s ease-in-out infinite',
                'float-delay': 'float 4s ease-in-out 2s infinite',
                'blob': 'blob 8s ease-in-out infinite',
                'blob-delay': 'blob 8s ease-in-out 4s infinite',
            },
        },
    },
    plugins: [],
}
