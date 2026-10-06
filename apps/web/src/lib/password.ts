/** Requisitos de contraseña - el mismo criterio se valida en el servidor (routes/auth.ts). */
export function passwordRules(pw: string) {
  return [
    { id: "len", label: "Al menos 8 caracteres", ok: pw.length >= 8 },
    { id: "upper", label: "Una letra mayúscula", ok: /[A-ZÁÉÍÓÚÑ]/.test(pw) },
    { id: "lower", label: "Una letra minúscula", ok: /[a-záéíóúñ]/.test(pw) },
    { id: "digit", label: "Un número", ok: /\d/.test(pw) },
  ];
}

export function strengthOf(pw: string): { score: number; label: string; color: string } {
  const rules = passwordRules(pw);
  const met = rules.filter((r) => r.ok).length + (pw.length >= 12 ? 1 : 0) + (/[^A-Za-z0-9]/.test(pw) ? 1 : 0);
  if (!pw) return { score: 0, label: "", color: "bg-slate-200 dark:bg-slate-700" };
  if (met <= 2) return { score: 1, label: "Débil", color: "bg-red-500" };
  if (met <= 4) return { score: 2, label: "Media", color: "bg-amber-400" };
  return { score: 3, label: "Fuerte", color: "bg-emerald-500" };
}
