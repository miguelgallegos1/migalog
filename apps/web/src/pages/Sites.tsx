import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Modal } from "../components/Modal";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { LocationPicker } from "../components/LocationPicker";
import { PlusIcon, SearchIcon, CheckIcon, XIcon, AlertIcon } from "../components/icons";

type Site = {
  id: string;
  name: string;
  company: string;
  contactPhone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  active: boolean;
};

type FormState = { company: string; name: string; contactPhone: string; address: string; lat: number | null; lng: number | null };
type FieldErrors = Partial<Record<"company" | "name", string>>;

const EMPTY_FORM: FormState = { company: "", name: "", contactPhone: "", address: "", lat: null, lng: null };

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.company.trim()) errors.company = "Campo obligatorio";
  if (!form.name.trim()) errors.name = "Campo obligatorio";
  return errors;
}

/**
 * Sitios: lugares reutilizables (con la empresa a la que pertenecen, para facturación, y
 * su ubicación GPS) que arma la empresa cliente - se eligen como origen/parada/destino/
 * sitio de facturación al crear una ruta del catálogo, en vez de tipear todo cada vez.
 */
export default function Sites() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);

  const { data: sites, isLoading } = useQuery({ queryKey: ["sites"], queryFn: () => api.get<Site[]>("/sites") });

  const filteredSites = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sites ?? [];
    return (sites ?? []).filter((s) => s.name.toLowerCase().includes(q) || s.company.toLowerCase().includes(q));
  }, [sites, search]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "company" || key === "name") setFieldErrors((f) => ({ ...f, [key]: undefined }));
  }

  function openModal() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setError(null);
    setModalOpen(true);
  }

  const create = useMutation({
    mutationFn: () =>
      api.post("/sites", {
        company: form.company,
        name: form.name,
        contactPhone: form.contactPhone || undefined,
        address: form.address || undefined,
        lat: form.lat ?? undefined,
        lng: form.lng ?? undefined,
      }),
    onSuccess: () => {
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "No se pudo crear"),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    create.mutate();
  }

  // --- Editar ---
  const [editTarget, setEditTarget] = useState<Site | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editFieldErrors, setEditFieldErrors] = useState<FieldErrors>({});
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit(s: Site) {
    setEditTarget(s);
    setEditForm({ company: s.company, name: s.name, contactPhone: s.contactPhone ?? "", address: s.address ?? "", lat: s.lat, lng: s.lng });
    setEditFieldErrors({});
    setEditError(null);
  }

  function setEditField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    if (key === "company" || key === "name") setEditFieldErrors((f) => ({ ...f, [key]: undefined }));
  }

  const update = useMutation({
    mutationFn: () =>
      api.patch(`/sites/${editTarget!.id}`, {
        company: editForm.company,
        name: editForm.name,
        contactPhone: editForm.contactPhone || undefined,
        address: editForm.address || undefined,
        lat: editForm.lat ?? undefined,
        lng: editForm.lng ?? undefined,
      }),
    onSuccess: () => {
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : "No se pudo guardar"),
  });

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validate(editForm);
    setEditFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    update.mutate();
  }

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/sites/${id}/active`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sites"] }),
  });

  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/sites/${id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Sitios</h1>
        <Button onClick={openModal} className="flex items-center gap-1.5">
          <PlusIcon /> Agregar sitio
        </Button>
      </div>

      <div className="relative max-w-xs">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"><SearchIcon /></span>
        <Input preserveCase placeholder="Buscar por sitio o empresa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
        ) : filteredSites.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">{search ? "Sin resultados." : "Sin sitios todavía."}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Empresa</th>
                <th className="px-4 py-2 font-medium">Sitio</th>
                <th className="px-4 py-2 font-medium">Contacto celular</th>
                <th className="px-4 py-2 font-medium">GPS</th>
                <th className="px-4 py-2 font-medium">Activo</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredSites.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{s.company}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{s.name}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{s.contactPhone ?? "-"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                    {s.lat != null && s.lng != null ? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}` : "-"}
                  </td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{s.active ? "Sí" : "No"}</td>
                  <td className="px-4 py-2">
                    <RowActionsMenu
                      actions={[
                        { label: "Editar", onClick: () => openEdit(s) },
                        { label: s.active ? "Desactivar" : "Activar", onClick: () => toggleActive.mutate({ id: s.id, active: !s.active }) },
                        { label: "Eliminar", danger: true, onClick: () => { setDeleteError(null); setDeleteTarget(s); } },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <Modal title="Agregar sitio" onClose={() => setModalOpen(false)}>
          <form noValidate onSubmit={submit} className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Empresa" placeholder="Ingrese la empresa" value={form.company} onChange={(e) => setField("company", e.target.value.toUpperCase())} error={fieldErrors.company} />
              <Input label="Sitio" placeholder="Ingrese el sitio" value={form.name} onChange={(e) => setField("name", e.target.value.toUpperCase())} error={fieldErrors.name} />
            </div>
            <Input label="Contacto celular" placeholder="Ej. +593991234567" value={form.contactPhone} onChange={(e) => setField("contactPhone", e.target.value)} />

            <LocationPicker
              lat={form.lat}
              lng={form.lng}
              onChange={({ lat, lng, address }) => setForm((prev) => ({ ...prev, lat, lng, address: address ?? prev.address }))}
            />

            {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} className="flex items-center gap-1.5">
                <XIcon /> Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending} className="flex items-center gap-1.5">
                <CheckIcon /> {create.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {editTarget && (
        <Modal title="Editar sitio" onClose={() => setEditTarget(null)}>
          <form noValidate onSubmit={submitEdit} className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Empresa" placeholder="Ingrese la empresa" value={editForm.company} onChange={(e) => setEditField("company", e.target.value.toUpperCase())} error={editFieldErrors.company} />
              <Input label="Sitio" placeholder="Ingrese el sitio" value={editForm.name} onChange={(e) => setEditField("name", e.target.value.toUpperCase())} error={editFieldErrors.name} />
            </div>
            <Input label="Contacto celular" placeholder="Ej. +593991234567" value={editForm.contactPhone} onChange={(e) => setEditField("contactPhone", e.target.value)} />

            <LocationPicker
              lat={editForm.lat}
              lng={editForm.lng}
              onChange={({ lat, lng, address }) => setEditForm((prev) => ({ ...prev, lat, lng, address: address ?? prev.address }))}
            />

            {editError && <p className="text-sm text-red-500 dark:text-red-400">{editError}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Button type="button" variant="secondary" onClick={() => setEditTarget(null)} className="flex items-center gap-1.5">
                <XIcon /> Cancelar
              </Button>
              <Button type="submit" disabled={update.isPending} className="flex items-center gap-1.5">
                <CheckIcon /> {update.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Eliminar sitio" onClose={() => setDeleteTarget(null)}>
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400"><AlertIcon className="h-6 w-6" /></span>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              ¿Eliminar <strong>{deleteTarget.name}</strong>? Esta acción no se puede deshacer.
            </p>
            {deleteError && <p className="text-sm text-red-500 dark:text-red-400">{deleteError}</p>}
            <div className="mt-1 flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)} className="flex items-center gap-1.5">
                <XIcon /> Cancelar
              </Button>
              <Button type="button" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(deleteTarget.id)} className="flex items-center gap-1.5">
                <CheckIcon /> {remove.isPending ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
