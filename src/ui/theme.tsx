import { useEffect } from "react";
import { usePersistentState } from "./usePersistentState";

export type ThemeChoice = "system" | "light" | "dark";

/** Applies the chosen theme to <html data-theme>. "system" removes the attribute so the device decides. */
export function useTheme() {
  const [theme, setTheme] = usePersistentState<ThemeChoice>("jb.theme", "system");
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);
  return [theme, setTheme] as const;
}

export function ThemePicker({ theme, onChange }: { theme: ThemeChoice; onChange: (t: ThemeChoice) => void }) {
  return (
    <label className="topbar-select">
      <span>Theme</span>
      <select id="theme-picker" value={theme} onChange={(e) => onChange(e.target.value as ThemeChoice)}>
        <option value="system">Match device</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
