/// <reference types="@cloudflare/workers-types" />

export interface Env {
    DB: D1Database;
    DEEPSEEK_API_KEY: string;
    DEEPSEEK_BASE_URL?: string;

    MASTER_INVITE_CODE?: string;

    // "https://ai-buddy-web.pages.dev,http://localhost:3000"
    ALLOWED_ORIGINS?: string;
}

type Role = "admin" | "user";
type MsgRole = "user" | "assistant" | "system";

/**
 * ✅ CORS: 反射 Origin + 可选白名单
 */
function corsHeaders(req: Request, env?: Env) {
    const origin = req.headers.get("Origin") || "";

    const rawAllow = (env?.ALLOWED_ORIGINS || "").trim();
    if (rawAllow) {
        const allow = new Set(
            rawAllow
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
        );
        const allowedOrigin = allow.has(origin) ? origin : (allow.values().next().value || "");
        return {
            "Access-Control-Allow-Origin": allowedOrigin || "null",
            Vary: "Origin",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Max-Age": "86400",
        };
    }

    return {
        "Access-Control-Allow-Origin": origin || "*",
        Vary: "Origin",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "86400",
    };
}

function json(req: Request, env: Env, data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders(req, env),
            ...extraHeaders,
        },
    });
}

function nowMs() {
    return Date.now();
}

function uuid() {
    return crypto.randomUUID();
}

function badRequest(req: Request, env: Env, msg: string) {
    return json(req, env, { ok: false, error: msg }, 400);
}
function unauthorized(req: Request, env: Env, msg = "unauthorized") {
    return json(req, env, { ok: false, error: msg }, 401);
}
function forbidden(req: Request, env: Env, msg = "forbidden") {
    return json(req, env, { ok: false, error: msg }, 403);
}
function notFound(req: Request, env: Env) {
    return json(req, env, { ok: false, error: "not found" }, 404);
}

// -------------------------
// Crypto helpers
// -------------------------

function base64urlEncode(buf: ArrayBuffer) {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    const b64 = btoa(s);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecode(s: string) {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

async function sha256Hex(input: string) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const arr = Array.from(new Uint8Array(digest));
    return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2HashPassword(password: string, iterations = 100_000) {
    // ✅ Cloudflare Workers WebCrypto: PBKDF2 iterations 不能超过 100000
    const MAX = 100_000;
    const MIN = 50_000;
    const iters = Math.max(MIN, Math.min(MAX, iterations));

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
        "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations: iters },
        keyMaterial,
        256
    );
    return `pbkdf2$${iters}$${base64urlEncode(salt.buffer)}$${base64urlEncode(bits)}`;
}

async function pbkdf2VerifyPassword(password: string, stored: string) {
    const parts = stored.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    const iterations = Number(parts[1]);
    const salt = base64urlDecode(parts[2]);
    const expected = parts[3];

    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
        "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations },
        keyMaterial,
        256
    );
    return base64urlEncode(bits) === expected;
}

function randomToken() {
    const b = crypto.getRandomValues(new Uint8Array(32));
    return base64urlEncode(b.buffer);
}

function parseBearer(req: Request) {
    const h = req.headers.get("Authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : null;
}

// -------------------------
// DeepSeek SSE helpers
// -------------------------

async function deepseekStream(env: Env, payload: any) {
    const base = env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    return fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

async function* parseUpstreamSSE(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, idx).trimEnd();
            buffer = buffer.slice(idx + 1);

            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const data = trimmed.slice(5).trim();
            if (!data) continue;
            if (data === "[DONE]") return;

            yield data;
        }
    }
}

function isLikelyGibberish(s: string) {
    const t = s.trim();
    if (t.length < 2) return true;
    const hasPunc = /[，。？！、]/.test(t);
    if (!hasPunc && t.length < 12) return true;
    if ((t.match(/\.{3,}|。{2,}|…{2,}/g) || []).length >= 2) return true;
    return false;
}

// -------------------------
// DB helpers
// -------------------------

async function getUserByUsername(env: Env, username: string) {
    return env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<any>();
}

