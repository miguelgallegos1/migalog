import { SimpleCrudList } from "../components/SimpleCrudList";

export default function Providers() {
  return (
    <SimpleCrudList
      title="Empresas proveedoras"
      queryKey="providers"
      listPath="/providers"
      createPath="/providers"
      fields={[{ name: "name", label: "Nombre" }]}
      columns={[
        { key: "name", label: "Nombre" },
        { key: "id", label: "ID" },
      ]}
    />
  );
}
