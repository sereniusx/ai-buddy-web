// lib/types.ts
export type Role = "admin" | "user";

export type AuthUser = {
    id: string;
    username: string;
    role: Role;
};

export type ChatRole = "user" | "assistant" | "system";

export type Msg = {
    id: string;
    role: ChatRole;
    content: string;
    created_at: number;
};

export type ApiOk<T> = { ok: true } & T;
export type ApiErr = { ok: false; error: string; detail?: string };

export type RegisterResp =
    | ApiOk<{ user: AuthUser; token: string; expires_at: number; invite_bypassed?: boolean }>
    | ApiErr;

export type LoginResp =
    | ApiOk<{ user: AuthUser; token: string; expires_at: number }>
    | ApiErr;
