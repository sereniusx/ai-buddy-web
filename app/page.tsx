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

  const [rel, setRel] = useState<RelResp | null>(null);
  const [relErr, setRelErr] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    if (!token || !user) router.replace("/login");
  }, [token, user, router]);

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
        setMsgs((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: "（网络或服务异常，稍后再试。）" } : m)));
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

      // 可选：你现在 finalize 是手动触发的。这里不强行自动触发，保持你现有流程。
      // 如果你希望“每轮对话结束自动更新温度计”，可以在这里调用 /api/finalize，然后再刷新 /api/relationship。
    } catch (e: any) {
      setErr(`网络错误：${String(e?.message || e)}`);
      setMsgs((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: "（网络错误，稍后再试。）" } : m)));
    } finally {
      setBusy(false);
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

  return (
      <div className="container">
        <div className="card">
          <div className="topbar">
            <div className="brand" style={{ gap: 10 }}>
              <div className="avatar" title="陪伴体头像">
                {companionAvatar ? <img src={companionAvatar} alt="companion" /> : <div className="fallback">{fallbackLetter(companionName)}</div>}
              </div>

              <div className="title">
                <strong>{companionName}</strong>
                <span>{stageCopy}</span>
              </div>
            </div>

            <div className="actions">
              <a className="pill thermo" href="/settings" title="去设置：主题 / 头像 / 温度计">
                <strong>{temp ? `${temp.toFixed(1)}℃` : `${bond.toFixed(1)}`}</strong>
                <small style={{ marginLeft: 6 }}>{temp ? "关系温度" : "亲密度"}</small>
              </a>

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
