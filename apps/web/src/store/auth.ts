import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@migalog/shared";

export type SessionUser = {
  id: string;
  name: string;
  role: Role;
  tenantId: string | null;
  clientId: string | null;
  // Nombre de la empresa proveedora (nivel 1) o cliente (nivel 2) a la que pertenece - para
  // mostrarlo en el menú de sesión sin pedirlo aparte.
  tenantName: string | null;
  clientName: string | null;
  // PIN temporal (alta o reseteo): la app lo obliga a cambiarlo antes de seguir (ver ProtectedRoute).
  mustChangePin: boolean;
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
