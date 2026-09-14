import { SimpleCrudList } from "../components/SimpleCrudList";

export default function Drivers() {
  return (
    <div className="flex flex-col gap-2">
      <SimpleCrudList
        title="Conductores"
        queryKey="drivers"
        listPath="/drivers"
        createPath="/drivers"
        fields={[
          { name: "userId", label: "ID de usuario (rol conductor)" },
          { name: "licenseNumber", label: "N° de licencia" },
        ]}
        columns={[
          { key: "licenseNumber", label: "Licencia" },
          { key: "status", label: "Estado" },
          { key: "userId", label: "Usuario" },
        ]}
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        El usuario con rol "conductor" debe existir primero (invitalo desde Usuarios) antes de vincularlo aquí como conductor.
      </p>
    </div>
  );
}
