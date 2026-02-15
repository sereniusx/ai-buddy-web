// app/register/page.tsx
"use client";

import { useState } from "react";
import { apiFetch } from "../../lib/api";
import { setSavedUser, setToken } from "../../lib/auth";
import { useRouter } from "next/navigation";
import type { RegisterResp } from "../../lib/types";

function isApiErr(x: any): x is { ok: false; error: string; detail?: string } {
    return !!x && typeof x === "object" && x.ok === false && typeof x.error === "string";
}
function isRegisterOk(x: any): x is Extract<RegisterResp, { ok: true }> {
    return !!x && typeof x === "object" && x.ok === true && x.token && x.user;
}

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

            const data = (await res.json().catch(() => null)) as RegisterResp | null;

            if (!res.ok) {
                if (isApiErr(data)) setErr(`注册失败：${data.error}`);
                else setErr(`注册失败：${res.status}`);
                return;
            }

            if (!isRegisterOk(data)) {
                setErr("注册失败：返回数据格式不正确");
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
                        <div className="title">
                            <strong>注册 AI Buddy</strong>
                            <span>测试期需要邀请码</span>
                        </div>
                    </div>
                </div>

                <div style={{ padding: 14, display: "grid", gap: 12 }}>
                    <input className="input" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="邀请码" />
                    <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名（3-24，字母数字_-）" />
                    <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码（≥6）" type="password" />

                    {err ? <div className="noticeErr">{err}</div> : null}

                    <button className="btn primary" onClick={onRegister} disabled={busy} style={{ padding: "12px 14px" }}>
                        {busy ? "注册中…" : "注册"}
                    </button>

                    <div className="subtle" style={{ fontSize: 13 }}>
                        已有账号？去{" "}
                        <a href="/login" style={{ fontWeight: 900 }}>
                            登录
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
