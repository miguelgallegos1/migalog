import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { defaultDialCode } from "../lib/phone";
import { PhoneInput } from "../components/PhoneInput";
import { CopyBox } from "../components/CopyBox";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { Modal } from "../components/Modal";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { PlusIcon, CheckIcon, XIcon, CheckCircleIcon, AlertIcon } from "../components/icons";
import { useAuthStore } from "../store/auth";
import type { Role } from "@migalog/shared";

type UserRow = { id: string; name: string; role: Role; phone: string | null; active: boolean };

// admin_empresa solo crea coordinador desde acá - conductor se da de alta en "Conductores"
// (necesita camión asignado y vigencia de licencia, ver Drivers.tsx) y los roles cliente_*
// son exclusivos del cliente_admin de cada empresa cliente (ver CLIENT_OPTIONS).
// En mayúsculas a propósito, mismo criterio visual que ROLE_LABELS.
const NIVEL1_OPTIONS: { value: Role; label: string }[] = [
  { value: "coordinador", label: "COORDINADOR" },
];
// Incluye "cliente_admin" porque también sirve para el modal de EDITAR (el admin existente
// tiene que poder verse ahí) - para INVITAR se usa CLIENT_INVITE_OPTIONS, que lo excluye:
// cada empresa cliente tiene exactamente un admin (se crea solo al dar de alta la empresa,
// ver clients.ts), no se puede invitar otro desde acá.
const CLIENT_OPTIONS: { value: Role; label: string }[] = [
  { value: "cliente_admin", label: "ADMIN. EMPRESA CLIENTE" },
  { value: "cliente_coordinador", label: "COORDINADOR" },
  { value: "cliente_jefe", label: "JEFE (REPORTES)" },
  { value: "cliente_visualizador", label: "VISUALIZADOR" },
  { value: "cliente_solicitante", label: "SOLICITANTE (PIN)" },
];
const CLIENT_INVITE_OPTIONS = CLIENT_OPTIONS.filter((o) => o.value !== "cliente_admin");

type FieldErrors = Partial<Record<"firstName" | "lastName" | "phone", string>>;
type EditFieldErrors = Partial<Record<"name" | "phone", string>>;

function validateInvite(firstName: string, lastName: string, phone: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!firstName.trim()) errors.firstName = "Campo obligatorio";
  if (!lastName.trim()) errors.lastName = "Campo obligatorio";
  if (!phone.trim()) errors.phone = "Campo obligatorio";
  return errors;
}

/**
 * Invitar/editar/activar/eliminar usuarios. Esta misma pantalla sirve dos propósitos según
 * quién la mira (el backend ya filtra/valida esto en /users y /auth/invite) - cada uno ve y
 * gestiona SOLO su propio escalón, nadie se salta las atribuciones del otro:
 * - admin_empresa: su equipo de nivel 1 (coordinador).
 * - cliente_admin: su propio equipo de empresa cliente (coordinador, jefe, visualizador,
 *   solicitante) - sin elegir empresa, queda implícita en su sesión.
 *
 * No hay invitación por correo en ningún lado: todo es por teléfono/WhatsApp (ver
 * phoneSchema en @migalog/shared, que exige código de país).
 */
