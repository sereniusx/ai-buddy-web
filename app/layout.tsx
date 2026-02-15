// app/layout.tsx
import "./globals.css";

export const metadata = {
    title: "AI Buddy",
    description: "Long-term companion chat",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="zh-CN">
        <body>{children}</body>
        </html>
    );
}
