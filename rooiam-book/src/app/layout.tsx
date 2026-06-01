import "./globals.css";
import SidebarClient from "./SidebarClient";
import { CHAPTERS } from "./chapters";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Rooiam — Design &amp; Implementation of an Identity Platform</title>
        <meta name="description" content="A textbook on building a real IAM server in Rust" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&family=Fira+Code:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css"
        />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js" async />
      </head>
      <body>
        <div className="app-shell">
          <SidebarClient chapters={CHAPTERS} />
          <main className="main-content">
            <div className="content-body prose">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
