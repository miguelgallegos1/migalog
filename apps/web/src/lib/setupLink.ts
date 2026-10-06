/** Link de invitación para crear la contraseña: apunta a la propia web (ver pages/Configurar.tsx). */
export function setupLink(setupToken: string): string {
  return `${window.location.origin}/configurar?token=${encodeURIComponent(setupToken)}`;
}
