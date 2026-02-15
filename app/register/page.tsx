"use client";

import { useState } from "react";
import { apiFetch } from "../../lib/api";
import { setSavedUser, setToken } from "../../lib/auth";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
    const router = useRouter();
    const [invite, setInvite] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function onRegister() {
        setErr(null);
        const code = invite.trim();
        const u = username.trim();
        if (!code) return setErr("请输入邀请码。");
        if (!u || !password) return setErr("请输入用户名和密码。");

        setBusy(true);
        try {
            const res = await apiFetch("/api/auth/register", {
                method: "POST",
                body: JSON.stringify({ invite_code: code, username: u, password }),
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                setErr(data?.error ? `注册失败：${data.error}` : `注册失败：${res.status}`);
                return;
            }

            setToken(data.token);
            setSavedUser(data.user);
            router.replace("/");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>注册（测试期需要邀请码）</h1>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <input
                    value={invite}
                    onChange={(e) => setInvite(e.target.value)}
                    placeholder="邀请码"
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="用户名（3-24，字母数字_-）"
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="密码（≥6）"
                    type="password"
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />

                {err ? <div style={{ color: "crimson", fontSize: 13 }}>{err}</div> : null}

                <button
                    onClick={onRegister}
                    disabled={busy}
                    style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd" }}
                >
                    {busy ? "注册中…" : "注册"}
                </button>

                <div style={{ fontSize: 13, color: "#666" }}>
                    已有账号？去{" "}
                    <a href="/login" style={{ color: "#111", fontWeight: 600 }}>
                        登录
                    </a>
                </div>
            </div>
        </div>
    );
}
