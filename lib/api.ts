// lib/api.ts
import { getToken, logout } from "./auth";

export const API_BASE = "https://ai-buddy-api.serenius.workers.dev";

export async function apiFetch(path: string, init: RequestInit = {}) {
    const token = getToken();
    const headers = new Headers(init.headers || {});
    headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

    // 401 直接登出，回到登录页（前端自己处理跳转）
    if (res.status === 401) {
        logout();
    }

    return res;
}
