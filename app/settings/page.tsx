"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getSavedUser } from "../../lib/auth";
import { useRouter } from "next/navigation";

const THEMES = [
    { id: "default", name: "默认" },
    { id: "dark", name: "深色" },
    { id: "milk", name: "奶油" },
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

function themeStyle(themeId: string): React.CSSProperties {
    if (themeId === "dark") {
        return { background: "#0b0b0f", color: "#f2f2f3" };
    }
    if (themeId === "milk") {
        return { background: "#fff8f0", color: "#191919" };
    }
    return { background: "#ffffff", color: "#111111" };
}

function bubbleStyle(bubble: string, mine: boolean): React.CSSProperties {
    const base: React.CSSProperties = {
        padding: "10px 12px",
        maxWidth: "78%",
        whiteSpace: "pre-wrap",
        lineHeight: 1.55,
        border: "1px solid rgba(0,0,0,0.08)",
    };

    const radius =
        bubble === "round" ? 18 : bubble === "flat" ? 10 : 14;

    return {
        ...base,
        borderRadius: radius,
        alignSelf: mine ? "flex-end" : "flex-start",
        background: mine ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.02)",
    };
}

export default function SettingsPage() {
    const router = useRouter();

    // login guard
    useEffect(() => {
        const u = getSavedUser();
        if (!u) router.replace("/login");
    }, [router]);

    // User settings draft
    const [displayName, setDisplayName] = useState("");
    const [userAvatarUrl, setUserAvatarUrl] = useState("");
    const [themeId, setThemeId] = useState("default");
    const [bubble, setBubble] = useState("default");

    // Companion settings draft
    const [companionName, setCompanionName] = useState("小伴");
    const [companionAvatarUrl, setCompanionAvatarUrl] = useState("");
    const [toneStyle, setToneStyle] = useState("warm");

    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const previewStyle = useMemo(() => themeStyle(themeId), [themeId]);

    async function saveUser() {
        setMsg(null);
        setBusy(true);
        try {
            const res = await apiFetch("/api/settings/user", {
                method: "POST",
                body: JSON.stringify({
                    display_name: displayName.trim() || null,
                    avatar_url: userAvatarUrl.trim() || null,
                    theme_id: themeId,
                    bubble_style: bubble,
                }),
            });

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setMsg(data?.error ? `保存失败：${data.error}` : `保存失败：${res.status}`);
                if (res.status === 401) router.replace("/login");
                return;
            }
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
        <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>设置</h1>
                <a href="/" style={{ color: "#111", fontWeight: 700, fontSize: 13 }}>
                    返回聊天
                </a>
            </div>

            {msg ? <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith("✅") ? "green" : "crimson" }}>{msg}</div> : null}

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* User settings */}
                <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                    <div style={{ fontWeight: 700 }}>用户</div>

                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                        <label style={{ fontSize: 12, color: "#666" }}>
                            昵称（display_name）
                            <input
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="比如：serenius"
                                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", marginTop: 6 }}
                            />
                        </label>

                        <label style={{ fontSize: 12, color: "#666" }}>
                            头像 URL（avatar_url）— 第一阶段先填 URL，后续接上传
                            <input
                                value={userAvatarUrl}
                                onChange={(e) => setUserAvatarUrl(e.target.value)}
                                placeholder="https://..."
                                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", marginTop: 6 }}
                            />
                        </label>

                        <label style={{ fontSize: 12, color: "#666" }}>
                            主题（theme_id）
                            <select
                                value={themeId}
                                onChange={(e) => setThemeId(e.target.value)}
                                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", marginTop: 6 }}
                            >
                                {THEMES.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label style={{ fontSize: 12, color: "#666" }}>
                            气泡样式（bubble_style）
                            <select
                                value={bubble}
                                onChange={(e) => setBubble(e.target.value)}
                                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", marginTop: 6 }}
                            >
                                {BUBBLES.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <button
                            onClick={saveUser}
                            disabled={busy}
                            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd" }}
                        >
                            {busy ? "保存中…" : "保存用户设置"}
                        </button>
                    </div>
                </div>

                {/* Companion settings */}
                <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                    <div style={{ fontWeight: 700 }}>陪伴体</div>

                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                        <label style={{ fontSize: 12, color: "#666" }}>
                            名称（companion_name）
                            <input
                                value={companionName}
                                onChange={(e) => setCompanionName(e.target.value)}
                                placeholder="比如：小伴"
                                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", marginTop: 6 }}
                            />
                        </label>

                        <label style={{ fontSize: 12, color: "#666" }}>
                            头像 URL（companion_avatar_url）— 第一阶段先填 URL，后续接上传
                            <input
                                value={companionAvatarUrl}
                                onChange={(e) => setCompanionAvatarUrl(e.target.value)}
                                placeholder="https://..."
                                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", marginTop: 6 }}
                            />
                        </label>

                        <label style={{ fontSize: 12, color: "#666" }}>
                            语气（tone_style）
                            <select
                                value={toneStyle}
                                onChange={(e) => setToneStyle(e.target.value)}
                                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", marginTop: 6 }}
                            >
                                {TONES.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <button
                            onClick={saveCompanion}
                            disabled={busy}
                            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd" }}
                        >
                            {busy ? "保存中…" : "保存陪伴体设置"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Preview */}
            <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 12, ...previewStyle }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>预览</div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div
                        style={{
                            width: 42,
                            height: 42,
                            borderRadius: 12,
                            overflow: "hidden",
                            border: "1px solid rgba(0,0,0,0.1)",
                            background: "rgba(0,0,0,0.06)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                        }}
                        title="用户头像预览"
                    >
                        {userAvatarUrl ? <img src={userAvatarUrl} alt="me" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "你"}
                    </div>

                    <div style={{ fontWeight: 700 }}>{displayName.trim() || "你"}</div>

                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                            style={{
                                width: 42,
                                height: 42,
                                borderRadius: 12,
                                overflow: "hidden",
                                border: "1px solid rgba(0,0,0,0.1)",
                                background: "rgba(0,0,0,0.06)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 800,
                            }}
                            title="陪伴体头像预览"
                        >
                            {companionAvatarUrl ? (
                                <img src={companionAvatarUrl} alt="companion" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                                "TA"
                            )}
                        </div>
                        <div style={{ fontWeight: 700 }}>{companionName.trim() || "小伴"}</div>
                    </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={bubbleStyle(bubble, false)}>
                        {companionName.trim() || "小伴"}：嗯…我在。你想先从哪里开始说？
                    </div>
                    <div style={bubbleStyle(bubble, true)}>
                        {displayName.trim() || "你"}：我只是想找个人聊聊。
                    </div>
                    <div style={bubbleStyle(bubble, false)}>
                        {companionName.trim() || "小伴"}：好，那就慢慢来。今天让你最累的是什么？
                    </div>
                </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                备注：你说头像是“用户上传”，这需要配合一个存储（R2/Images）。第一阶段先用 URL 占位，等你决定存储方案我再把“上传接口+前端上传控件”一起补上。
            </div>
        </div>
    );
}
