export interface Env {
    DB: D1Database;
    DEEPSEEK_API_KEY: string;
    DEEPSEEK_BASE_URL?: string;
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
    });
}

function nowSec() {
    return Math.floor(Date.now() / 1000);
}

function uuid() {
    return crypto.randomUUID();
}

async function getOrCreateSession(env: Env, characterId = "c1") {
    // 简化：永远用同一个 session（你后面可以改为每日一个/手动新建）
    const sid = "s1";
    const existing = await env.DB.prepare("SELECT id FROM sessions WHERE id = ?").bind(sid).first();
    if (!existing) {
        await env.DB.prepare("INSERT INTO sessions (id, character_id, created_at) VALUES (?, ?, ?)")
            .bind(sid, characterId, nowSec())
            .run();
    }
    return sid;
}

async function loadContext(env: Env, sessionId: string) {
    const character = await env.DB.prepare("SELECT * FROM characters WHERE id = ?").bind("c1").first<any>();
    const rel = await env.DB.prepare("SELECT * FROM relationship_state WHERE id = ?").bind("default").first<any>();

    const memories = await env.DB.prepare("SELECT key, value FROM memory_profile ORDER BY updated_at DESC LIMIT 20").all<any>();
    const memoryText =
        memories.results?.length
            ? memories.results.map((m: any) => `- ${m.key}: ${m.value}`).join("\n")
            : "- （暂无）";

    const recent = await env.DB.prepare(
        "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 16"
    )
        .bind(sessionId)
        .all<any>();

    const recentAsc = (recent.results || []).reverse();

    return { character, rel, memoryText, recentAsc };
}

async function saveMessage(env: Env, sessionId: string, role: "user" | "assistant", content: string) {
    await env.DB.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(uuid(), sessionId, role, content, nowSec())
        .run();
}

function stageFromIntimacy(x: number) {
    if (x < 20) return "陌生";
    if (x < 50) return "熟悉";
    if (x < 80) return "默契";
    return "羁绊";
}

async function deepseekStream(env: Env, payload: any) {
    const base = env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    const res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
    return res;
}

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const url = new URL(req.url);

        // CORS（如果你前后端分域名需要；同域可不用）
        if (req.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
            });
        }

        if (url.pathname === "/api/ping") {
            return json({ ok: true, ts: Date.now() });
        }

        if (url.pathname === "/api/chat" && req.method === "POST") {
            const body = (await req.json().catch(() => null)) as { message?: string } | null;
            const message = body?.message?.trim();
            if (!message) return json({ error: "message required" }, 400);

            const sessionId = await getOrCreateSession(env, "c1");

            // 保存 user 消息
            await saveMessage(env, sessionId, "user", message);

            // 取上下文
            const { character, rel, memoryText, recentAsc } = await loadContext(env, sessionId);

            const system1 = `你是我的AI陪伴伙伴：${character?.name || "小伙伴"}。
人设与风格：${character?.persona || "像朋友一样温柔陪伴"}。
边界与规则：${character?.boundaries || "不提供违法/危险建议，尊重隐私"}。
输出要求：用自然中文，适当俏皮，别说教；必要时追问；回答不要太长，保持像聊天。`;

            const system2 = `用户画像记忆（长期）：
${memoryText}`;

            const system3 = `关系状态：
- 亲密度：${rel?.intimacy ?? 5}/100
- 阶段：${rel?.stage ?? "陌生"}
- 上次互动时间：${rel?.last_interaction ?? nowSec()}`;

            const messages = [
                { role: "system", content: system1 },
                { role: "system", content: system2 },
                { role: "system", content: system3 },
                ...recentAsc.map((m: any) => ({ role: m.role, content: m.content })),
                { role: "user", content: message },
            ];

            const payload = {
                model: "deepseek-chat",
                stream: true,
                messages,
                temperature: 0.7,
            };

            const dsRes = await deepseekStream(env, payload);
            if (!dsRes.ok || !dsRes.body) {
                const text = await dsRes.text().catch(() => "");
                return json({ error: "deepseek error", detail: text }, 500);
            }

            // SSE：把 DeepSeek 的流转发给前端
            let assistantAll = "";

            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            const encoder = new TextEncoder();
            const reader = dsRes.body.getReader();
            const decoder = new TextDecoder();

            (async () => {
                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });

                        // DeepSeek 的 stream 是类似 OpenAI 的 SSE 格式：data: {...}\n\n
                        const events = chunk.split("\n\n");
                        for (const evt of events) {
                            const line = evt.trim();
                            if (!line.startsWith("data:")) continue;
                            const data = line.slice(5).trim();
                            if (data === "[DONE]") continue;

                            try {
                                const j = JSON.parse(data);
                                const delta = j?.choices?.[0]?.delta?.content ?? "";
                                if (delta) {
                                    assistantAll += delta;
                                    await writer.write(encoder.encode(`data: ${delta}\n\n`));
                                }
                            } catch {
                                // ignore parse errors
                            }
                        }
                    }

                    // 保存 assistant 完整回答
                    if (assistantAll.trim()) {
                        await saveMessage(env, sessionId, "assistant", assistantAll.trim());
                    }

                    // 对话后更新关系（先做一个很简单的规则：每次+1，上限100）
                    const cur = rel?.intimacy ?? 5;
                    const next = Math.min(100, cur + 1);
                    const stage = stageFromIntimacy(next);
                    await env.DB.prepare(
                        "UPDATE relationship_state SET intimacy = ?, stage = ?, last_interaction = ? WHERE id = ?"
                    )
                        .bind(next, stage, nowSec(), "default")
                        .run();

                    await writer.write(encoder.encode(`data: [DONE]\n\n`));
                } catch (e) {
                    await writer.write(encoder.encode(`data: （流式中断）\n\n`));
                    await writer.write(encoder.encode(`data: [DONE]\n\n`));
                } finally {
                    await writer.close();
                }
            })();

            return new Response(readable, {
                headers: {
                    "Content-Type": "text/event-stream; charset=utf-8",
                    "Cache-Control": "no-cache, no-transform",
                    Connection: "keep-alive",
                    "Access-Control-Allow-Origin": "*",
                },
            });
        }

        return json({ error: "not found" }, 404);
    },
};
