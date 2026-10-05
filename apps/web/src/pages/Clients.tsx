import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { defaultDialCode } from "../lib/phone";
import { PhoneInput } from "../components/PhoneInput";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Modal } from "../components/Modal";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { PlusIcon, SearchIcon, CheckIcon, XIcon, CheckCircleIcon, AlertIcon } from "../components/icons";

type ClientCompany = { id: string; ruc: string; name: string; active: boolean; adminPhone: string | null };
type FormState = { ruc: string; name: string; adminFirstName: string; adminLastName: string; adminPhone: string };
type FieldErrors = Partial<Record<keyof FormState, string>>;
type EditFormState = { ruc: string; name: string };
type EditFieldErrors = Partial<Record<keyof EditFormState, string>>;

const EMPTY_FORM: FormState = { ruc: "", name: "", adminFirstName: "", adminLastName: "", adminPhone: defaultDialCode() };

/** Validación propia (reemplaza el globo nativo del navegador que dispara el atributo `required`). */
function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.ruc.trim()) errors.ruc = "Campo obligatorio";
  if (!form.name.trim()) errors.name = "Campo obligatorio";
  if (!form.adminFirstName.trim()) errors.adminFirstName = "Campo obligatorio";
  if (!form.adminLastName.trim()) errors.adminLastName = "Campo obligatorio";
  if (!form.adminPhone.trim()) errors.adminPhone = "Campo obligatorio";
  return errors;
}

function validateEdit(form: EditFormState): EditFieldErrors {
  const errors: EditFieldErrors = {};
  if (!form.ruc.trim()) errors.ruc = "Campo obligatorio";
  if (!form.name.trim()) errors.name = "Campo obligatorio";
  return errors;
}

/**
 * Empresas cliente (nivel 2): igual que crear un tenant, acá se crea la empresa Y su
 * primer cliente_admin en un solo paso - ninguna empresa debería quedar sin alguien que
 * pueda administrarla. De ahí en adelante ese cliente_admin arma su propio equipo
 * (coordinador, solicitantes, etc.) - esta pantalla no vuelve a tocarlo.
 */
