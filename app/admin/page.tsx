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
            <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
                <h1 style={{ fontSize: 20, fontWeight: 700 }}>管理</h1>
                <div style={{ marginTop: 12, color: "crimson" }}>无权限（仅管理员可访问）。</div>
                <div style={{ marginTop: 12 }}>
                    <a href="/" style={{ color: "#111", fontWeight: 600 }}>返回聊天</a>
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>邀请码管理</h1>

            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="备注（可选：发给谁）"
                    style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <button
                    onClick={createInvite}
                    disabled={busy}
                    style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd" }}
                >
                    {busy ? "生成中…" : "生成邀请码"}
                </button>
                <button
                    onClick={load}
                    style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd" }}
                >
                    刷新
                </button>
            </div>

            {err ? <div style={{ marginTop: 10, color: "crimson", fontSize: 13 }}>{err}</div> : null}

            <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "160px 90px 220px 220px 1fr 110px", padding: 10, background: "#fafafa", fontSize: 12, color: "#666" }}>
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
                        style={{ display: "grid", gridTemplateColumns: "160px 90px 220px 220px 1fr 110px", padding: 10, borderTop: "1px solid #eee", fontSize: 13 }}
                    >
                        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{it.code}</div>
                        <div>{it.status}</div>
                        <div>{fmtTime(it.created_at)}</div>
                        <div>{fmtTime(it.used_at)}</div>
                        <div style={{ color: "#444" }}>{it.note || "-"}</div>
                        <div>
                            {it.status === "active" ? (
                                <button
                                    onClick={() => disable(it.code)}
                                    style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                                >
                                    禁用
                                </button>
                            ) : (
                                <span style={{ color: "#888" }}>-</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: 14 }}>
                <a href="/" style={{ color: "#111", fontWeight: 600 }}>返回聊天</a>
            </div>
        </div>
    );
}
