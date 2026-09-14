import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button } from "./Button";

export type Field = { name: string; label: string; type?: "text" | "number" };

type Row = Record<string, unknown>;

/**
 * Lista + formulario de alta genéricos para catálogos simples (proveedores, conductores,
 * camiones): declarás los campos del form y las columnas de la tabla, y este componente
 * se encarga de cargar, crear e invalidar la query. Evita reescribir el mismo patrón de
 * tabla + formulario en cada pantalla de catálogo.
 */
export function SimpleCrudList({
  title,
  queryKey,
  listPath,
  createPath,
  fields,
  columns,
}: {
  title: string;
  queryKey: string;
  listPath: string;
  createPath: string;
  fields: Field[];
  columns: { key: string; label: string }[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({ queryKey: [queryKey], queryFn: () => api.get<Row[]>(listPath) });

  const create = useMutation({
    mutationFn: () => {
      // Solo mandamos los campos que la persona efectivamente completó, convirtiendo a
      // número los que el campo declara como "number" (todo llega como string del <input>).
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        if (form[f.name] === undefined || form[f.name] === "") continue;
        payload[f.name] = f.type === "number" ? Number(form[f.name]) : form[f.name];
      }
      return api.post(createPath, payload);
    },
    onSuccess: () => {
      setForm({});
      setError(null);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "No se pudo crear"),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60"
      >
        {fields.map((f) => (
          <div key={f.name} className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">{f.label}</label>
            <input
              type={f.type === "number" ? "number" : "text"}
              value={form[f.name] ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.name]: e.target.value }))}
              className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        ))}
        <Button type="submit" disabled={create.isPending}>
          Agregar
        </Button>
      </form>
      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
        ) : !rows || rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Sin registros todavía.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-2 font-medium">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.map((row, i) => (
                <tr key={(row.id as string) ?? i}>
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-2 text-slate-700 dark:text-slate-300">{String(row[c.key] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
