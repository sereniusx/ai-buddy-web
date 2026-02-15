// app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { getSavedUser, getToken, logout } from "../lib/auth";
import type { Msg } from "../lib/types";
import { useRouter } from "next/navigation";

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function now() {
  return Date.now();
}
function isNearBottom(el: HTMLElement, threshold = 120) {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - (scrollTop + clientHeight) < threshold;
}

type RelResp = {
  ok: true;
  relationship: { bond: number; temp?: number; stage: number; copy?: string };
  companion: { name: string; avatar_url: string | null };
  user: { display_name: string; avatar_url: string | null };
};

function fallbackLetter(s?: string) {
  const t = (s || "").trim();
  if (!t) return "AI";
  return t.slice(0, 2).toUpperCase();
}

function getCurrentTheme(): "day" | "night" {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "night" ? "night" : "day";
}

function setTheme(theme: "day" | "night") {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    // 主页快速切换：直接锁定 day/night
    localStorage.setItem("ai_buddy_theme", theme);
  } catch {}
}

export default function HomePage() {
  const router = useRouter();
  const user = useMemo(() => getSavedUser(), []);
  const token = useMemo(() => getToken(), []);

  const [msgs, setMsgs] = useState<Msg[]>(() => [
    { id: uid(), role: "system", content: "欢迎回来。想先聊聊你今天的状态吗？", created_at: now() },
  ]);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ✅ 新增：Finalize 按钮状态
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeMsg, setFinalizeMsg] = useState<string | null>(null);

  const [rel, setRel] = useState<RelResp | null>(null);
  const [relErr, setRelErr] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  const [theme, setThemeState] = useState<"day" | "night">("day");

  useEffect(() => {
    if (!token || !user) router.replace("/login");
  }, [token, user, router]);

  // 初始化主题状态（从 html[data-theme] 读取）
  useEffect(() => {
    try {
      setThemeState(getCurrentTheme());
    } catch {}
  }, []);

  function toggleTheme() {
    const next = theme === "night" ? "day" : "night";
    setTheme(next);
    setThemeState(next);
  }

  // 拉关系状态（温度计）
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setRelErr(null);
        const res = await apiFetch("/api/relationship?days=7");
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) {
          setRelErr(data?.error ? `关系状态加载失败：${data.error}` : `关系状态加载失败：${res.status}`);
          if (res.status === 401) router.replace("/login");
          return;
        }
        setRel(data as RelResp);
      } catch (e: any) {
        setRelErr(`关系状态网络错误：${String(e?.message || e)}`);
      }
    })();
  }, [token, router]);

  // 监听滚动：用户上滑就停止自动滚动
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const onScroll = () => {
      autoScrollRef.current = isNearBottom(el, 140);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // 消息变化：如果允许自动滚动，则滚到底
  useEffect(() => {
    if (!autoScrollRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  function clearChat() {
    setMsgs([{ id: uid(), role: "system", content: "会话已清空（仅清空本地显示）。你想从哪里继续？", created_at: now() }]);
    setErr(null);
    setFinalizeMsg(null);
    setText("");
  }

  function doLogout() {
    logout();
    router.replace("/login");
  }

  const canSend = !busy && text.trim().length > 0;

  async function send() {
    if (!canSend) return;
    setErr(null);

    const content = text.trim();
    setText("");
    setBusy(true);

    const userMsg: Msg = { id: uid(), role: "user", content, created_at: now() };
    const assistantId = uid();
    const assistantMsg: Msg = { id: assistantId, role: "assistant", content: "", created_at: now() };

    setMsgs((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: content }),
      });

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        const msg = j?.error ? `请求失败：${j.error}` : `请求失败：${res.status}`;
        setErr(msg);
        setMsgs((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: "（网络或服务异常，稍后再试。）" } : m))
        );
        return;
      }

      // SSE: data: xxx\n\n
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;

          const data = line.slice(5).trim();
          if (!data) continue;
          if (data === "[DONE]") break;

          setMsgs((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + data } : m)));
        }
      }
    } catch (e: any) {
      setErr(`网络错误：${String(e?.message || e)}`);
      setMsgs((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: "（网络错误，稍后再试。）" } : m)));
    } finally {
      setBusy(false);
    }
  }

  // ✅ 新增：手动触发 finalize，生成候选记忆碎片
  async function runFinalize() {
    if (finalizeBusy) return;
    setFinalizeMsg(null);
    setFinalizeBusy(true);

    try {
      const res = await apiFetch("/api/finalize", { method: "POST" });
      const j = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        setFinalizeMsg(j?.error ? `Finalize 失败：${j.error}` : `Finalize 失败：${res.status}`);
        if (res.status === 401) router.replace("/login");
        return;
      }

      const up = Number(j?.profile_updates ?? 0);
      const ev = Number(j?.events_upserted ?? 0);
      const bondNext = j?.relationship?.bond;

      const tip =
          `✅ 已整理：候选记忆 ${ev} 条，资料更新 ${up} 条` +
          (typeof bondNext === "number" ? `；亲密度 ${bondNext.toFixed(1)}` : "");
      setFinalizeMsg(tip);

      // 可选：顺便刷新温度计
      try {
        const r2 = await apiFetch("/api/relationship?days=7");
        if (r2.ok) {
          const d2 = (await r2.json().catch(() => null)) as any;
          setRel(d2 as RelResp);
        }
      } catch {}
    } catch (e: any) {
      setFinalizeMsg(`Finalize 网络错误：${String(e?.message || e)}`);
    } finally {
      setFinalizeBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const companionName = rel?.companion?.name || "小伴";
  const companionAvatar = rel?.companion?.avatar_url || null;
  const stageCopy = rel?.relationship?.copy || "慢慢来，我们先熟悉彼此。";
  const bond = typeof rel?.relationship?.bond === "number" ? rel.relationship.bond : 0;
  const temp = typeof rel?.relationship?.temp === "number" ? rel.relationship.temp : undefined;

  const isAdmin = (user as any)?.role === "admin";

  return (
      <div className="container">
        <div className="card">
          <div className="topbar">
            <div className="brand" style={{ gap: 10 }}>
              <div className="avatar" title="陪伴体头像">
                {companionAvatar ? (
                    <img src={companionAvatar} alt="companion" />
                ) : (
                    <div className="fallback">{fallbackLetter(companionName)}</div>
                )}
              </div>

              <div className="title">
                <strong>{companionName}</strong>
                <span>{stageCopy}</span>
              </div>
            </div>

            <div className="actions">
              {/* 温度计（去设置） */}
              <a className="pill thermo" href="/settings" title="去设置：主题 / 头像 / 温度计">
                <strong>{temp ? `${temp.toFixed(1)}℃` : `${bond.toFixed(1)}`}</strong>
                <small style={{ marginLeft: 6 }}>{temp ? "关系温度" : "亲密度"}</small>
              </a>

              {/* 主题切换 */}
              <button className="btn" onClick={toggleTheme} title="切换日间/夜间模式">
                {theme === "night" ? "☀️ 日间" : "🌙 夜间"}
              </button>

              {/* 快速入口 */}
              <a className="btn" href="/settings" title="打开设置">
                设置
              </a>

              {/* ✅ 记忆画廊入口 */}
              <a className="btn" href="/memories" title="打开记忆画廊">
                🖼️ 记忆
              </a>

              {/* ✅ 新增：Finalize */}
              <button
                  className="btn"
                  onClick={runFinalize}
                  disabled={finalizeBusy}
                  title="整理本轮对话：生成候选记忆碎片"
              >
                {finalizeBusy ? "整理…" : "Finalize"}
              </button>

              {isAdmin ? (
                  <a className="btn" href="/admin" title="管理员入口">
                    管理
                  </a>
              ) : null}

              <button className="btn" onClick={clearChat} title="清空本地消息显示">
                清空
              </button>

              <button className="btn danger" onClick={doLogout}>
                退出
              </button>
            </div>
          </div>

          {relErr ? (
              <div style={{ padding: "10px 14px" }}>
                <div className="noticeErr">⚠️ {relErr}</div>
              </div>
          ) : null}

          {/* ✅ Finalize 提示 */}
          {finalizeMsg ? (
              <div style={{ padding: "10px 14px" }}>
                <div className="noticeErr">✨ {finalizeMsg}</div>
              </div>
          ) : null}

          <div className="chatWrap">
            <div className="chatList" ref={listRef}>
              <div className="dayHint">今天</div>

              {msgs.map((m) => (
                  <div key={m.id} className={`row ${m.role}`}>
                    <div className={`bubble ${m.role}`}>{m.content}</div>
                  </div>
              ))}

              {err ? (
                  <div className="row system">
                    <div className="bubble system">⚠️ {err}</div>
                  </div>
              ) : null}

              <div ref={bottomRef} />
            </div>

            <div className="composer">
              <input
                  className="input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="像发微信一样输入…（Enter 发送）"
                  onKeyDown={onKeyDown}
                  disabled={busy}
              />
              <button className="send" onClick={send} disabled={!canSend}>
                {busy ? "发送…" : "发送"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
          上滑查看历史会暂停自动滚动；回到底部会恢复。
        </div>
      </div>
  );
}
