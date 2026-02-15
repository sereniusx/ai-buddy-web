"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { setSavedUser, setToken } from "../../lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

export default function RegisterPage() {
    const router = useRouter();
    const [invite, setInvite] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const canSubmit = useMemo(() => {
        const code = invite.trim();
        const u = username.trim();
        return code.length > 0 && u.length > 0 && password.length >= 6 && !busy;
    }, [invite, username, password, busy]);

    async function onRegister() {
        setErr(null);
        const code = invite.trim();
        const u = username.trim();

        if (!code) return setErr("请输入邀请码。");
        if (!u || !password) return setErr("请输入用户名和密码。");
        if (password.length < 6) return setErr("密码至少 6 位。");

        setBusy(true);
        try {
            const res = await apiFetch("/api/auth/register", {
                method: "POST",
                body: JSON.stringify({ invite_code: code, username: u, password }),
            });

            const data = await res.json().catch(() => null);

            if (!res.ok) {
                const msg =
                    data?.error === "username_taken"
                        ? "用户名已被占用。"
                        : data?.error
                            ? `注册失败：${data.error}`
                            : `注册失败：${res.status}`;
                setErr(msg);
                return;
            }

            setToken(data.token);
            setSavedUser(data.user);
            router.replace("/");
        } catch (e: any) {
            setErr(`网络错误：${String(e?.message || e)}`);
        } finally {
            setBusy(false);
        }
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && canSubmit) onRegister();
    }

    const styles = {
        page: {
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 16,
            background:
                "radial-gradient(1200px 600px at 20% 10%, rgba(99,102,241,0.20), transparent 60%)," +
                "radial-gradient(900px 500px at 80% 0%, rgba(236,72,153,0.18), transparent 55%)," +
                "radial-gradient(900px 600px at 50% 100%, rgba(16,185,129,0.14), transparent 55%)," +
                "linear-gradient(180deg, #0b1020, #070a12)",
        } as React.CSSProperties,
        card: {
            width: "100%",
            maxWidth: 420,
            borderRadius: 20,
            padding: 18,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.06)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
            backdropFilter: "blur(10px)",
            color: "rgba(255,255,255,0.92)",
        } as React.CSSProperties,
        brand: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
        } as React.CSSProperties,
        dot: {
            width: 10,
            height: 10,
            borderRadius: 999,
            background: "linear-gradient(135deg,#a78bfa,#60a5fa,#34d399)",
            boxShadow: "0 0 0 6px rgba(255,255,255,0.06)",
        } as React.CSSProperties,
        h1: { fontSize: 18, fontWeight: 750, letterSpacing: 0.2 } as React.CSSProperties,
        sub: { fontSize: 13, color: "rgba(255,255,255,0.70)", marginTop: 4 } as React.CSSProperties,
        form: { display: "grid", gap: 10, marginTop: 14 } as React.CSSProperties,
        label: { fontSize: 12, color: "rgba(255,255,255,0.70)" } as React.CSSProperties,
        input: {
            width: "100%",
            padding: "12px 12px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(10,12,20,0.55)",
            color: "rgba(255,255,255,0.92)",
            outline: "none",
        } as React.CSSProperties,
        hint: { fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: -4 } as React.CSSProperties,
        error: {
            borderRadius: 14,
            padding: "10px 12px",
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: "rgba(255,255,255,0.92)",
            fontSize: 13,
            lineHeight: 1.4,
        } as React.CSSProperties,
        btn: (disabled: boolean) =>
            ({
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                background: disabled
                    ? "rgba(255,255,255,0.08)"
                    : "linear-gradient(135deg,#6366f1,#ec4899)",
                color: "white",
                fontWeight: 700,
                cursor: disabled ? "not-allowed" : "pointer",
                boxShadow: disabled ? "none" : "0 16px 40px rgba(99,102,241,0.25)",
            }) as React.CSSProperties,
        foot: {
            marginTop: 12,
            fontSize: 13,
            color: "rgba(255,255,255,0.70)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
        } as React.CSSProperties,
        link: { color: "white", fontWeight: 700, textDecoration: "none" } as React.CSSProperties,
    };

    return (
        <div style={styles.page}>
            <div style={styles.card}>
                <div style={styles.brand}>
                    <div style={styles.dot} />
                    <div>
                        <div style={styles.h1}>注册</div>
                        <div style={styles.sub}>测试期需要邀请码（你可用万能邀请码）</div>
                    </div>
                </div>

                <div style={styles.form}>
                    <div>
                        <div style={styles.label}>邀请码</div>
                        <input
                            value={invite}
                            onChange={(e) => setInvite(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="请输入邀请码"
                            style={styles.input}
                            autoComplete="off"
                        />
                    </div>

                    <div>
                        <div style={styles.label}>用户名</div>
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="3-24 位，字母数字 _ -"
                            style={styles.input}
                            autoComplete="username"
                        />
                        <div style={styles.hint}>建议用英文或拼音，方便登录。</div>
                    </div>

                    <div>
                        <div style={styles.label}>密码</div>
                        <input
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="至少 6 位"
                            type="password"
                            style={styles.input}
                            autoComplete="new-password"
                        />
                    </div>

                    {err ? <div style={styles.error}>{err}</div> : null}

                    <button onClick={onRegister} disabled={!canSubmit} style={styles.btn(!canSubmit)}>
                        {busy ? "注册中…" : "创建账号"}
                    </button>

                    <div style={styles.foot}>
                        <span>已有账号？</span>
                        <Link href="/login" style={styles.link}>
                            去登录 →
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
