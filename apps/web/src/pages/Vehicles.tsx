import { SimpleCrudList } from "../components/SimpleCrudList";

export default function Vehicles() {
  return (
    <SimpleCrudList
      title="Camiones"
      queryKey="vehicles"
      listPath="/vehicles"
      createPath="/vehicles"
      fields={[
        { name: "plate", label: "Placa" },
        { name: "capacityKg", label: "Capacidad (kg)", type: "number" },
      ]}
      columns={[
        { key: "plate", label: "Placa" },
        { key: "capacityKg", label: "Capacidad (kg)" },
        { key: "status", label: "Estado" },
      ]}
    />
  );
}
