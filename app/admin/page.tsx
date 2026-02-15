// app/admin/page.tsx
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getSavedUser } from "../../lib/auth";
import { useRouter } from "next/navigation";

type Invite = {
    code: string;
    status: "active" | "used" | "disabled";
    created_at: number;
    used_at?: number | null;
    note?: string | null;
    used_by_user_id?: string | null;
};

function fmtTime(ms?: number | null) {
    if (!ms) return "-";
    const d = new Date(ms);
    return d.toLocaleString();
}

export default function AdminPage() {
    const router = useRouter();
    const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);
    const [invites, setInvites] = useState<Invite[]>([]);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        const u = getSavedUser();
        if (!u) {
            router.replace("/login");
            return;
        }
        setUserRole(u.role);
    }, [router]);

    async function load() {
        setErr(null);
        const res = await apiFetch("/api/admin/invites");
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            setErr(data?.error ? `加载失败：${data.error}` : `加载失败：${res.status}`);
            return;
        }
        setInvites(data.invites || []);
    }

    useEffect(() => {
        if (userRole === "admin") load();
    }, [userRole]);

    async function createInvite() {
        setErr(null);
        setBusy(true);
        try {
            const res = await apiFetch("/api/admin/invites", {
                method: "POST",
                body: JSON.stringify({ note: note.trim() || null }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setErr(data?.error ? `创建失败：${data.error}` : `创建失败：${res.status}`);
                return;
            }
            setNote("");
            await load();
            alert(`邀请码：${data.code}`);
        } finally {
            setBusy(false);
        }
    }

    async function disable(code: string) {
        if (!confirm(`禁用邀请码 ${code} ?`)) return;
        const res = await apiFetch("/api/admin/invites/disable", {
            method: "POST",
            body: JSON.stringify({ code }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            alert(data?.error ? `禁用失败：${data.error}` : `禁用失败：${res.status}`);
            return;
        }
        await load();
    }

    if (userRole === null) return null;

    if (userRole !== "admin") {
        return (
            <div className="container">
                <div className="card">
                    <div className="topbar">
                        <div className="brand">
                            <div className="title">
                                <strong>管理</strong>
                                <span>仅管理员可访问</span>
                            </div>
                        </div>
                        <div className="actions">
                            <a className="btn" href="/">
                                返回聊天
                            </a>
                        </div>
                    </div>

                    <div style={{ padding: 14 }}>
                        <div className="noticeErr">无权限（仅管理员可访问）。</div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container">
            <div className="card">
                <div className="topbar">
                    <div className="brand">
                        <div className="title">
                            <strong>邀请码管理</strong>
                            <span>生成/禁用 · 简洁表格</span>
                        </div>
                    </div>

                    <div className="actions">
                        <a className="btn" href="/">
                            返回聊天
                        </a>
                    </div>
                </div>

                <div style={{ padding: 14 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注（可选：发给谁）" />
                        <button className="btn primary" onClick={createInvite} disabled={busy} style={{ whiteSpace: "nowrap" }}>
                            {busy ? "生成中…" : "生成邀请码"}
                        </button>
                        <button className="btn" onClick={load} style={{ whiteSpace: "nowrap" }}>
                            刷新
                        </button>
                    </div>

                    {err ? <div style={{ marginTop: 10 }} className="noticeErr">{err}</div> : null}

                    <div className="panel" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "160px 90px 220px 220px 1fr 110px",
                                padding: 12,
                                background: "var(--panel2)",
                                fontSize: 12,
                                color: "var(--muted)",
                            }}
                        >
                            <div>code</div>
                            <div>status</div>
                            <div>created</div>
                            <div>used</div>
                            <div>note</div>
                            <div>action</div>
                        </div>

                        {invites.map((it) => (
                            <div
                                key={it.code}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "160px 90px 220px 220px 1fr 110px",
                                    padding: 12,
                                    borderTop: "1px solid var(--border)",
                                    fontSize: 13,
                                }}
                            >
                                <div style={{ fontFamily: "var(--mono)" }}>{it.code}</div>
                                <div>{it.status}</div>
                                <div>{fmtTime(it.created_at)}</div>
                                <div>{fmtTime(it.used_at)}</div>
                                <div style={{ color: "var(--text)" }}>{it.note || "-"}</div>
                                <div>
                                    {it.status === "active" ? (
                                        <button className="btn" onClick={() => disable(it.code)} style={{ padding: "6px 10px" }}>
                                            禁用
                                        </button>
                                    ) : (
                                        <span style={{ color: "var(--muted)" }}>-</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: 12 }} className="subtle">
                        小提示：你可以把邀请码备注写成“给谁/哪一期/测试渠道”，方便回溯。
                    </div>
                </div>
            </div>
        </div>
    );
}
