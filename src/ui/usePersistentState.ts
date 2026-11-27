import { useEffect, useState } from "react";

/**
 * useState that remembers its value in this browser (localStorage) under `key`.
 * Pass `null` as the key for plain, unremembered state.
 * Falls back to plain state when storage is unavailable (private mode, blocked).
 */
export function usePersistentState<T>(key: string | null, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (key === null) return initial;
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    if (key === null) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: value just won't persist */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
