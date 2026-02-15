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

export default function HomePage() {
  const router = useRouter();
  const user = useMemo(() => getSavedUser(), []);
  const token = useMemo(() => getToken(), []);

  const [msgs, setMsgs] = useState<Msg[]>(() => [
    {
      id: uid(),
      role: "system",
      content: "欢迎回来。想先聊聊你今天的状态吗？",
      created_at: now(),
    },
  ]);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    if (!token || !user) router.replace("/login");
  }, [token, user, router]);

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
    setMsgs([
      {
        id: uid(),
        role: "system",
        content: "会话已清空（仅清空本地显示）。你想从哪里继续？",
        created_at: now(),
      },
    ]);
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
        // 回填到 assistant 气泡
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

        // 逐段按 \n\n 分割
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;

          const data = line.slice(5).trim();
          if (!data) continue;
          if (data === "[DONE]") break;

          setMsgs((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + data } : m))
          );
        }
      }
    } catch (e: any) {
      setErr(`网络错误：${String(e?.message || e)}`);
      setMsgs((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: "（网络错误，稍后再试。）" } : m))
      );
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

  return (
      <div className="container">
        <div className="card">
          <div className="topbar">
            <div className="brand">
              <div className="logo" />
              <div className="title">
                <strong>{user ? `AI Buddy · ${user.username}` : "AI Buddy"}</strong>
                <span>长期陪伴 · 单线程对话</span>
              </div>
            </div>

            <div className="actions">
              <button className="btn danger" onClick={clearChat} title="清空本地消息显示">
                清空会话
              </button>
              <button className="btn" onClick={doLogout}>
                退出
              </button>
            </div>
          </div>

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
              <button className={canSend ? "send" : "sendDisabled"} onClick={send} disabled={!canSend}>
                {busy ? "发送…" : "发送"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
          提示：上滑查看历史时会自动停止滚动；回到底部会恢复自动滚动。
        </div>
      </div>
  );
}