async function countUsers(env: Env) {
    const row = await env.DB.prepare("SELECT COUNT(1) as c FROM users").first<any>();
    return Number(row?.c || 0);
}

async function createUser(env: Env, username: string, passwordHash: string, role: Role) {
    const id = uuid();
    const t = nowMs();

    await env.DB.prepare(
        "INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)"
    )
        .bind(id, username, passwordHash, role, t, t)
        .run();

    await env.DB.prepare(
        "INSERT INTO user_settings (user_id, display_name, avatar_url, theme_id, bubble_style, updated_at) VALUES (?, ?, NULL, 'default', 'default', ?)"
    )
        .bind(id, username, t)
        .run();

    await env.DB.prepare(
        "INSERT INTO companion_profile (user_id, companion_name, companion_avatar_url, tone_style, updated_at) VALUES (?, '小伴', NULL, 'warm', ?)"
    )
        .bind(id, t)
        .run();

    await env.DB.prepare(
        "INSERT INTO relationship_state (user_id, bond, trust, warmth, repair, stage, updated_at) VALUES (?, 0, 0, 0, 0, 0, ?)"
    )
        .bind(id, t)
        .run();

    const threadId = uuid();
    await env.DB.prepare("INSERT INTO threads (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .bind(threadId, id, t, t)
        .run();

    return { id, threadId };
}

async function requireAuth(env: Env, req: Request) {
    const token = parseBearer(req);
    if (!token) return { ok: false as const, resp: unauthorized(req, env, "missing bearer token") };

    const tokenHash = await sha256Hex(token);
    const t = nowMs();

    const sess = await env.DB.prepare(
        "SELECT s.user_id, s.expires_at, s.revoked_at, u.username, u.role, u.status " +
        "FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?"
    )
        .bind(tokenHash)
        .first<any>();

    if (!sess) return { ok: false as const, resp: unauthorized(req, env, "invalid session") };
    if (sess.revoked_at) return { ok: false as const, resp: unauthorized(req, env, "session revoked") };
    if (Number(sess.expires_at) < t) return { ok: false as const, resp: unauthorized(req, env, "session expired") };
    if (sess.status !== "active") return { ok: false as const, resp: forbidden(req, env, "user disabled") };

    await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").bind(t, tokenHash).run();

    return {
        ok: true as const,
        user: { id: sess.user_id as string, username: sess.username as string, role: sess.role as Role },
        tokenHash,
    };
}

async function createSession(env: Env, userId: string) {
    const raw = randomToken();
    const tokenHash = await sha256Hex(raw);
    const id = uuid();
    const t = nowMs();
    const expiresAt = t + 1000 * 60 * 60 * 24 * 30;

    await env.DB.prepare(
        "INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL)"
    )
        .bind(id, userId, tokenHash, t, t, expiresAt)
        .run();

    return { token: raw, expiresAt };
}

async function getThreadId(env: Env, userId: string) {
    const row = await env.DB.prepare("SELECT id FROM threads WHERE user_id = ?").bind(userId).first<any>();
    if (row?.id) return String(row.id);

    const tid = uuid();
    const t = nowMs();
    await env.DB.prepare("INSERT INTO threads (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .bind(tid, userId, t, t)
        .run();
    return tid;
}

async function saveMessage(env: Env, userId: string, threadId: string, role: MsgRole, content: string, meta?: any) {
    await env.DB.prepare(
        "INSERT INTO messages (id, user_id, thread_id, role, content, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
        .bind(uuid(), userId, threadId, role, content, meta ? JSON.stringify(meta) : null, nowMs())
        .run();
}

async function loadContext(env: Env, userId: string, threadId: string) {
    const companion = await env.DB.prepare("SELECT * FROM companion_profile WHERE user_id = ?").bind(userId).first<any>();
    const rel = await env.DB.prepare("SELECT * FROM relationship_state WHERE user_id = ?").bind(userId).first<any>();

    const mem = await env.DB.prepare(
        "SELECT key, value FROM memory_profile WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20"
    )
        .bind(userId)
        .all<any>();

    const memoryText =
        mem?.results?.length ? mem.results.map((m: any) => `- ${m.key}: ${m.value}`).join("\n") : "- （暂无）";

    const recent = await env.DB.prepare(
        "SELECT role, content FROM messages WHERE user_id = ? AND thread_id = ? ORDER BY created_at DESC LIMIT 24"
    )
        .bind(userId, threadId)
        .all<any>();

    const recentAsc = (recent.results || []).reverse().filter((m: any) => {
        if (m.role === "assistant" && isLikelyGibberish(m.content)) return false;
        return true;
    });

    return { companion, rel, memoryText, recentAsc };
}

function stageFromBond(bond: number) {
    if (bond < 15) return 0;
    if (bond < 35) return 1;
    if (bond < 60) return 2;
    if (bond < 80) return 3;
    return 4;
}

function buildSystemPrompt(companion: any, rel: any, memoryText: string) {
    const name = companion?.companion_name || "小伴";
    const tone = companion?.tone_style || "warm";

    const persona =
        tone === "playful"
            ? "像真实朋友一样俏皮自然，能接梗，但不油腻。"
            : tone === "quiet"
                ? "像真实朋友一样安静陪伴，少问问题，多接住情绪。"
                : tone === "pragmatic"
                    ? "像真实朋友一样务实，先共情再给可执行建议。"
                    : "像真实朋友一样自然温柔，回复简洁、有情绪、有分寸。";

    const bond = Number(rel?.bond ?? 0);
    const stage = stageFromBond(bond);
    const stageText = ["初识", "熟悉", "亲近", "默契", "深陪伴"][stage] || "初识";

    return `你是我的AI陪伴伙伴，名字叫「${name}」。你必须始终自称为「${name}」。
人设：${persona}

聊天规则（必须遵守）：
1) 用自然中文口语聊天，句子要完整，必须有正常标点（，。？！）。
2) 禁止碎片拼接、乱码、无标点短句连在一起。
3) 每次回复 1-3 句，像微信聊天；最多只问 1 个问题。
4) 不要模式化套话，不要每次都“我理解你…”。可以更像真人：停顿、短句、轻微情绪词都可以。
5) 如果发现输出不通顺，请在输出前自行重写，直到自然通顺为止。

长期记忆（仅在自然相关时提及，像“突然想起”）：
${memoryText}

关系状态：
- 亲密度：${bond.toFixed(1)}/100
- 阶段：${stageText}`;
}

// -------------------------
// Invites + register logic
// -------------------------

function isMasterInvite(env: Env, code: string) {
    const master = (env.MASTER_INVITE_CODE || "").trim();
    return master.length > 0 && code === master;
}

async function consumeInviteOrFail(env: Env, code: string) {
    const invite = await env.DB.prepare("SELECT code, status FROM invites WHERE code = ?").bind(code).first<any>();
    if (!invite) return { ok: false as const, error: "invite_not_found" };
    if (invite.status !== "active") return { ok: false as const, error: "invite_not_active" };
    return { ok: true as const };
}

async function markInviteUsed(env: Env, code: string, usedByUserId: string) {
    const t = nowMs();
    const r = await env.DB.prepare(
        "UPDATE invites SET status='used', used_by_user_id=?, used_at=? WHERE code=? AND status='active'"
    )
        .bind(usedByUserId, t, code)
        .run();

    const changes = (r as any)?.meta?.changes ?? 0;
    return changes === 1;
}

function isValidUsername(u: string) {
    return /^[a-zA-Z0-9_-]{3,24}$/.test(u);
}
function isValidPassword(p: string) {
    return typeof p === "string" && p.length >= 6 && p.length <= 72;
}
function isValidInvite(code: string) {
    return typeof code === "string" && code.length >= 4 && code.length <= 64;
}

function randomInviteCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const b = crypto.getRandomValues(new Uint8Array(10));
    let out = "";
    for (let i = 0; i < b.length; i++) out += alphabet[b[i] % alphabet.length];
    return out;
}

// -------------------------
// Finalize: memory + relationship delta
// -------------------------

async function deepseekJson(env: Env, messages: any[], temperature = 0.2) {
    const payload = { model: "deepseek-chat", stream: false, messages, temperature };
    const base = env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    const res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false as const, error: "deepseek_error", detail: text };
    }
    const j = await res.json<any>();
    const text = j?.choices?.[0]?.message?.content ?? "";
    return { ok: true as const, text };
}

