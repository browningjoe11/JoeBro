import { Route, Routes } from "react-router-dom";
import type { ModuleDefinition } from "../../core/modules";
import { EstimateBuilder } from "./EstimateBuilder";
import { EstimateList } from "./EstimateList";
import { NewEstimate } from "./NewEstimate";
import "./estimates.css";

function SalesPage() {
  return (
    <Routes>
      <Route index element={<EstimateList />} />
      <Route path="new" element={<NewEstimate />} />
      <Route path="estimates/:id" element={<EstimateBuilder />} />
    </Routes>
  );
}

export const salesModule: ModuleDefinition = {
  id: "sales",
  label: "Sales",
  description: "Estimates, and later customer emails and signatures.",
  icon: "sales",
  group: "workflow",
  order: 30,
  roles: ["admin", "sales"],
  Page: SalesPage,
};