export default function Clients() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [lastSetupToken, setLastSetupToken] = useState<string | null>(null);

  const { data: clients, isLoading } = useQuery({ queryKey: ["clients"], queryFn: () => api.get<ClientCompany[]>("/clients") });

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients ?? [];
    return (clients ?? []).filter((c) => c.name.toLowerCase().includes(q) || c.ruc.toLowerCase().includes(q));
  }, [clients, search]);

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  function openModal() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setError(null);
    setLastSetupToken(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  const create = useMutation({
    mutationFn: () =>
      api.post<{ setupToken: string }>("/clients", {
        ruc: form.ruc,
        name: form.name,
        adminName: `${form.adminFirstName.trim()} ${form.adminLastName.trim()}`,
        adminPhone: form.adminPhone,
      }),
    onSuccess: (res) => {
      setLastSetupToken(res.setupToken);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "No se pudo crear la empresa cliente"),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    create.mutate();
  }

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/clients/${id}/active`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  // --- Editar (RUC / razón social) ---
  const [editTarget, setEditTarget] = useState<ClientCompany | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ ruc: "", name: "" });
  const [editFieldErrors, setEditFieldErrors] = useState<EditFieldErrors>({});
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit(c: ClientCompany) {
    setEditTarget(c);
    setEditForm({ ruc: c.ruc, name: c.name });
    setEditFieldErrors({});
    setEditError(null);
  }

  function setEditField<K extends keyof EditFormState>(key: K, value: string) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    setEditFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  const update = useMutation({
    mutationFn: () => api.patch(`/clients/${editTarget!.id}`, editForm),
    onSuccess: () => {
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : "No se pudo guardar"),
  });

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateEdit(editForm);
    setEditFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    update.mutate();
  }

  // --- Eliminar ---
  const [deleteTarget, setDeleteTarget] = useState<ClientCompany | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/clients/${id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Empresas cliente</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Empresas que te contratan transporte.</p>
        </div>
        <Button onClick={openModal} className="flex items-center gap-1.5">
          <PlusIcon /> Crear empresa cliente
        </Button>
      </div>

      <div className="relative max-w-xs">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"><SearchIcon /></span>
        <Input preserveCase placeholder="Buscar por nombre o RUC..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
        ) : filteredClients.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">{search ? "Sin resultados." : "Sin empresas cliente todavía."}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">RUC</th>
                <th className="px-4 py-2 font-medium">Razón social</th>
                <th className="px-4 py-2 font-medium">Teléfono</th>
                <th className="px-4 py-2 font-medium">Activa</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredClients.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400">{c.ruc}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{c.name}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{c.adminPhone ?? "-"}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{c.active ? "Sí" : "No"}</td>
                  <td className="px-4 py-2">
                    <RowActionsMenu
                      actions={[
                        { label: "Editar", onClick: () => openEdit(c) },
                        { label: c.active ? "Desactivar" : "Activar", onClick: () => toggleActive.mutate({ id: c.id, active: !c.active }) },
                        { label: "Eliminar", danger: true, onClick: () => { setDeleteError(null); setDeleteTarget(c); } },
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
        <Modal title={lastSetupToken ? "Empresa cliente creada" : "Crear empresa cliente"} onClose={closeModal}>
          {lastSetupToken ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-emerald-500"><CheckCircleIcon /></span>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Empresa cliente creada. Link de invitación para que su administrador configure su contraseña:
              </p>
              <div className="w-full break-all rounded-lg bg-slate-100 p-2 text-left text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {lastSetupToken}
              </div>
              <Button onClick={closeModal} className="mt-1 flex items-center gap-1.5">
                <CheckIcon /> Cerrar
              </Button>
            </div>
          ) : (
            <form noValidate onSubmit={submit} className="flex flex-col gap-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Datos de la empresa</h3>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Input label="RUC" placeholder="Ingrese el RUC" value={form.ruc} onChange={(e) => setField("ruc", e.target.value)} error={fieldErrors.ruc} />
                  <Input label="Razón social" placeholder="Ingrese la razón social" value={form.name} onChange={(e) => setField("name", e.target.value)} error={fieldErrors.name} />
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Administrador</h3>
                <div className="mt-2 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Nombres" placeholder="Ingrese los nombres" value={form.adminFirstName} onChange={(e) => setField("adminFirstName", e.target.value)} error={fieldErrors.adminFirstName} />
                    <Input label="Apellidos" placeholder="Ingrese los apellidos" value={form.adminLastName} onChange={(e) => setField("adminLastName", e.target.value)} error={fieldErrors.adminLastName} />
                  </div>
                  <PhoneInput label="Teléfono (WhatsApp)" value={form.adminPhone} onChange={(v) => setField("adminPhone", v)} error={fieldErrors.adminPhone} />
                </div>
              </div>

              {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <Button type="button" variant="secondary" onClick={closeModal} className="flex items-center gap-1.5">
                  <XIcon /> Cancelar
                </Button>
                <Button type="submit" disabled={create.isPending} className="flex items-center gap-1.5">
                  <CheckIcon /> {create.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {editTarget && (
        <Modal title="Editar empresa cliente" onClose={() => setEditTarget(null)}>
          <form noValidate onSubmit={submitEdit} className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <Input label="RUC" placeholder="Ingrese el RUC" value={editForm.ruc} onChange={(e) => setEditField("ruc", e.target.value)} error={editFieldErrors.ruc} />
              <Input label="Razón social" placeholder="Ingrese la razón social" value={editForm.name} onChange={(e) => setEditField("name", e.target.value)} error={editFieldErrors.name} />
            </div>

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
        <Modal title="Eliminar empresa cliente" onClose={() => setDeleteTarget(null)}>
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="text-red-500"><AlertIcon className="h-10 w-10" /></span>
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
