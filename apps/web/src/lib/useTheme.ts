import { useCallback, useEffect, useState } from "react";

const KEY = "pcm:theme";
type Theme = "dark" | "light";

/** Tema por classe `.dark` em <html>. Dark e o padrao; so persiste "light".
 *  O script bloqueante em index.html ja aplicou a classe antes do 1o paint;
 *  aqui so sincronizamos o estado do React e o toggle. Espelha hooks/useTheme
 *  do atlas/apps/frontend. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem(KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", theme === "dark");
    try {
      if (theme === "light") localStorage.setItem(KEY, "light");
      else localStorage.removeItem(KEY);
    } catch {
      /* modo privado */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}
