import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { Modal } from "../components/Modal";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { PlusIcon, CheckIcon, XIcon } from "../components/icons";
import { useAuthStore } from "../store/auth";
import { isClientRole } from "@migalog/shared";
import { digitsOnly, clampMin } from "../lib/number";

type Vehicle = {
  id: string;
  plate: string;
  brandModel: string | null;
  capacityM3: number | null;
  ownership: "propio" | "alquilado";
  ownerCompany: string | null;
  status: "activo" | "mantenimiento" | "inactivo";
};

type FormState = { plate: string; brandModel: string; capacityM3: string; ownership: "propio" | "alquilado"; ownerCompany: string };
type FieldErrors = Partial<Record<"plate" | "ownerCompany", string>>;

const EMPTY_FORM: FormState = { plate: "", brandModel: "", capacityM3: "", ownership: "propio", ownerCompany: "" };
const OWNERSHIP_OPTIONS = [
  { value: "propio", label: "PROPIO" },
  { value: "alquilado", label: "ALQUILADO" },
];
const STATUS_LABELS: Record<Vehicle["status"], string> = { activo: "Activo", mantenimiento: "En mantenimiento", inactivo: "Inactivo" };

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.plate.trim()) errors.plate = "Campo obligatorio";
  if (form.ownership === "alquilado" && !form.ownerCompany.trim()) errors.ownerCompany = "Indicá a qué empresa se le alquila";
  return errors;
}

/**
 * Camiones: de la flota de la empresa proveedora (nivel 1, puede incluir camiones propios
 * o alquilados a un tercero) o de la flota PROPIA de la empresa cliente (nivel 2, esta
 * pantalla sirve a ambos - ver drivers.ts/vehicles.ts en el backend, que ya separan una
 * flota de la otra por "clientId"). La empresa cliente puede despachar sus propias rutas
 * con su propio camión + conductor, sin depender de la proveedora.
 */