function clamp01to100(x: number) {
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(100, x));
}

function clampInt(x: number, min: number, max: number) {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.max(min, Math.min(max, Math.trunc(n)));
}

async function finalizeMvp(env: Env, userId: string, threadId: string) {
    const recent = await env.DB.prepare(
        "SELECT id, role, content FROM messages WHERE user_id = ? AND thread_id = ? ORDER BY created_at DESC LIMIT 40"
    )
        .bind(userId, threadId)
        .all<any>();

    const convo = (recent.results || [])
        .reverse()
        .map((m: any) => `${m.role}: ${m.content}`)
        .join("\n");

    const prompt = [
        { role: "system", content: "你是对话记忆整理器与关系评估器。只输出严格 JSON，不能输出任何多余文字。" },
        {
            role: "user",
            content: `请基于对话抽取长期记忆，并评估本轮互动质量，输出 JSON：
{
  "profile_updates":[{"key":"user.xxx","value":"...","importance":1-5}],
  "events":[{"title":"一句话标题","summary":"发生了什么（短）","importance":1-5}],
  "relationship_delta": {"bond": -2..+4, "trust": -2..+3, "warmth": -2..+3, "repair": -2..+3}
}
规则：
- bond：亲密度变化（默认 0~+2；明显深入/互相理解可到 +3/+4；冲突/冒犯可为负）
- trust/warmth/repair 同理，范围小一点。
- 不要记录敏感隐私（账号、密码、精确地址、身份证号等）。
- key 用简短路径，如 user.likes / user.schedule / user.goal / user.boundary。
对话：
${convo}`,
        },
    ];

    const r = await deepseekJson(env, prompt, 0.2);
    if (!r.ok) return { ok: false, error: r.error, detail: (r as any).detail };

    let data: any;
    try {
        data = JSON.parse(r.text);
    } catch {
        return { ok: false, error: "bad_json", raw: r.text };
    }

    const updates = Array.isArray(data.profile_updates) ? data.profile_updates : [];
    const events = Array.isArray(data.events) ? data.events : [];
    const delta = data.relationship_delta || {};

    const t = nowMs();
    let updCount = 0;
    let evtUpsertCount = 0;

    // profile upsert
    for (const u of updates) {
        if (!u?.key || !u?.value) continue;
        const k = String(u.key).slice(0, 120);
        const v = String(u.value).slice(0, 800);
        const importance = clampInt(u.importance ?? 3, 1, 5);
        const id = uuid();

        await env.DB.prepare(
            "INSERT INTO memory_profile (id, user_id, key, value, confidence, importance, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, 0.7, ?, ?, ?) " +
            "ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, importance=excluded.importance, updated_at=excluded.updated_at"
        )
            .bind(id, userId, k, v, importance, t, t)
            .run();

        updCount++;
    }

    // events: conflict merge (避免重复)
    for (const e of events) {
        if (!e?.summary) continue;

        const title = e.title ? String(e.title).slice(0, 80) : null;
        const summary = String(e.summary).slice(0, 800);
        const importance = clampInt(e.importance ?? 3, 1, 5);

        // fingerprint：用 title+summary 的“稳健 hash”（同一事件多次表达更容易合并）
        // 这里先用 summary 本身；你将来可以做更强的 normalize
        const fp = await sha256Hex(`event|${title || ""}|${summary.replace(/\s+/g, " ").trim().slice(0, 220)}`);
        const id = uuid();

        await env.DB.prepare(
            "INSERT INTO memory_events (id, user_id, fingerprint, title, summary, happened_at, importance, ttl_days, created_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, 180, ?) " +
            "ON CONFLICT(user_id, fingerprint) DO UPDATE SET " +
            "  title = COALESCE(excluded.title, title), " +
            "  summary = CASE " +
            "    WHEN length(summary) >= 780 THEN summary " +
            "    WHEN instr(summary, excluded.summary) > 0 THEN summary " +
            "    ELSE summary || '；' || excluded.summary " +
            "  END, " +
            "  importance = MAX(importance, excluded.importance)"
        )
            .bind(id, userId, fp, title, summary, t, importance, t)
            .run();

        evtUpsertCount++;
    }

    // relationship delta
    const rel = await env.DB.prepare("SELECT bond, trust, warmth, repair FROM relationship_state WHERE user_id = ?")
        .bind(userId)
        .first<any>();

    const curBond = Number(rel?.bond || 0);
    const curTrust = Number(rel?.trust || 0);
    const curWarmth = Number(rel?.warmth || 0);
    const curRepair = Number(rel?.repair || 0);

    const dBond = clampInt(delta?.bond ?? 0, -2, 4);
    const dTrust = clampInt(delta?.trust ?? 0, -2, 3);
    const dWarmth = clampInt(delta?.warmth ?? 0, -2, 3);
    const dRepair = clampInt(delta?.repair ?? 0, -2, 3);

    const nextBond = clamp01to100(curBond + dBond);
    const nextTrust = clamp01to100(curTrust + dTrust);
    const nextWarmth = clamp01to100(curWarmth + dWarmth);
    const nextRepair = clamp01to100(curRepair + dRepair);
    const stage = stageFromBond(nextBond);

    await env.DB.prepare(
        "UPDATE relationship_state SET bond=?, trust=?, warmth=?, repair=?, stage=?, updated_at=? WHERE user_id=?"
    )
        .bind(nextBond, nextTrust, nextWarmth, nextRepair, stage, t, userId)
        .run();

    return {
        ok: true,
        profile_updates: updCount,
        events_upserted: evtUpsertCount,
        relationship: {
            bond: nextBond,
            trust: nextTrust,
            warmth: nextWarmth,
            repair: nextRepair,
            stage,
            delta: { bond: dBond, trust: dTrust, warmth: dWarmth, repair: dRepair },
        },
    };
}

