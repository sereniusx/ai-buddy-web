// lib/types.ts

export type Role = "admin" | "user";

export type AuthUser = {
    id: string;
    username: string;
    role: Role;
};

export type UserSettings = {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    theme_id: string;
    bubble_style: string;
    updated_at: number;
};

export type CompanionProfile = {
    user_id: string;
    companion_name: string;
    companion_avatar_url: string | null;
    tone_style: string;
    updated_at: number;
};

export type Invite = {
    code: string;
    status: "active" | "used" | "disabled";
    created_at: number;
    used_at?: number | null;
    note?: string | null;
    used_by_user_id?: string | null;
    created_by_user_id?: string | null;
};
