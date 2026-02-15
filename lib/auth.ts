// lib/auth.ts
import type { AuthUser } from "./types";

const TOKEN_KEY = "ai_buddy_token";
const USER_KEY = "ai_buddy_user";

function hasWindow() {
    return typeof window !== "undefined";
}

export function getToken(): string | null {
    if (!hasWindow()) return null;
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
    if (!hasWindow()) return;
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    if (!hasWindow()) return;
    localStorage.removeItem(TOKEN_KEY);
}

export function getSavedUser(): AuthUser | null {
    if (!hasWindow()) return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as AuthUser;
    } catch {
        return null;
    }
}

export function setSavedUser(user: AuthUser) {
    if (!hasWindow()) return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSavedUser() {
    if (!hasWindow()) return;
    localStorage.removeItem(USER_KEY);
}

export function logout() {
    clearToken();
    clearSavedUser();
}
