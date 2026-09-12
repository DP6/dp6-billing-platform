// Formatacao PT-BR (DP6: R$ 1.284,93 · +3,84% · milhar "." decimal ",").
// Convencoes espelham atlas/apps/frontend/src/lib/format.ts.

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const usdFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });
const usd6Fmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});

export const brl = (v: number | null | undefined) => (v == null ? "—" : brlFmt.format(v));
/** US$ com 6 casas quando |v| < 0,01 (custo subcentavo), senao 2. */
export const usd = (v: number | null | undefined) =>
  v == null ? "—" : Math.abs(v) < 0.01 && v !== 0 ? usd6Fmt.format(v) : usdFmt.format(v);

export const pct = (v: number | null | undefined, digits = 1) =>
  v == null
    ? "—"
    : `${v >= 0 ? "+" : ""}${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

export const pctPlain = (v: number | null | undefined, digits = 1) =>
  v == null
    ? "—"
    : `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

export const num = (v: number | null | undefined, digits = 0) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "202609" -> "set/26" */
export const monthLabel = (ym: string) => {
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const y = ym.slice(2, 4);
  const mi = Number(ym.slice(4, 6)) - 1;
  return `${meses[mi] ?? ym}/${y}`;
};

/** "202609" -> "Setembro 2026" */
export const monthLong = (ym: string) => {
  const meses = [
    "Janeiro",
    "Fevereiro",
    "Marco",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  const y = ym.slice(0, 4);
  const mi = Number(ym.slice(4, 6)) - 1;
  return `${meses[mi] ?? ym} ${y}`;
};

/** "2026-08-21" -> "21/ago" */
export const dayLabel = (iso: string) => {
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [, mm, dd] = iso.split("-");
  return `${dd}/${meses[Number(mm) - 1] ?? mm}`;
};

/** ISO timestamp -> "agora mesmo" / "ha N min" / "ha Nh" / "ha N dias" */
export const relativeToNow = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `ha ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `ha ${hrs}h`;
  return `ha ${Math.floor(hrs / 24)} dias`;
};

// aliases com os nomes do Atlas
export const formatBrl = brl;
export const formatUsd = usd;
export const formatPct = pct;
export const formatNumber = num;
export const formatRelativeToNow = relativeToNow;
