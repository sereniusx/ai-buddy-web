// lib/api.ts
import { getToken, logout } from "./auth";

// 你的 Worker API 地址
export const API_BASE = "https://ai-buddy-api.serenius.workers.dev";

function isFormDataBody(body: any): boolean {
    // 兼容 SSR：FormData 在 server 侧可能不存在
    if (typeof FormData === "undefined") return false;
    return body instanceof FormData;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
    const token = getToken();
    const headers = new Headers(init.headers || {});

    const body = (init as any).body;
    const formData = isFormDataBody(body);

    // ✅ 只有在需要时才设置 JSON Content-Type（避免 FormData 被破坏）
    // - body 是 string（通常 JSON.stringify）
    // - 或者你明确传了一个非 FormData 的 body
    if (!headers.has("Content-Type") && body && !formData) {
        headers.set("Content-Type", "application/json");
    }

    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
    });

    // ✅ 401 自动登出（页面跳转由调用方处理）
    if (res.status === 401) {
        logout();
    }

    return res;
}
