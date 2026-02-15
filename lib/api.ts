// lib/api.ts
import { getToken, logout } from "./auth";

export const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE || "https://ai-buddy-api.serenius.workers.dev";

export async function apiFetch(path: string, init: RequestInit = {}) {
    const token = getToken();

    const headers = new Headers(init.headers || {});
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
        credentials: "omit",
        cache: "no-store",
    });

    if (res.status === 401) {
        logout();
    }
    return res;
}
