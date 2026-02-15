// app/layout.tsx
export const metadata = {
    title: "AI Buddy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="zh">
        <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
        {children}
        </body>
        </html>
    );
}
