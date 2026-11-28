import { useSearchParams } from "react-router-dom";

export type OpsView = "board" | "map";

/** Board / Map toggle shown in both Operations toolbars. Keeps the date, so the map opens on a day of the week in view. */
export function ViewSwitch({ view }: { view: OpsView }) {
  const [params, setParams] = useSearchParams();
  const pick = (v: OpsView) => {
    const p = new URLSearchParams(params);
    if (v === "board") p.delete("view");
    else p.set("view", v);
    setParams(p, { replace: true });
  };
  return (
    <div className="segmented" role="group" aria-label="View">
      <button type="button" aria-pressed={view === "board"} onClick={() => pick("board")}>
        Board
      </button>
      <button type="button" aria-pressed={view === "map"} onClick={() => pick("map")}>
        Map
      </button>
    </div>
  );
}
