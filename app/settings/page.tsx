// app/settings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getSavedUser } from "../../lib/auth";
import { useRouter } from "next/navigation";

const THEMES = [
    { id: "system", name: "跟随系统" },
    { id: "day", name: "日间（太阳/天空）" },
    { id: "night", name: "夜间（月光/夜空）" },
];

const BUBBLES = [
    { id: "default", name: "默认" },
    { id: "round", name: "更圆" },
    { id: "flat", name: "更扁平" },
];

const TONES = [
    { id: "warm", name: "温柔" },
    { id: "playful", name: "俏皮" },
    { id: "quiet", name: "安静陪伴" },
    { id: "pragmatic", name: "务实" },
];

function applyTheme(themeId: string) {
    try {
        localStorage.setItem("ai_buddy_theme", themeId);
    } catch {}
    const preferDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = themeId === "system" ? (preferDark ? "night" : "day") : themeId === "night" ? "night" : "day";
    document.documentElement.setAttribute("data-theme", theme);
}

function bubbleRadius(bubble: string) {
    if (bubble === "round") return 20;
    if (bubble === "flat") return 12;
    return 18;
}

export default function SettingsPage() {
    const router = useRouter();

    useEffect(() => {
        const u = getSavedUser();
        if (!u) router.replace("/login");
    }, [router]);

    const [displayName, setDisplayName] = useState("");
    const [userAvatarUrl, setUserAvatarUrl] = useState("");
    const [themeId, setThemeId] = useState("system");
    const [bubble, setBubble] = useState("default");

    const [companionName, setCompanionName] = useState("小伴");
    const [companionAvatarUrl, setCompanionAvatarUrl] = useState("");
    const [toneStyle, setToneStyle] = useState("warm");

    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        // 初始读 localStorage（前端即时生效）
        try {
            const saved = localStorage.getItem("ai_buddy_theme");
            if (saved && (saved === "system" || saved === "day" || saved === "night")) {
                setThemeId(saved);
                applyTheme(saved);
            } else {
                applyTheme("system");
            }
        } catch {}
    }, []);

    const previewBubbleRadius = useMemo(() => bubbleRadius(bubble), [bubble]);

    async function saveUser() {
        setMsg(null);
        setBusy(true);
        try {
            const res = await apiFetch("/api/settings/user", {
                method: "POST",
                body: JSON.stringify({
                    display_name: displayName.trim() || null,
                    avatar_url: userAvatarUrl.trim() || null,
                    theme_id: themeId, // system/day/night
                    bubble_style: bubble,
                }),
            });

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setMsg(data?.error ? `保存失败：${data.error}` : `保存失败：${res.status}`);
                if (res.status === 401) router.replace("/login");
                return;
            }

            applyTheme(themeId);
            setMsg("✅ 已保存用户设置");
        } finally {
            setBusy(false);
        }
    }

    async function saveCompanion() {
        setMsg(null);
        setBusy(true);
        try {
            const res = await apiFetch("/api/settings/companion", {
                method: "POST",
                body: JSON.stringify({
                    companion_name: companionName.trim() || null,
                    companion_avatar_url: companionAvatarUrl.trim() || null,
                    tone_style: toneStyle,
                }),
            });

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setMsg(data?.error ? `保存失败：${data.error}` : `保存失败：${res.status}`);
                if (res.status === 401) router.replace("/login");
                return;
            }
            setMsg("✅ 已保存陪伴体设置");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="container">
            <div className="card">
                <div className="topbar">
                    <div className="brand">
                        <div className="title">
                            <strong>设置</strong>
                            <span>外观 · 头像 · 陪伴体</span>
                        </div>
                    </div>

                    <div className="actions">
                        <a className="btn" href="/">
                            返回聊天
                        </a>
                    </div>
                </div>

                <div style={{ padding: 14 }}>
                    {msg ? <div className={msg.startsWith("✅") ? "noticeOk" : "noticeErr"}>{msg}</div> : null}

                    <div className="grid2" style={{ marginTop: 12 }}>
                        <div className="panel">
                            <div style={{ fontWeight: 900 }}>用户</div>
                            <div className="subtle" style={{ marginTop: 6 }}>
                                头像第一阶段先用 URL（后续可接 R2 上传）
                            </div>

                            <div className="hr" />

                            <label className="subtle">
                                昵称（display_name）
                                <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="比如：serenius" />
                            </label>

                            <div style={{ height: 10 }} />

                            <label className="subtle">
                                头像 URL（avatar_url）
                                <input className="input" value={userAvatarUrl} onChange={(e) => setUserAvatarUrl(e.target.value)} placeholder="https://..." />
                            </label>

                            <div style={{ height: 10 }} />

                            <label className="subtle">
                                主题（theme_id）
                                <select
                                    className="select"
                                    value={themeId}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setThemeId(v);
                                        applyTheme(v);
                                    }}
                                >
                                    {THEMES.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <div style={{ height: 10 }} />

                            <label className="subtle">
                                气泡样式（bubble_style）
                                <select className="select" value={bubble} onChange={(e) => setBubble(e.target.value)}>
                                    {BUBBLES.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <div style={{ height: 12 }} />

                            <button className="btn primary" onClick={saveUser} disabled={busy}>
                                {busy ? "保存中…" : "保存用户设置"}
                            </button>
                        </div>

                        <div className="panel">
                            <div style={{ fontWeight: 900 }}>陪伴体</div>
                            <div className="subtle" style={{ marginTop: 6 }}>
                                建议：头像尽量用干净背景，圆角会更好看
                            </div>

                            <div className="hr" />

                            <label className="subtle">
                                名称（companion_name）
                                <input className="input" value={companionName} onChange={(e) => setCompanionName(e.target.value)} placeholder="比如：小伴" />
                            </label>

                            <div style={{ height: 10 }} />

                            <label className="subtle">
                                头像 URL（companion_avatar_url）
                                <input
                                    className="input"
                                    value={companionAvatarUrl}
                                    onChange={(e) => setCompanionAvatarUrl(e.target.value)}
                                    placeholder="https://..."
                                />
                            </label>

                            <div style={{ height: 10 }} />

                            <label className="subtle">
                                语气（tone_style）
                                <select className="select" value={toneStyle} onChange={(e) => setToneStyle(e.target.value)}>
                                    {TONES.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <div style={{ height: 12 }} />

                            <button className="btn primary" onClick={saveCompanion} disabled={busy}>
                                {busy ? "保存中…" : "保存陪伴体设置"}
                            </button>
                        </div>
                    </div>

                    <div className="panel" style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>预览</div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <div className="avatar" title="用户头像预览" style={{ width: 42, height: 42, borderRadius: 16 }}>
                                {userAvatarUrl ? <img src={userAvatarUrl} alt="me" /> : <div className="fallback">你</div>}
                            </div>

                            <div style={{ fontWeight: 800 }}>{displayName.trim() || "你"}</div>

                            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                                <div className="avatar" title="陪伴体头像预览" style={{ width: 42, height: 42, borderRadius: 16 }}>
                                    {companionAvatarUrl ? <img src={companionAvatarUrl} alt="companion" /> : <div className="fallback">TA</div>}
                                </div>
                                <div style={{ fontWeight: 800 }}>{companionName.trim() || "小伴"}</div>
                            </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <div
                                className="bubble assistant"
                                style={{ borderRadius: previewBubbleRadius }}
                            >
                                {companionName.trim() || "小伴"}：嗯…我在。你想先从哪里开始说？
                            </div>
                            <div
                                className="bubble user"
                                style={{ borderRadius: previewBubbleRadius, marginLeft: "auto" }}
                            >
                                {displayName.trim() || "你"}：我只是想找个人聊聊。
                            </div>
                            <div
                                className="bubble assistant"
                                style={{ borderRadius: previewBubbleRadius }}
                            >
                                {companionName.trim() || "小伴"}：好，那就慢慢来。今天让你最累的是什么？
                            </div>
                        </div>

                        <div style={{ marginTop: 10 }} className="subtle">
                            主题说明：白天强调色=太阳/天空；夜晚强调色=月光/夜空。
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
