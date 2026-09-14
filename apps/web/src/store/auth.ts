import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@migalog/shared";

export type SessionUser = {
  id: string;
  name: string;
  role: Role;
  tenantId: string | null;
};

type AuthState = {
  accessToken: string | null;
  user: SessionUser | null;
  setSession: (accessToken: string, user: SessionUser) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setSession: (accessToken, user) => set({ accessToken, user }),
      logout: () => set({ accessToken: null, user: null }),
    }),
    { name: "migalog-session" }
  )
);
