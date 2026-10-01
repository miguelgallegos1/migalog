// Nombre para mostrar de cada rol - antes vivía dentro de Header.tsx, pero UserMenu.tsx
// también lo necesita y Header.tsx importa UserMenu, así que queda en su propio módulo para
// no armar un import circular.
// En mayúsculas a propósito (no es un descuido): mismo criterio visual que los campos de
// texto de la app, que también fuerzan mayúsculas al registrar.
export const ROLE_LABELS: Record<string, string> = {
  super_admin: "DUEÑO DE LA PLATAFORMA",
  // Nivel 1 - empresa proveedora
  admin_empresa: "ADMIN. EMPRESA PROVEEDORA",
  coordinador: "COORDINADOR (PROVEEDORA)",
  conductor: "CONDUCTOR",
  // Nivel 2 - empresa cliente
  cliente_admin: "ADMIN. EMPRESA CLIENTE",
  cliente_coordinador: "COORDINADOR (CLIENTE)",
  cliente_jefe: "JEFE (REPORTES)",
  cliente_visualizador: "VISUALIZADOR",
  cliente_solicitante: "SOLICITANTE",
  cliente_conductor: "CONDUCTOR (CLIENTE)",
};
