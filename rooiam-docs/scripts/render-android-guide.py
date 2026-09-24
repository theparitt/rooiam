"""Render source-faithful, non-scannable SVG illustrations for the Android guide."""

from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "android-guide"
OUT.mkdir(parents=True, exist_ok=True)


def rect(x, y, w, h, fill, radius=0, stroke="none", sw=1):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def text(x, y, value, size=18, weight=500, color="#293042", anchor="start"):
    return (
        f'<text x="{x}" y="{y}" fill="{color}" font-size="{size}" '
        f'font-weight="{weight}" text-anchor="{anchor}" '
        f'font-family="Arial, Helvetica, sans-serif">{escape(value)}</text>'
    )


def button(y, label, fill="#eee9ff", color="#5734ae", x=69, w=382):
    return rect(x, y, w, 50, fill, 14) + text(x + 18, y + 32, label, 17, 700, color)


def phone(body, label):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="520" height="780" viewBox="0 0 520 780" role="img" '
        f'aria-label="{escape(label)}">'
        + rect(0, 0, 520, 780, "#f7f3ff")
        + rect(38, 14, 444, 740, "#20243a", 37)
        + rect(49, 25, 422, 718, "#ffffff", 28)
        + rect(203, 34, 114, 15, "#20243a", 8)
        + text(70, 87, "Rooiam Reference", 21, 800, "#2d2343")
        + rect(69, 105, 382, 1, "#e8e3f3")
        + body
        + rect(131, 762, 258, 1, "#c8bfdc")
        + text(260, 773, "Illustration • example values", 11, 600, "#82779c", "middle")
        + "</svg>"
    )


def browser(body, label):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600" role="img" '
        f'aria-label="{escape(label)}">'
        + rect(0, 0, 900, 600, "#f7f3ff")
        + rect(25, 25, 850, 532, "#ffffff", 22, "#ddd2fb", 2)
        + rect(25, 25, 850, 53, "#f1edfa", 22)
        + rect(25, 58, 850, 20, "#f1edfa")
        + '<circle cx="54" cy="51" r="7" fill="#e8acc4"/><circle cx="76" cy="51" r="7" fill="#eed18e"/><circle cx="98" cy="51" r="7" fill="#a9d9c3"/>'
        + rect(140, 38, 600, 27, "#ffffff", 10)
        + text(158, 57, "auth.example.com", 13, 600, "#737084")
        + body
        + text(450, 582, "Illustration • the QR is intentionally not scannable", 13, 600, "#82779c", "middle")
        + "</svg>"
    )


home = (
    text(69, 137, "Scan. Match. Approve.", 26, 800, "#2d2343")
    + text(69, 174, "Enroll your phone with the server you trust.", 15, 500, "#666178")
    + text(69, 198, "Only approve sign-ins you started.", 15, 500, "#666178")
    + rect(69, 224, 382, 57, "#faf9ff", 11, "#d8d0eb")
    + text(84, 260, "https://auth.example.com", 16, 500)
    + rect(69, 297, 382, 57, "#faf9ff", 11, "#d8d0eb")
    + text(84, 333, "Google Cloud project number", 15, 500, "#777189")
    + button(373, "1. SIGN IN TO ROOIAM")
    + button(438, "2. ENROLL THIS PHONE")
    + button(503, "3. SCAN A SIGN-IN QR")
    + button(568, "PASTE QR TEXT", "#faf9ff", "#5734ae")
    + button(633, "REVOKE THIS PHONE", "#faf9ff", "#5734ae")
)

login = (
    button(133, "RETURN TO PHONE ENROLLMENT")
    + button(199, "PASTE YOUR EMAIL SIGN-IN LINK")
    + rect(69, 283, 382, 400, "#faf9ff", 15, "#e1dbef")
    + text(99, 330, "Sign in to Rooiam", 25, 800, "#2d2343")
    + text(99, 363, "Hosted login in the app's WebView", 15, 500, "#666178")
    + rect(99, 392, 322, 54, "#ffffff", 11, "#d8d0eb")
    + text(115, 425, "Email address", 16, 500, "#777189")
    + rect(99, 462, 322, 50, "#6546c0", 11)
    + text(260, 494, "Send magic link", 16, 700, "#ffffff", "middle")
    + text(99, 561, "Open the email link here, not in Chrome.", 14, 600, "#6e6388")
)

enrolled = (
    rect(69, 137, 382, 123, "#f1fff7", 15, "#a5ddbe")
    + text(91, 178, "Phone enrolled.", 22, 800, "#175b3c")
    + text(91, 208, "Attestation: pending", 17, 700, "#175b3c")
    + text(91, 235, "Approval remains subject to server policy.", 13, 500, "#48765e")
    + text(69, 308, "Next", 17, 800, "#2d2343")
    + text(69, 339, "Open phone sign-in on your browser.", 15, 500, "#666178")
    + button(370, "3. SCAN A SIGN-IN QR")
)

