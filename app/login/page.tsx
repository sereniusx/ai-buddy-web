"use client";

import { useState } from "react";
import { apiFetch } from "../../lib/api";
import { setSavedUser, setToken } from "../../lib/auth";
import { useRouter } from "next/navigation";
import type { LoginResp } from "../../lib/types";

function isApiErr(x: any): x is { ok: false; error: string; detail?: string } {
    return !!x && typeof x === "object" && x.ok === false && typeof x.error === "string";
}

function isLoginOk(x: any): x is Extract<LoginResp, { ok: true }> {
    return !!x && typeof x === "object" && x.ok === true && x.token && x.user;
}

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function onLogin() {
        setErr(null);
        const u = username.trim();
        if (!u || !password) return setErr("请输入用户名和密码。");

        setBusy(true);
        try {
            const res = await apiFetch("/api/auth/login", {
                method: "POST",
                body: JSON.stringify({ username: u, password }),
            });

            const data = (await res.json().catch(() => null)) as LoginResp | null;

            if (!res.ok) {
                if (isApiErr(data)) {
                    setErr(`登录失败：${data.error}`);
                } else {
                    setErr(`登录失败：${res.status}`);
                }
                return;
            }

            if (!isLoginOk(data)) {
                setErr("登录失败：返回数据格式不正确");
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
        <div className="container">
            <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
                <div className="topbar">
                    <div className="brand">
                        <div className="logo" />
                        <div className="title">
                            <strong>登录 AI Buddy</strong>
                            <span>进入你的长期陪伴对话</span>
                        </div>
                    </div>
                </div>

                <div style={{ padding: 16, display: "grid", gap: 12 }}>
                    <input
                        className="input"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="用户名（3-24，字母数字_-）"
                    />
                    <input
                        className="input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="密码（≥6）"
                        type="password"
                    />

                    {err ? <div style={{ color: "#fca5a5", fontSize: 13 }}>{err}</div> : null}

                    <button className="btn" onClick={onLogin} disabled={busy} style={{ padding: "12px 14px", borderRadius: 16 }}>
                        {busy ? "登录中…" : "登录"}
                    </button>

                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                        没有账号？去{" "}
                        <a href="/register" style={{ fontWeight: 800 }}>
                            注册
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