export default function Vehicles() {
  const viewerRole = useAuthStore((s) => s.user?.role);
  const isClient = viewerRole ? isClientRole(viewerRole) : false;
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);

  const { data: vehicles, isLoading } = useQuery({ queryKey: ["vehicles"], queryFn: () => api.get<Vehicle[]>("/vehicles") });

  function buildPayload(f: FormState) {
    return {
      plate: f.plate,
      brandModel: f.brandModel || undefined,
      capacityM3: f.capacityM3 ? Number(f.capacityM3) : undefined,
      ownership: f.ownership,
      ownerCompany: f.ownership === "alquilado" ? f.ownerCompany : undefined,
    };
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((f) => ({ ...f, [key]: undefined }));
  }

  function openModal() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setError(null);
    setModalOpen(true);
  }

  const create = useMutation({
    mutationFn: () => api.post("/vehicles", buildPayload(form)),
    onSuccess: () => {
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
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
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editFieldErrors, setEditFieldErrors] = useState<FieldErrors>({});
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit(v: Vehicle) {
    setEditTarget(v);
    setEditForm({
      plate: v.plate,
      brandModel: v.brandModel ?? "",
      capacityM3: v.capacityM3 != null ? String(v.capacityM3) : "",
      ownership: v.ownership,
      ownerCompany: v.ownerCompany ?? "",
    });
    setEditFieldErrors({});
    setEditError(null);
  }

  function setEditField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    setEditFieldErrors((f) => ({ ...f, [key]: undefined }));
  }

  const update = useMutation({
    mutationFn: () => api.patch(`/vehicles/${editTarget!.id}`, buildPayload(editForm)),
    onSuccess: () => {
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
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

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Vehicle["status"] }) => api.patch(`/vehicles/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Camiones</h1>
        <Button onClick={openModal} className="flex items-center gap-1.5">
          <PlusIcon /> Agregar camión
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
        ) : !vehicles || vehicles.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Sin camiones todavía.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Placa</th>
                <th className="px-4 py-2 font-medium">Marca/Modelo</th>
                <th className="px-4 py-2 font-medium">Capacidad (m³)</th>
                {!isClient && <th className="px-4 py-2 font-medium">Propiedad</th>}
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">{v.plate}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{v.brandModel ?? "-"}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{v.capacityM3 ?? "-"}</td>
                  {!isClient && (
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                      {v.ownership === "alquilado" ? `Alquilado (${v.ownerCompany})` : "Propio"}
                    </td>
                  )}
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{STATUS_LABELS[v.status]}</td>
                  <td className="px-4 py-2">
                    <RowActionsMenu
                      actions={[
                        { label: "Editar", onClick: () => openEdit(v) },
                        ...(v.status !== "activo" ? [{ label: "Marcar activo", onClick: () => setStatus.mutate({ id: v.id, status: "activo" as const }) }] : []),
                        ...(v.status !== "mantenimiento" ? [{ label: "Marcar en mantenimiento", onClick: () => setStatus.mutate({ id: v.id, status: "mantenimiento" as const }) }] : []),
                        ...(v.status !== "inactivo" ? [{ label: "Marcar inactivo", onClick: () => setStatus.mutate({ id: v.id, status: "inactivo" as const }) }] : []),
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
        <Modal title="Agregar camión" onClose={() => setModalOpen(false)}>
          <form noValidate onSubmit={submit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <Input label="Placa" placeholder="Ingrese la placa" value={form.plate} onChange={(e) => setField("plate", e.target.value)} error={fieldErrors.plate} />
              <Input label="Marca/Modelo" placeholder="Ej. Hino 300" value={form.brandModel} onChange={(e) => setField("brandModel", e.target.value)} />
              <Input
                label="Capacidad (m³)"
                type="number"
                min={1}
                placeholder="Ingrese la capacidad"
                value={form.capacityM3}
                onChange={(e) => setField("capacityM3", digitsOnly(e.target.value))}
                onBlur={(e) => setField("capacityM3", e.target.value ? clampMin(e.target.value, 1) : "")}
              />
              {!isClient && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-500 dark:text-slate-400">Propiedad</label>
                    <Select value={form.ownership} onChange={(v) => setField("ownership", v as "propio" | "alquilado")} options={OWNERSHIP_OPTIONS} />
                  </div>
                  {form.ownership === "alquilado" && (
                    <Input
                      label="Empresa propietaria"
                      placeholder="¿A quién se le alquila?"
                      value={form.ownerCompany}
                      onChange={(e) => setField("ownerCompany", e.target.value)}
                      error={fieldErrors.ownerCompany}
                    />
                  )}
                </>
              )}
            </div>

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
        <Modal title="Editar camión" onClose={() => setEditTarget(null)}>
          <form noValidate onSubmit={submitEdit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <Input label="Placa" placeholder="Ingrese la placa" value={editForm.plate} onChange={(e) => setEditField("plate", e.target.value)} error={editFieldErrors.plate} />
              <Input label="Marca/Modelo" placeholder="Ej. Hino 300" value={editForm.brandModel} onChange={(e) => setEditField("brandModel", e.target.value)} />
              <Input
                label="Capacidad (m³)"
                type="number"
                min={1}
                placeholder="Ingrese la capacidad"
                value={editForm.capacityM3}
                onChange={(e) => setEditField("capacityM3", digitsOnly(e.target.value))}
                onBlur={(e) => setEditField("capacityM3", e.target.value ? clampMin(e.target.value, 1) : "")}
              />
              {!isClient && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-500 dark:text-slate-400">Propiedad</label>
                    <Select value={editForm.ownership} onChange={(v) => setEditField("ownership", v as "propio" | "alquilado")} options={OWNERSHIP_OPTIONS} />
                  </div>
                  {editForm.ownership === "alquilado" && (
                    <Input
                      label="Empresa propietaria"
                      placeholder="¿A quién se le alquila?"
                      value={editForm.ownerCompany}
                      onChange={(e) => setEditField("ownerCompany", e.target.value)}
                      error={editFieldErrors.ownerCompany}
                    />
                  )}
                </>
              )}
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
    </div>
  );
}
