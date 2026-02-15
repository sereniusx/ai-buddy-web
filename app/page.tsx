"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { getSavedUser, logout } from "../lib/auth";
import { useRouter } from "next/navigation";

type Msg = { role: "user" | "assistant"; content: string };

export default function Home() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getSavedUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    setUserRole(u.role);
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);

    const res = await apiFetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: text }),
    });

    if (!res.ok || !res.body) {
      setStreaming(false);
      const errText = await res.text().catch(() => "");
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: `请求失败：${res.status}\n${errText}` };
        return copy;
      });

      // token 失效会被 apiFetch 里清掉；这里直接跳转
      if (res.status === 401) router.replace("/login");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      const parts = chunk.split("\n\n");
      for (const part of parts) {
        const line = part.trim();
        if (!line) continue;
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();

        if (data === "[DONE]") {
          setStreaming(false);
          return;
        }

        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            copy[copy.length - 1] = { role: "assistant", content: last.content + data };
          }
          return copy;
        });
      }
    }

    setStreaming(false);
  }

  function onLogout() {
    logout();
    router.replace("/login");
  }

  if (userRole === null) return null;

  return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>AI 小伙伴</h1>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {userRole === "admin" ? (
                <a href="/admin" style={{ fontSize: 13, color: "#111", fontWeight: 600 }}>
                  管理
                </a>
            ) : null}
            <button
                onClick={onLogout}
                style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", fontSize: 13 }}
            >
              退出
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 12, minHeight: 420 }}>
          {messages.length === 0 ? (
              <div style={{ color: "#666" }}>开始聊天吧～</div>
          ) : (
              messages.map((m, i) => (
                  <div key={i} style={{ margin: "10px 0" }}>
                    <div style={{ fontSize: 12, color: "#888" }}>{m.role === "user" ? "你" : "TA"}</div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{m.content}</div>
                  </div>
              ))
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息…"
              style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
          />
          <button
              onClick={send}
              disabled={streaming}
              style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd" }}
          >
            {streaming ? "发送中…" : "发送"}
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#888" }}>
          提示：测试期需邀请码注册；管理员可在“管理”里生成邀请码。
        </div>
      </div>
  );
}
