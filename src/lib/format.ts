export function fmtInt(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

export function fmtNum(n: number, dec = 2): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 999) return "∞";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n);
}

// Encurta rótulos "001.000 - LUKMA" para "LUKMA" (mantém o texto todo se não houver separador).
export function shortLinha(raw: string | undefined | null): string {
  const s = (raw ?? "").toString().trim();
  if (!s) return "";
  const parts = s.split(/\s+-\s+/);
  return (parts[parts.length - 1] || s).trim();
}


/**
 * Extrai a data de referência a partir do nome do arquivo da planilha.
 * Suporta formatos como: 2026-06-24, 24-06-2026, 24_06_2026, 24062026,
 * 20260624, 24.06.26, etc. Retorna no formato YYYY-MM-DD ou null.
 */
export function extractDateFromFilename(filename: string): string | null {
  const name = filename.replace(/\.[a-z0-9]+$/i, "");
  const pad = (x: string) => x.padStart(2, "0");
  const norm = (y: string, m: string, d: string): string | null => {
    let yy = parseInt(y, 10);
    if (y.length === 2) yy = 2000 + yy;
    const mm = parseInt(m, 10);
    const dd = parseInt(d, 10);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${yy}-${pad(String(mm))}-${pad(String(dd))}`;
  };

  // YYYY-MM-DD / YYYY_MM_DD / YYYY.MM.DD
  let m = name.match(/(\d{4})[-_.\/](\d{1,2})[-_.\/](\d{1,2})/);
  if (m) return norm(m[1], m[2], m[3]);
  // DD-MM-YYYY / DD_MM_YYYY / DD.MM.YYYY / DD-MM-YY
  m = name.match(/(\d{1,2})[-_.\/](\d{1,2})[-_.\/](\d{2,4})/);
  if (m) return norm(m[3], m[2], m[1]);
  // YYYYMMDD (8 dígitos consecutivos, ano primeiro)
  m = name.match(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/);
  if (m) {
    const r = norm(m[1], m[2], m[3]);
    if (r) return r;
  }
  // DDMMYYYY
  m = name.match(/(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/);
  if (m) return norm(m[3], m[2], m[1]);
  return null;
}

export function nowParts() {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return {
    iso: d.toISOString(),
    data: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    dataBR: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function fmtDateBR(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function fmtDateTimeBR(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    if (/[";\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const csv = rows.map((r) => r.map(escape).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Alguns navegadores iniciam o salvamento após o fim do clique.
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Os quatro formatos da Contagem continuam sendo arquivos independentes.
export type CountingFileKind = "contagem" | "travar" | "destravar" | "pdf";
export const COUNTING_FILES: ReadonlyArray<{ kind: CountingFileKind; name: string }> = [
  { kind: "contagem", name: "CSV de contagem" },
  { kind: "travar", name: "CSV Travar" },
  { kind: "destravar", name: "CSV Destravar" },
  { kind: "pdf", name: "Relatório PDF" },
];
