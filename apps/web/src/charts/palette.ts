// Paleta de gráficos DP6 — literais (fora do plot; validada com dataviz/validate_palette.js).
// Só o par azul/verde como série categórica (ΔE ~29 CVD). roxo/rosa reservados. vermelho só status.
// Lê os tokens resolvidos do :root para acompanhar o tema.

export function chartColor(name: "net" | "alt" | "other" | "alert" | "credit"): string {
  const map = { net: "--c-net", alt: "--c-alt", other: "--c-other", alert: "--c-alert", credit: "--c-credit" };
  return getComputedStyle(document.documentElement).getPropertyValue(map[name]).trim() || "#1a365d";
}

export const axisStyle = {
  fontSize: 10,
  fontFamily: '"Ubuntu Mono", monospace',
  fill: "var(--ink-dim)",
};
