import { useSearchParams } from "react-router-dom";
import { MapView } from "./MapView";
import { SchedulingBoard } from "./SchedulingBoard";

/** Operations: the week board (O2) or the day map (O3), picked with ?view=map. */
export function OperationsPage() {
  const [params] = useSearchParams();
  return params.get("view") === "map" ? <MapView /> : <SchedulingBoard />;
}
