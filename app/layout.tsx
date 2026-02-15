// app/layout.tsx
import "./globals.css";

export const metadata = {
    title: "AI Buddy",
    description: "Long-term companion chat",
};

export const viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
};

function ThemeBoot() {
    return (
        <script
            dangerouslySetInnerHTML={{
                __html: `
(function(){
  try {
    var saved = localStorage.getItem("ai_buddy_theme") || "system";
    var preferDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = saved === "system" ? (preferDark ? "night" : "day") : (saved === "night" ? "night" : "day");
    document.documentElement.setAttribute("data-theme", theme);
  } catch(e) {}
})();`,
            }}
        />
    );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="zh-CN" data-theme="day">
        <head>
            <ThemeBoot />
        </head>
        <body>{children}</body>
        </html>
    );
}
