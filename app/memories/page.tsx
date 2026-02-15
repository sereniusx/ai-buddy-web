"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { useRouter } from "next/navigation";

type Kind = "highlight" | "milestone";

type GalleryItem = {
    id: string;
    kind: Kind;
    title: string;
    summary: string;
    happened_at: number | null;
    importance: number;
    pinned?: number;
    created_at: number;
};

type EventItem = {
    id: string;
    title: string | null;
    summary: string;
    happened_at: number | null;
    importance: number;
    created_at: number;
};

function fmtDate(ts?: number | null) {
    if (!ts) return "—";
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function badgeKind(k: Kind) {
    return k === "milestone" ? "里程碑" : "高光";
}

function clampImportance(n: any) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 1;
    return Math.max(1, Math.min(5, Math.floor(x)));
}

export default function MemoriesPage() {
    const router = useRouter();
    const token = useMemo(() => getToken(), []);

    const [tab, setTab] = useState<"gallery" | "candidates">("gallery");

    const [kind, setKind] = useState<"" | Kind>("");
    const [days, setDays] = useState<"" | "7" | "30" | "all">("30");
    const [minImp, setMinImp] = useState<1 | 2 | 3 | 4 | 5>(3);

    const [gallery, setGallery] = useState<GalleryItem[]>([]);
    const [events, setEvents] = useState<EventItem[]>([]);

    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!token) router.replace("/login");
    }, [token, router]);

    async function loadGallery() {
        setErr(null);
        setBusy(true);
        try {
            const qs = new URLSearchParams();
            qs.set("limit", "80");
            qs.set("pinned_first", "1");
            if (kind) qs.set("kind", kind);

            const res = await apiFetch(`/api/memory/gallery?${qs.toString()}`);
            const j = (await res.json().catch(() => null)) as any;
            if (!res.ok) {
                setErr(j?.error ? `加载失败：${j.error}` : `加载失败：${res.status}`);
                if (res.status === 401) router.replace("/login");
                return;
            }

            let items: GalleryItem[] = (j?.items || j?.memories || []) as any;
            // 前端按 days/minImp 过滤（后端也可以做，但这里先不依赖）
            items = items.filter((x) => (kind ? x.kind === kind : true));
            items = items.filter((x) => clampImportance(x.importance) >= minImp);

            if (days !== "all" && days !== "") {
                const now = Date.now();
                const windowMs = Number(days) * 24 * 60 * 60 * 1000;
                items = items.filter((x) => {
                    const t = x.happened_at ?? x.created_at;
                    return now - t <= windowMs;
                });
            }

            setGallery(items);
        } catch (e: any) {
            setErr(`网络错误：${String(e?.message || e)}`);
        } finally {
            setBusy(false);
        }
    }

    async function loadEvents() {
        setErr(null);
        setBusy(true);
        try {
            const qs = new URLSearchParams();
            qs.set("limit", "80");
            if (days !== "all" && days !== "") qs.set("days", days);
            qs.set("min_importance", String(minImp));

            const res = await apiFetch(`/api/memory/events?${qs.toString()}`);
            const j = (await res.json().catch(() => null)) as any;
            if (!res.ok) {
                setErr(j?.error ? `加载失败：${j.error}` : `加载失败：${res.status}`);
                if (res.status === 401) router.replace("/login");
                return;
            }

            let items: EventItem[] = (j?.items || j?.events || []) as any;
            // memory_events 没 kind，tab=candidates 时允许你选择要 promote 的 kind
            items = items.filter((x) => clampImportance(x.importance) >= minImp);
            setEvents(items);
        } catch (e: any) {
            setErr(`网络错误：${String(e?.message || e)}`);
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        if (!token) return;
        if (tab === "gallery") loadGallery();
        else loadEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, tab]);

    // 筛选变化时重刷
    useEffect(() => {
        if (!token) return;
        if (tab === "gallery") loadGallery();
        else loadEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kind, days, minImp]);

    async function pinGallery(id: string, pinned: 0 | 1) {
        setErr(null);
        setBusy(true);
        try {
            const res = await apiFetch("/api/memory/gallery/pin", {
                method: "POST",
                body: JSON.stringify({ id, pinned }),
            });
            const j = (await res.json().catch(() => null)) as any;
            if (!res.ok) {
                setErr(j?.error ? `操作失败：${j.error}` : `操作失败：${res.status}`);
                if (res.status === 401) router.replace("/login");
                return;
            }
            await loadGallery();
        } catch (e: any) {
            setErr(`网络错误：${String(e?.message || e)}`);
        } finally {
            setBusy(false);
        }
    }

    async function deleteGallery(id: string) {
        if (!confirm("确定删除这条记忆吗？")) return;
        setErr(null);
        setBusy(true);
        try {
            const res = await apiFetch("/api/memory/gallery/delete", {
                method: "POST",
                body: JSON.stringify({ id }),
            });
            const j = (await res.json().catch(() => null)) as any;
            if (!res.ok) {
                setErr(j?.error ? `删除失败：${j.error}` : `删除失败：${res.status}`);
                if (res.status === 401) router.replace("/login");
                return;
            }
            await loadGallery();
        } catch (e: any) {
            setErr(`网络错误：${String(e?.message || e)}`);
        } finally {
            setBusy(false);
        }
    }

    async function promoteEvent(eventId: string, k: Kind) {
        setErr(null);
        setBusy(true);
        try {
            const res = await apiFetch("/api/memory/events/promote", {
                method: "POST",
                body: JSON.stringify({ event_id: eventId, kind: k }),
            });
            const j = (await res.json().catch(() => null)) as any;
            if (!res.ok) {
                setErr(j?.error ? `收藏失败：${j.error}` : `收藏失败：${res.status}`);
                if (res.status === 401) router.replace("/login");
                return;
            }
            // promote 后：刷新两边
            await loadEvents();
            setTab("gallery");
        } catch (e: any) {
            setErr(`网络错误：${String(e?.message || e)}`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="container">
            <div className="card" style={{ padding: 0 }}>
                {/* 顶部栏：返回 + 标题 + tab */}
                <div className="topbar" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="brand" style={{ gap: 10 }}>
                        <button className="btn" onClick={() => router.back()} title="返回">
                            ← 返回
                        </button>
                        <div className="title">
                            <strong>记忆画廊</strong>
                            <span style={{ opacity: 0.9 }}>收藏一些“我们一起经历过的”</span>
                        </div>
                    </div>

                    <div className="actions" style={{ gap: 8 }}>
                        <button
                            className={`btn ${tab === "gallery" ? "" : ""}`}
                            onClick={() => setTab("gallery")}
                            disabled={busy}
                            title="已收藏的共享记忆"
                        >
                            画廊
                        </button>
                        <button
                            className="btn"
                            onClick={() => setTab("candidates")}
                            disabled={busy}
                            title="AI 生成候选池"
                        >
                            候选
                        </button>
                    </div>
                </div>

                {/* 筛选栏 */}
                <div style={{ padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>类型</span>
                        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as any)} disabled={busy}>
                            <option value="">全部</option>
                            <option value="highlight">高光</option>
                            <option value="milestone">里程碑</option>
                        </select>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>时间</span>
                        <select className="input" value={days} onChange={(e) => setDays(e.target.value as any)} disabled={busy}>
                            <option value="7">近 7 天</option>
                            <option value="30">近 30 天</option>
                            <option value="all">全部</option>
                        </select>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>重要度 ≥</span>
                        <select
                            className="input"
                            value={minImp}
                            onChange={(e) => setMinImp(Number(e.target.value) as any)}
                            disabled={busy}
                        >
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                            <option value={4}>4</option>
                            <option value={5}>5</option>
                        </select>
                    </div>

                    <button
                        className="btn"
                        onClick={() => (tab === "gallery" ? loadGallery() : loadEvents())}
                        disabled={busy}
                        title="刷新"
                    >
                        {busy ? "刷新…" : "刷新"}
                    </button>
                </div>

                {err ? (
                    <div style={{ padding: "0 12px 12px 12px" }}>
                        <div className="noticeErr">⚠️ {err}</div>
                    </div>
                ) : null}

                {/* 列表 */}
                <div style={{ padding: 12 }}>
                    {tab === "gallery" ? (
                        <div style={{ display: "grid", gap: 10 }}>
                            {gallery.length === 0 ? (
                                <div style={{ color: "var(--muted)", padding: 12 }}>还没有收藏的记忆。去“候选”看看？</div>
                            ) : null}

                            {gallery.map((m) => (
                                <div
                                    key={m.id}
                                    style={{
                                        border: "1px solid var(--border)",
                                        borderRadius: 12,
                                        padding: 12,
                                        background: "var(--card)",
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                                <strong style={{ fontSize: 15, lineHeight: "20px" }}>{m.title}</strong>
                                                <span className="pill" title="类型" style={{ fontSize: 12 }}>
                          {badgeKind(m.kind)}
                        </span>
                                                <span className="pill" title="重要度" style={{ fontSize: 12 }}>
                          ⭐ {clampImportance(m.importance)}
                        </span>
                                                {m.pinned ? (
                                                    <span className="pill" title="已置顶" style={{ fontSize: 12 }}>
                            📌 置顶
                          </span>
                                                ) : null}
                                            </div>

                                            <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13, lineHeight: "18px" }}>
                                                {m.summary}
                                            </div>

                                            <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 12 }}>
                                                日期：{fmtDate(m.happened_at ?? m.created_at)}
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                                            <button
                                                className="btn"
                                                disabled={busy}
                                                onClick={() => pinGallery(m.id, m.pinned ? 0 : 1)}
                                                title={m.pinned ? "取消置顶" : "置顶"}
                                            >
                                                {m.pinned ? "取消置顶" : "置顶"}
                                            </button>

                                            <button className="btn danger" disabled={busy} onClick={() => deleteGallery(m.id)} title="删除">
                                                删除
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ display: "grid", gap: 10 }}>
                            {events.length === 0 ? (
                                <div style={{ color: "var(--muted)", padding: 12 }}>
                                    还没有候选碎片。去聊天后点一次「Finalize」或让系统自动 finalize。
                                </div>
                            ) : null}

                            {events.map((e) => (
                                <div
                                    key={e.id}
                                    style={{
                                        border: "1px solid var(--border)",
                                        borderRadius: 12,
                                        padding: 12,
                                        background: "var(--card)",
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                                <strong style={{ fontSize: 15, lineHeight: "20px" }}>{e.title || "（未命名记忆）"}</strong>
                                                <span className="pill" title="重要度" style={{ fontSize: 12 }}>
                          ⭐ {clampImportance(e.importance)}
                        </span>
                                            </div>

                                            <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13, lineHeight: "18px" }}>
                                                {e.summary}
                                            </div>

                                            <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 12 }}>
                                                日期：{fmtDate(e.happened_at ?? e.created_at)}
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                                            <button className="btn" disabled={busy} onClick={() => promoteEvent(e.id, "highlight")} title="收藏为高光">
                                                收藏·高光
                                            </button>
                                            <button
                                                className="btn"
                                                disabled={busy}
                                                onClick={() => promoteEvent(e.id, "milestone")}
                                                title="收藏为里程碑（明显共同节点才用）"
                                            >
                                                收藏·里程碑
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ padding: "0 12px 14px 12px", color: "var(--muted)", fontSize: 12 }}>
                    提示：候选是 AI 生成的“记忆碎片”，只有你点“收藏”后，才会进入画廊成为共享记忆。
                </div>
            </div>
        </div>
    );
}