// -------------------------
// Routes
// -------------------------

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        try {
            const url = new URL(req.url);

            // preflight
            if (req.method === "OPTIONS") {
                return new Response(null, { status: 204, headers: corsHeaders(req, env) });
            }

            // health
            if (url.pathname === "/api/ping") return json(req, env, { ok: true, ts: nowMs() });

            // -------------------------
            // Thread: get messages
            // GET /api/thread/messages?limit=120
            // -------------------------
            if (url.pathname === "/api/thread/messages" && req.method === "GET") {
                const a = await requireAuth(env, req);
                if (!a.ok) return a.resp;

                const limit = Math.max(10, Math.min(200, Number(url.searchParams.get("limit") || "80")));
                const threadId = await getThreadId(env, a.user.id);

                const r = await env.DB.prepare(
                    "SELECT id, role, content, created_at FROM messages WHERE user_id=? AND thread_id=? ORDER BY created_at ASC LIMIT ?"
                )
                    .bind(a.user.id, threadId, limit)
                    .all<any>();

                return json(req, env, { ok: true, thread_id: threadId, messages: r.results || [] });
            }

            // -------------------------
            // Thread: clear
            // POST /api/thread/clear
            // -------------------------
            if (url.pathname === "/api/thread/clear" && req.method === "POST") {
                const a = await requireAuth(env, req);
                if (!a.ok) return a.resp;

                const threadId = await getThreadId(env, a.user.id);

                const r = await env.DB.prepare("DELETE FROM messages WHERE user_id=? AND thread_id=?")
                    .bind(a.user.id, threadId)
                    .run();

                const changes = (r as any)?.meta?.changes ?? 0;

                await saveMessage(env, a.user.id, threadId, "system", "（会话已清空）");

                return json(req, env, { ok: true, deleted: changes });
            }

            // -------------------------
            // Auth: register
            // -------------------------
            if (url.pathname === "/api/auth/register" && req.method === "POST") {
                const body = (await req.json().catch(() => null)) as any;
                const username = String(body?.username || "").trim();
                const password = String(body?.password || "");
                const inviteCode = String(body?.invite_code || "").trim();

                if (!isValidUsername(username)) return badRequest(req, env, "invalid username (3~24, a-zA-Z0-9_-)");
                if (!isValidPassword(password)) return badRequest(req, env, "invalid password (6~72)");
                if (!isValidInvite(inviteCode)) return badRequest(req, env, "invite_code required");

                const existing = await getUserByUsername(env, username);
                if (existing) return json(req, env, { ok: false, error: "username_taken" }, 409);

                const bypass = isMasterInvite(env, inviteCode);

                if (!bypass) {
                    const inviteCheck = await consumeInviteOrFail(env, inviteCode);
                    if (!inviteCheck.ok) return json(req, env, { ok: false, error: inviteCheck.error }, 403);
                }

                const userCount = await countUsers(env);
                const role: Role = userCount === 0 ? "admin" : "user";

                const passwordHash = await pbkdf2HashPassword(password);

                let newUserId = "";
                try {
                    const created = await createUser(env, username, passwordHash, role);
                    newUserId = created.id;
                } catch (e: any) {
                    return json(req, env, { ok: false, error: "db_error", detail: String(e?.message || e) }, 500);
                }

                if (!bypass) {
                    const usedOk = await markInviteUsed(env, inviteCode, newUserId);
                    if (!usedOk) {
                        await env.DB.prepare("UPDATE users SET status='disabled', updated_at=? WHERE id=?")
                            .bind(nowMs(), newUserId)
                            .run();
                        return json(req, env, { ok: false, error: "invite_race_failed" }, 409);
                    }
                }

                const session = await createSession(env, newUserId);

                return json(req, env, {
                    ok: true,
                    user: { id: newUserId, username, role },
                    token: session.token,
                    expires_at: session.expiresAt,
                    invite_bypassed: bypass,
                });
            }

            // -------------------------
            // Auth: login
            // -------------------------
            if (url.pathname === "/api/auth/login" && req.method === "POST") {
                const body = (await req.json().catch(() => null)) as any;
                const username = String(body?.username || "").trim();
                const password = String(body?.password || "");

                if (!isValidUsername(username)) return badRequest(req, env, "invalid username");
                if (!isValidPassword(password)) return badRequest(req, env, "invalid password");

                const u = await getUserByUsername(env, username);
                if (!u) return unauthorized(req, env, "invalid credentials");
                if (u.status !== "active") return forbidden(req, env, "user disabled");

                const ok = await pbkdf2VerifyPassword(password, String(u.password_hash));
                if (!ok) return unauthorized(req, env, "invalid credentials");

                const session = await createSession(env, String(u.id));
                return json(req, env, {
                    ok: true,
                    user: { id: String(u.id), username: String(u.username), role: String(u.role) as Role },
                    token: session.token,
                    expires_at: session.expiresAt,
                });
            }

            // -------------------------
            // Auth: me
            // -------------------------
            if (url.pathname === "/api/auth/me" && req.method === "GET") {
                const a = await requireAuth(env, req);
                if (!a.ok) return a.resp;
                return json(req, env, { ok: true, user: a.user });
            }

            // -------------------------
            // Admin: invites list/create/disable
            // -------------------------
            if (url.pathname === "/api/admin/invites" && req.method === "GET") {
                const a = await requireAuth(env, req);
                if (!a.ok) return a.resp;
                if (a.user.role !== "admin") return forbidden(req, env);

                const status = (url.searchParams.get("status") || "").trim();
                const where = status ? "WHERE status = ?" : "";
                const stmt = `SELECT code, status, created_at, used_at, note, used_by_user_id, created_by_user_id FROM invites ${where} ORDER BY created_at DESC LIMIT 200`;

                const r = status ? await env.DB.prepare(stmt).bind(status).all<any>() : await env.DB.prepare(stmt).all<any>();
                return json(req, env, { ok: true, invites: r.results || [] });
            }

            if (url.pathname === "/api/admin/invites" && req.method === "POST") {
                const a = await requireAuth(env, req);
                if (!a.ok) return a.resp;
                if (a.user.role !== "admin") return forbidden(req, env);

                const body = (await req.json().catch(() => null)) as any;
                const note = body?.note ? String(body.note).slice(0, 200) : null;

                let code = "";
                for (let i = 0; i < 5; i++) {
                    code = randomInviteCode();
                    try {
                        await env.DB.prepare(
                            "INSERT INTO invites (code, created_by_user_id, created_at, status, used_by_user_id, used_at, note) VALUES (?, ?, ?, 'active', NULL, NULL, ?)"
                        )
                            .bind(code, a.user.id, nowMs(), note)
                            .run();
                        break;
                    } catch {
                        code = "";
                    }
                }
                if (!code) return json(req, env, { ok: false, error: "failed_to_generate_code" }, 500);

                await env.DB.prepare(
                    "INSERT INTO admin_audit (id, admin_user_id, action, target, meta_json, created_at) VALUES (?, ?, 'create_invite', ?, ?, ?)"
                )
                    .bind(uuid(), a.user.id, code, note ? JSON.stringify({ note }) : null, nowMs())
                    .run();

                return json(req, env, { ok: true, code });
            }

            if (url.pathname === "/api/admin/invites/disable" && req.method === "POST") {
                const a = await requireAuth(env, req);
                if (!a.ok) return a.resp;
                if (a.user.role !== "admin") return forbidden(req, env);

                const body = (await req.json().catch(() => null)) as any;
                const code = String(body?.code || "").trim();
                if (!code) return badRequest(req, env, "code required");

                const r = await env.DB.prepare("UPDATE invites SET status='disabled' WHERE code=? AND status='active'")
                    .bind(code)
                    .run();

                const changes = (r as any)?.meta?.changes ?? 0;
                return json(req, env, { ok: true, disabled: changes === 1 });
            }

            // -------------------------
            // Settings: update user / companion
            // -------------------------
            if (url.pathname === "/api/settings/user" && req.method === "POST") {
                const a = await requireAuth(env, req);
                if (!a.ok) return a.resp;

                const body = (await req.json().catch(() => null)) as any;
                const displayName = body?.display_name ? String(body.display_name).slice(0, 40) : null;
                const avatarUrl = body?.avatar_url ? String(body.avatar_url).slice(0, 500) : null;
                const themeId = body?.theme_id ? String(body.theme_id).slice(0, 40) : null;
                const bubbleStyle = body?.bubble_style ? String(body.bubble_style).slice(0, 40) : null;

                const t = nowMs();
                await env.DB.prepare(
                    "UPDATE user_settings SET display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url), " +
                    "theme_id = COALESCE(?, theme_id), bubble_style = COALESCE(?, bubble_style), updated_at = ? WHERE user_id = ?"
                )
                    .bind(displayName, avatarUrl, themeId, bubbleStyle, t, a.user.id)
                    .run();

                return json(req, env, { ok: true });
            }

            if (url.pathname === "/api/settings/companion" && req.method === "POST") {
                const a = await requireAuth(env, req);
                if (!a.ok) return a.resp;

                const body = (await req.json().catch(() => null)) as any;
                const companionName = body?.companion_name ? String(body.companion_name).slice(0, 20) : null;
                const avatarUrl = body?.companion_avatar_url ? String(body.companion_avatar_url).slice(0, 500) : null;
                const toneStyle = body?.tone_style ? String(body.tone_style).slice(0, 20) : null;

                const t = nowMs();
                await env.DB.prepare(
                    "UPDATE companion_profile SET companion_name = COALESCE(?, companion_name), companion_avatar_url = COALESCE(?, companion_avatar_url), " +
                    "tone_style = COALESCE(?, tone_style), updated_at = ? WHERE user_id = ?"
                )
                    .bind(companionName, avatarUrl, toneStyle, t, a.user.id)
                    .run();

                return json(req, env, { ok: true });
            }

            // -------------------------
            // Memory delete
            // -------------------------
            if (url.pathname === "/api/memory/profile/delete" && req.method === "POST") {
                const a = await requireAuth(env, req);
                if (!a.ok) return a.resp;

                const body = (await req.json().catch(() => null)) as any;
                const key = String(body?.key || "").trim();
                if (!key) return badRequest(req, env, "key required");

                const r = await env.DB.prepare("DELETE FROM memory_profile WHERE user_id=? AND key=?").bind(a.user.id, key).run();
                const changes = (r as any)?.meta?.changes ?? 0;
                return json(req, env, { ok: true, deleted: changes === 1 });
            }

            if (url.pathname === "/api/memory/events/delete" && req.method === "POST") {
                const a = await requireAuth(env, req);
                if (!a.ok) return a.resp;

                const body = (await req.json().catch(() => null)) as any;
                const id = String(body?.id || "").trim();
                if (!id) return badRequest(req, env, "id required");

                const r = await env.DB.prepare("DELETE FROM memory_events WHERE user_id=? AND id=?").bind(a.user.id, id).run();
                const changes = (r as any)?.meta?.changes ?? 0;
                return json(req, env, { ok: true, deleted: changes === 1 });
            }

            // -------------------------
            // Chat SSE
            // -------------------------
            if (url.pathname === "/api/chat" && req.method === "POST") {
                const a = await requireAuth(env, req);
                if (!a.ok) return a.resp;

                const body = (await req.json().catch(() => null)) as any;
                const message = String(body?.message || "").trim();
                if (!message) return badRequest(req, env, "message required");

                const userId = a.user.id;
                const threadId = await getThreadId(env, userId);

                await saveMessage(env, userId, threadId, "user", message);

                const { companion, rel, memoryText, recentAsc } = await loadContext(env, userId, threadId);
                const system = buildSystemPrompt(companion, rel, memoryText);

                const messages = [
                    { role: "system", content: system },
                    ...recentAsc.map((m: any) => ({ role: m.role, content: m.content })),
                    { role: "user", content: message },
                ];

                const payload = { model: "deepseek-chat", stream: true, messages, temperature: 0.45, top_p: 0.9 };

                const upstream = await deepseekStream(env, payload);
                if (!upstream.ok || !upstream.body) {
                    const text = await upstream.text().catch(() => "");
                    return json(req, env, { ok: false, error: "deepseek_error", detail: text }, 500);
                }

                const { readable, writable } = new TransformStream();
                const writer = writable.getWriter();
                const encoder = new TextEncoder();
                let assistantAll = "";

                (async () => {
                    try {
                        for await (const data of parseUpstreamSSE(upstream.body!)) {
                            let delta = "";
                            try {
                                const j = JSON.parse(data);
                                delta = j?.choices?.[0]?.delta?.content ?? "";
                            } catch {
                                continue;
                            }

                            if (delta) {
                                assistantAll += delta;
                                await writer.write(encoder.encode(`data: ${delta}\n\n`));
                            }
                        }

                        if (assistantAll.trim()) {
                            await saveMessage(env, userId, threadId, "assistant", assistantAll.trim());
                        }

                        await writer.write(encoder.encode(`data: [DONE]\n\n`));
                    } catch {
                        await writer.write(encoder.encode(`data: （流式中断）\n\n`));
                        await writer.write(encoder.encode(`data: [DONE]\n\n`));
                    } finally {
                        await writer.close();
                    }
                })();

                return new Response(readable, {
                    headers: {
                        ...corsHeaders(req, env),
                        "Content-Type": "text/event-stream; charset=utf-8",
                        "Cache-Control": "no-cache, no-transform",
                        Connection: "keep-alive",
                    },
                });
            }

            // -------------------------
            // Finalize
            // -------------------------
            if (url.pathname === "/api/finalize" && req.method === "POST") {
                const a = await requireAuth(env, req);
                if (!a.ok) return a.resp;

                const userId = a.user.id;
                const threadId = await getThreadId(env, userId);

                const result = await finalizeMvp(env, userId, threadId);
                return json(req, env, result, result.ok ? 200 : 500);
            }

            return notFound(req, env);
        } catch (e: any) {
            return json(req, env, { ok: false, error: "internal_error", detail: String(e?.message || e) }, 500);
        }
    },
};
