// Lê o "Relatório de Diferenças Contagem" (PDF do ERP) e extrai as linhas por item.
export interface LinhaDivergencia {
  codigo: string;
  descricao: string;
  saldo: number;
  contagem: number;
  diferenca: number;
  custo: number;
  vrDiferenca: number;
}

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

export function parseLinhasDivergencia(linhas: string[]): LinhaDivergencia[] {
  const out: LinhaDivergencia[] = [];
  const re = /^(\d{1,6})\s+(.+?)\s+(\S{1,4})\s+(\d{3}\.\d{3})\s+(.+)$/;
  for (const raw of linhas) {
    const l = raw.replace(/\s+/g, " ").trim();
    const m = re.exec(l);
    if (!m) continue;
    const ns = m[5].split(" ").filter((x) => /^-?[\d.]*\d,\d+$/.test(x)).map(num);
    if (ns.length < 9) continue;
    out.push({
      codigo: m[1].padStart(5, "0"),
      descricao: m[2].trim(),
      saldo: ns[0],
      contagem: ns[1],
      diferenca: ns[2],
      custo: ns[7],
      vrDiferenca: ns[8],
    });
  }
  return out;
}

export async function lerPdfDivergencias(file: File): Promise<LinhaDivergencia[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const linhas: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 2) * 2;
      const arr = rows.get(y) ?? [];
      arr.push({ x: it.transform[4], s: it.str });
      rows.set(y, arr);
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, arr]) => linhas.push(arr.sort((a, b) => a.x - b.x).map((a) => a.s).join(" ")));
  }
  return parseLinhasDivergencia(linhas);
}