qr_grid = (
    rect(344, 223, 212, 212, "#ffffff", 5, "#c7bce7", 2)
    + rect(363, 242, 44, 44, "#2b2444", 3)
    + rect(493, 242, 44, 44, "#2b2444", 3)
    + rect(363, 372, 44, 44, "#2b2444", 3)
    + rect(425, 307, 25, 25, "#7866ae", 3)
    + rect(462, 344, 20, 20, "#7866ae", 3)
    + text(450, 334, "DEMO", 19, 800, "#8c7bb2", "middle")
)
browser_qr = (
    text(450, 135, "Sign in with your phone", 30, 800, "#2d2343", "middle")
    + text(450, 176, "Scan with your enrolled Rooiam app", 17, 500, "#666178", "middle")
    + qr_grid
    + rect(283, 455, 334, 73, "#f6f2ff", 14)
    + text(310, 483, "Request code", 14, 700, "#6e6388")
    + text(310, 513, "123 456", 23, 800, "#32265d")
    + text(497, 483, "Number", 14, 700, "#6e6388")
    + text(497, 513, "42", 23, 800, "#32265d")
)

scanner = (
    button(133, "CANCEL SCAN", "#faf9ff")
    + rect(69, 207, 382, 419, "#312c44", 17)
    + rect(109, 260, 302, 302, "#403b55", 13)
    + '<path d="M127 318v-41h41 M352 277h41v41 M127 505v41h41 M352 546h41v-41" fill="none" stroke="#c8b8ff" stroke-width="8" stroke-linecap="round"/>'
    + text(260, 421, "Aim at the browser QR", 20, 700, "#ffffff", "middle")
    + text(260, 665, "Scan the QR in the browser you started.", 15, 600, "#666178", "middle")
)

review = (
    rect(65, 132, 390, 540, "#ffffff", 19, "#d8d0eb", 2)
    + text(90, 177, "Approve this browser?", 25, 800, "#2d2343")
    + text(90, 220, "Server", 14, 700, "#777189")
    + text(90, 245, "https://auth.example.com", 17, 600)
    + text(90, 286, "Application", 14, 700, "#777189")
    + text(90, 310, "Your example app", 17, 600)
    + text(90, 351, "Workspace", 14, 700, "#777189")
    + text(90, 375, "Your workspace", 17, 600)
    + rect(90, 402, 340, 82, "#f6f2ff", 12)
    + text(111, 429, "Request code", 13, 700, "#6e6388")
    + text(111, 460, "123 456", 23, 800, "#32265d")
    + text(302, 429, "Number", 13, 700, "#6e6388")
    + text(302, 460, "42", 23, 800, "#32265d")
    + text(90, 517, "Compare both with your browser.", 15, 600, "#666178")
    + button(540, "CODES MATCH — APPROVE", "#6546c0", "#ffffff", 90, 340)
    + text(156, 633, "Deny", 16, 700, "#8d2d54", "middle")
    + text(358, 633, "Close", 16, 700, "#666178", "middle")
)

finish = (
    rect(69, 146, 382, 148, "#f1fff7", 15, "#a5ddbe")
    + text(91, 194, "Approved.", 26, 800, "#175b3c")
    + text(91, 225, "Return to your browser to finish", 17, 600, "#286348")
    + text(91, 253, "sign-in and any required MFA.", 17, 600, "#286348")
    + rect(69, 330, 382, 153, "#f6f2ff", 15)
    + text(91, 368, "Browser", 16, 800, "#6e6388")
    + text(91, 404, "Complete Rooiam sign-in", 20, 800, "#2d2343")
    + text(91, 437, "Then enter your workspace or app.", 15, 600, "#666178")
    + text(69, 542, "Phone approval alone is not a browser session.", 15, 600, "#666178")
)

assets = {
    "01-home.svg": phone(home, "Illustrated reference app home screen"),
    "02-login.svg": phone(login, "Illustrated embedded Rooiam login"),
    "03-enrolled.svg": phone(enrolled, "Illustrated phone enrollment result"),
    "04-browser-qr.svg": browser(browser_qr, "Illustrated browser phone login QR and codes"),
    "05-scanner.svg": phone(scanner, "Illustrated in-app camera scanner"),
    "06-review.svg": phone(review, "Illustrated phone approval dialog"),
    "07-finish.svg": phone(finish, "Illustrated approval and browser finish"),
}

for name, svg in assets.items():
    (OUT / name).write_text(svg, encoding="utf-8")
    print(OUT / name)
