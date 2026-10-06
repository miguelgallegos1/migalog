import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Muestra un link o código para compartir, con botón para copiarlo completo. */
export function CopyBox({ value, caption }: { value: string; caption: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Sin acceso al portapapeles (p. ej. contexto no seguro): el texto queda visible para copiarlo a mano.
    }
  }

  return (
    <div className="w-full text-left">
      <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{caption}</p>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-2 dark:border-slate-700 dark:bg-slate-800/60">
        <code className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-300" title={value}>
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
