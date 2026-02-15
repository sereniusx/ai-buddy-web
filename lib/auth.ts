// lib/auth.ts
export type AuthUser = { id: string; username: string; role: "admin" | "user" };

const TOKEN_KEY = "ai_buddy_token";
const USER_KEY = "ai_buddy_user";

export function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

export function getSavedUser(): AuthUser | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as AuthUser;
    } catch {
        return null;
    }
}

export function setSavedUser(user: AuthUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSavedUser() {
    localStorage.removeItem(USER_KEY);
}

export function logout() {
    clearToken();
    clearSavedUser();
}
