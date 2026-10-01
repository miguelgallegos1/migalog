import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { DatePicker } from "../components/DatePicker";
import { Modal } from "../components/Modal";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { PlusIcon, CheckIcon, XIcon, CheckCircleIcon } from "../components/icons";
import { fileToDataUrl } from "../lib/files";

type Driver = {
  id: string;
  name: string | null;
  phone: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  licenseExpiresAt: string;
  licensePhotoFront: string | null;
  licensePhotoBack: string | null;
  status: "activo" | "inactivo";
};

type Vehicle = { id: string; plate: string };

type FormState = {
  name: string;
  phone: string;
  vehicleId: string;
  licenseExpiresAt: string;
  licensePhotoFront: string | null;
  licensePhotoBack: string | null;
};

type FieldErrors = Partial<Record<"name" | "phone" | "licenseExpiresAt", string>>;

const EMPTY_FORM: FormState = { name: "", phone: "", vehicleId: "", licenseExpiresAt: "", licensePhotoFront: null, licensePhotoBack: null };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isExpired(iso: string): boolean {
  return iso < todayISO();
}

function PhotoField({ label, value, onChange }: { label: string; value: string | null; onChange: (dataUrl: string | null) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-500 dark:text-slate-400">{label}</label>
      {value ? (
        <div className="flex items-center gap-2">
          <img src={value} alt={label} className="h-14 w-20 rounded-md border border-slate-300 object-cover dark:border-slate-700" />
          <button type="button" onClick={() => onChange(null)} className="text-xs text-red-500 hover:text-red-400 dark:text-red-400 dark:hover:text-red-300">
            Quitar
          </button>
        </div>
      ) : (
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            setError(null);
            try {
              onChange(await fileToDataUrl(e.target.files?.[0] ?? null));
            } catch (err) {
              setError(err instanceof Error ? err.message : "No se pudo leer la imagen");
            }
          }}
          className="block w-full text-xs text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-300 dark:text-slate-400 dark:file:bg-slate-700 dark:file:text-slate-200 dark:hover:file:bg-slate-600"
        />
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}

/**
 * Conductores: de la empresa proveedora o propios de la empresa cliente (rol
 * cliente_conductor) - esta pantalla sirve a ambos (ver vehicles.ts/drivers.ts en el
 * backend, que separan una flota de la otra por "clientId"). Crea el usuario Y el
 * conductor juntos (antes era un paso manual aparte). Cada conductor tiene un camión FIJO
 * asignado, y se controla por VIGENCIA de licencia (no número) - vencida, ese conductor ya
 * no se puede asignar a una ruta (ver RouteDetail.tsx / route-service.ts).
 */
export default function Drivers() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<{ setupToken: string } | null>(null);

  const { data: drivers, isLoading } = useQuery({ queryKey: ["drivers"], queryFn: () => api.get<Driver[]>("/drivers") });
  const { data: vehicles } = useQuery({ queryKey: ["vehicles"], queryFn: () => api.get<Vehicle[]>("/vehicles") });
  const vehicleOptions = (vehicles ?? []).map((v) => ({ value: v.id, label: v.plate }));

  function validate(f: FormState): FieldErrors {
    const errors: FieldErrors = {};
    if (!f.name.trim()) errors.name = "Campo obligatorio";
    if (!f.phone.trim()) errors.phone = "Campo obligatorio";
    if (!f.licenseExpiresAt) errors.licenseExpiresAt = "Campo obligatorio";
    return errors;
  }

  function openModal() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setError(null);
    setLastCreated(null);
    setModalOpen(true);
  }

  const create = useMutation({
    mutationFn: () =>
      api.post<{ setupToken: string }>("/drivers", {
        name: form.name,
        phone: form.phone,
        vehicleId: form.vehicleId || undefined,
        licenseExpiresAt: form.licenseExpiresAt,
        licensePhotoFront: form.licensePhotoFront ?? undefined,
        licensePhotoBack: form.licensePhotoBack ?? undefined,
      }),
    onSuccess: (res) => {
      setLastCreated(res);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
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
  const [editTarget, setEditTarget] = useState<Driver | null>(null);
  const [editVehicleId, setEditVehicleId] = useState("");
  const [editLicenseExpiresAt, setEditLicenseExpiresAt] = useState("");
  const [editPhotoFront, setEditPhotoFront] = useState<string | null>(null);
  const [editPhotoBack, setEditPhotoBack] = useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<Pick<FieldErrors, "licenseExpiresAt">>({});
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit(d: Driver) {
    setEditTarget(d);
    setEditVehicleId(d.vehicleId ?? "");
    setEditLicenseExpiresAt(d.licenseExpiresAt);
    setEditPhotoFront(d.licensePhotoFront);
    setEditPhotoBack(d.licensePhotoBack);
    setEditFieldErrors({});
    setEditError(null);
  }

  const update = useMutation({
    mutationFn: () =>
      api.patch(`/drivers/${editTarget!.id}`, {
        vehicleId: editVehicleId || undefined,
        licenseExpiresAt: editLicenseExpiresAt,
        licensePhotoFront: editPhotoFront ?? undefined,
        licensePhotoBack: editPhotoBack ?? undefined,
      }),
    onSuccess: () => {
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : "No se pudo guardar"),
  });

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editLicenseExpiresAt) {
      setEditFieldErrors({ licenseExpiresAt: "Campo obligatorio" });
      return;
    }
    update.mutate();
  }

  const toggleActive = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "activo" | "inactivo" }) => api.patch(`/drivers/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["drivers"] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Conductores</h1>
        <Button onClick={openModal} className="flex items-center gap-1.5">
          <PlusIcon /> Agregar conductor
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
        ) : !drivers || drivers.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Sin conductores todavía.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Teléfono</th>
                <th className="px-4 py-2 font-medium">Camión</th>
                <th className="px-4 py-2 font-medium">Vigencia licencia</th>
                <th className="px-4 py-2 font-medium">Activo</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {drivers.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{d.name ?? "-"}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{d.phone ?? "-"}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{d.vehiclePlate ?? "Sin asignar"}</td>
                  <td className={`px-4 py-2 ${isExpired(d.licenseExpiresAt) ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300"}`}>
                    {d.licenseExpiresAt}
                    {isExpired(d.licenseExpiresAt) ? " · VENCIDA" : ""}
                  </td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{d.status === "activo" ? "Sí" : "No"}</td>
                  <td className="px-4 py-2">
                    <RowActionsMenu
                      actions={[
                        { label: "Editar", onClick: () => openEdit(d) },
                        {
                          label: d.status === "activo" ? "Desactivar" : "Activar",
                          onClick: () => toggleActive.mutate({ id: d.id, status: d.status === "activo" ? "inactivo" : "activo" }),
                        },
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
        <Modal title={lastCreated ? "Conductor creado" : "Agregar conductor"} onClose={() => setModalOpen(false)}>
          {lastCreated ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-emerald-500"><CheckCircleIcon /></span>
              <p className="text-sm text-slate-700 dark:text-slate-300">Conductor creado (setear PIN). Link de configuración:</p>
              <div className="w-full break-all rounded-lg bg-slate-100 p-2 text-left text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {lastCreated.setupToken}
              </div>
              <Button onClick={() => setModalOpen(false)} className="mt-1 flex items-center gap-1.5">
                <CheckIcon /> Cerrar
              </Button>
            </div>
          ) : (
            <form noValidate onSubmit={submit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <Input
                  label="Nombre"
                  placeholder="Ingrese el nombre completo"
                  value={form.name}
                  onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setFieldErrors((f) => ({ ...f, name: undefined })); }}
                  error={fieldErrors.name}
                />
                <Input
                  label="Teléfono (WhatsApp)"
                  placeholder="Ingrese el teléfono"
                  value={form.phone}
                  onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })); setFieldErrors((f) => ({ ...f, phone: undefined })); }}
                  error={fieldErrors.phone}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400">Camión asignado</label>
                  <Select value={form.vehicleId} onChange={(v) => setForm((f) => ({ ...f, vehicleId: v }))} options={vehicleOptions} placeholder="Elegí un camión..." />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400">Vigencia de la licencia</label>
                  <DatePicker
                    value={form.licenseExpiresAt}
                    onChange={(v) => { setForm((f) => ({ ...f, licenseExpiresAt: v })); setFieldErrors((f) => ({ ...f, licenseExpiresAt: undefined })); }}
                    error={fieldErrors.licenseExpiresAt}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <PhotoField label="Foto licencia (frente)" value={form.licensePhotoFront} onChange={(v) => setForm((f) => ({ ...f, licensePhotoFront: v }))} />
                  <PhotoField label="Foto licencia (dorso)" value={form.licensePhotoBack} onChange={(v) => setForm((f) => ({ ...f, licensePhotoBack: v }))} />
                </div>
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
          )}
        </Modal>
      )}

      {editTarget && (
        <Modal title="Editar conductor" onClose={() => setEditTarget(null)}>
          <form noValidate onSubmit={submitEdit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {editTarget.name} · {editTarget.phone}
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Camión asignado</label>
                <Select value={editVehicleId} onChange={setEditVehicleId} options={vehicleOptions} placeholder="Elegí un camión..." />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Vigencia de la licencia</label>
                <DatePicker
                  value={editLicenseExpiresAt}
                  onChange={(v) => { setEditLicenseExpiresAt(v); setEditFieldErrors({}); }}
                  error={editFieldErrors.licenseExpiresAt}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PhotoField label="Foto licencia (frente)" value={editPhotoFront} onChange={setEditPhotoFront} />
                <PhotoField label="Foto licencia (dorso)" value={editPhotoBack} onChange={setEditPhotoBack} />
              </div>
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
