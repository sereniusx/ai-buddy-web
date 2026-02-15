"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);

    const res = await fetch("https://ai-buddy-api.serenius.workers.dev/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });


    if (!res.ok || !res.body) {
      setStreaming(false);
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: `请求失败：${res.status}` };
        return copy;
      });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      // 我们用 SSE: data: ...\n\n 的形式
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

        // 追加到最后一条 assistant 消息
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

  return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>AI 小伙伴（MVP）</h1>

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
          提示：这是 MVP。后端会用 D1 存记忆和亲密度。
        </div>
      </div>
  );
}