export default function Users() {
  const viewerRole = useAuthStore((s) => s.user?.role);
  const isClientAdmin = viewerRole === "cliente_admin";
  const queryClient = useQueryClient();
  // "roleOptions" (completa) es para EDITAR un usuario ya existente; "inviteOptions" (sin
  // cliente_admin) es para invitar uno nuevo.
  const roleOptions = isClientAdmin ? CLIENT_OPTIONS : NIVEL1_OPTIONS;
  const inviteOptions = isClientAdmin ? CLIENT_INVITE_OPTIONS : NIVEL1_OPTIONS;

  const [modalOpen, setModalOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<Role>(inviteOptions[0]!.value);
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [lastInvite, setLastInvite] = useState<{ temporaryPin: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; pin?: string; error?: string } | null>(null);

  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users") });

  function openModal() {
    setFirstName("");
    setLastName("");
    setRole(inviteOptions[0]!.value);
    setPhone("");
    setFieldErrors({});
    setError(null);
    setLastInvite(null);
    setModalOpen(true);
  }

  // Reseteo: genera un PIN temporal nuevo para la persona y lo muestra una sola vez.
  const resetPin = useMutation({
    mutationFn: (u: UserRow) => api.post<{ temporaryPin: string }>(`/users/${u.id}/reset-pin`),
    onSuccess: (res, u) => setResetResult({ name: u.name, pin: res.temporaryPin }),
    onError: (err, u) => setResetResult({ name: u.name, error: err instanceof ApiError ? err.message : "No se pudo restablecer el PIN" }),
  });

  const invite = useMutation({
    mutationFn: () =>
      api.post<{ temporaryPin: string }>("/auth/invite", {
        name: `${firstName.trim()} ${lastName.trim()}`,
        role,
        phone,
      }),
    onSuccess: (res) => {
      setLastInvite(res);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "No se pudo invitar"),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateInvite(firstName, lastName, phone);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    invite.mutate();
  }

  // --- Editar --- (el nombre ya no se separa en nombres/apellidos: ese split es solo al
  // invitar, para un registro ya existente no hay forma confiable de deshacerlo).
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>(roleOptions[0]!.value);
  const [editPhone, setEditPhone] = useState("");
  const [editFieldErrors, setEditFieldErrors] = useState<EditFieldErrors>({});
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit(u: UserRow) {
    setEditTarget(u);
    setEditName(u.name);
    setEditRole(u.role);
    setEditPhone(u.phone ?? "");
    setEditFieldErrors({});
    setEditError(null);
  }

  const updateUser = useMutation({
    mutationFn: () => api.patch(`/users/${editTarget!.id}`, { name: editName, role: editRole, phone: editPhone }),
    onSuccess: () => {
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : "No se pudo guardar"),
  });

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    const errors: EditFieldErrors = {};
    if (!editName.trim()) errors.name = "Campo obligatorio";
    if (!editPhone.trim()) errors.phone = "Campo obligatorio";
    setEditFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    updateUser.mutate();
  }

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/users/${id}/active`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const removeUser = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{isClientAdmin ? "Mi equipo" : "Usuarios"}</h1>
        <Button onClick={openModal} className="flex items-center gap-1.5">
          <PlusIcon /> Invitar usuario
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
        ) : !users || users.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Sin usuarios todavía.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2 font-medium">Teléfono</th>
                <th className="px-4 py-2 font-medium">Activo</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{u.name}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{u.role}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{u.phone ?? "-"}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{u.active ? "Sí" : "No"}</td>
                  <td className="px-4 py-2">
                    <RowActionsMenu
                      actions={[
                        { label: "Editar", onClick: () => openEdit(u) },
                        { label: "Restablecer PIN", onClick: () => resetPin.mutate(u) },
                        { label: u.active ? "Desactivar" : "Activar", onClick: () => toggleActive.mutate({ id: u.id, active: !u.active }) },
                        { label: "Eliminar", danger: true, onClick: () => { setDeleteError(null); setDeleteTarget(u); } },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {resetResult && (
        <Modal title={resetResult.error ? "No se pudo restablecer" : "PIN restablecido"} onClose={() => setResetResult(null)}>
          <div className="flex flex-col items-center gap-4 text-center">
            {resetResult.error ? (
              <p className="text-sm text-red-500 dark:text-red-400">{resetResult.error}</p>
            ) : (
              <>
                <span className="text-emerald-500"><CheckCircleIcon /></span>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Entrégale este PIN temporal a {resetResult.name} en persona. Deberá cambiarlo al ingresar.
                </p>
                <CopyBox caption="PIN temporal" value={resetResult.pin ?? ""} />
              </>
            )}
            <Button onClick={() => setResetResult(null)} className="mt-1 flex items-center gap-1.5">
              <CheckIcon /> Cerrar
            </Button>
          </div>
        </Modal>
      )}

      {modalOpen && (
        <Modal title={lastInvite ? "Invitación creada" : "Invitar usuario"} onClose={() => setModalOpen(false)}>
          {lastInvite ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="text-emerald-500"><CheckCircleIcon /></span>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Entrégale este PIN temporal a la persona en persona. Deberá cambiarlo al ingresar.
              </p>
              <CopyBox caption="PIN temporal" value={lastInvite.temporaryPin} />
              <Button onClick={() => setModalOpen(false)} className="mt-1 flex items-center gap-1.5">
                <CheckIcon /> Cerrar
              </Button>
            </div>
          ) : (
            <form noValidate onSubmit={submit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Nombres"
                    placeholder="Ingrese los nombres"
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); setFieldErrors((f) => ({ ...f, firstName: undefined })); }}
                    error={fieldErrors.firstName}
                  />
                  <Input
                    label="Apellidos"
                    placeholder="Ingrese los apellidos"
                    value={lastName}
                    onChange={(e) => { setLastName(e.target.value); setFieldErrors((f) => ({ ...f, lastName: undefined })); }}
                    error={fieldErrors.lastName}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400">Rol</label>
                  <Select value={role} onChange={(v) => setRole(v as Role)} options={inviteOptions} />
                </div>
                <PhoneInput
                  label="Teléfono (WhatsApp)"
                  value={phone}
                  onChange={(v) => { setPhone(v); setFieldErrors((f) => ({ ...f, phone: undefined })); }}
                  error={fieldErrors.phone}
                />
              </div>

              {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} className="flex items-center gap-1.5">
                  <XIcon /> Cancelar
                </Button>
                <Button type="submit" disabled={invite.isPending} className="flex items-center gap-1.5">
                  <CheckIcon /> {invite.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {editTarget && (
        <Modal title="Editar usuario" onClose={() => setEditTarget(null)}>
          <form noValidate onSubmit={submitEdit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <Input
                label="Nombre"
                placeholder="Ingrese el nombre completo"
                value={editName}
                onChange={(e) => { setEditName(e.target.value); setEditFieldErrors((f) => ({ ...f, name: undefined })); }}
                error={editFieldErrors.name}
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Rol</label>
                <Select value={editRole} onChange={(v) => setEditRole(v as Role)} options={roleOptions} />
              </div>
              <PhoneInput
                label="Teléfono (WhatsApp)"
                value={editPhone}
                onChange={(v) => { setEditPhone(v); setEditFieldErrors((f) => ({ ...f, phone: undefined })); }}
                error={editFieldErrors.phone}
              />
            </div>

            {editError && <p className="text-sm text-red-500 dark:text-red-400">{editError}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Button type="button" variant="secondary" onClick={() => setEditTarget(null)} className="flex items-center gap-1.5">
                <XIcon /> Cancelar
              </Button>
              <Button type="submit" disabled={updateUser.isPending} className="flex items-center gap-1.5">
                <CheckIcon /> {updateUser.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Eliminar usuario" onClose={() => setDeleteTarget(null)}>
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400"><AlertIcon className="h-6 w-6" /></span>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              ¿Eliminar a <strong>{deleteTarget.name}</strong>? Esta acción no se puede deshacer.
            </p>
            {deleteError && <p className="text-sm text-red-500 dark:text-red-400">{deleteError}</p>}
            <div className="mt-1 flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)} className="flex items-center gap-1.5">
                <XIcon /> Cancelar
              </Button>
              <Button type="button" variant="danger" disabled={removeUser.isPending} onClick={() => removeUser.mutate(deleteTarget.id)} className="flex items-center gap-1.5">
                <CheckIcon /> {removeUser.isPending ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
