// Gera um JPEG em formato retrato (celular) com apenas os 4 cards de métricas
// da tela "Analisar": Movimentados, Negativos, Zerados e Estoque baixo.
import type { ImportRecord } from "@/lib/types";

export type CardInfo = {
  label: string;
  hint: string;
  media: number;
  atual: number;
  base: number;
  temAnterior: boolean;
  igual: boolean;
  subiu: boolean;
  rotulo: string;
  pctText: string;
  bom: boolean | null;
};

const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

// Paleta fixa (independente do tema do painel, otimizada para leitura no celular)
const C = {
  bg: "#eef2f7",
  card: "#ffffff",
  border: "#dfe6ef",
  text: "#0f172a",
  muted: "#64748b",
  accent: "#2563eb",
  okBg: "#dcfce7",
  okText: "#15803d",
  badBg: "#fee2e2",
  badText: "#b91c1c",
  neutralBg: "#e2e8f0",
  neutralText: "#475569",
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

const font = (ctx: CanvasRenderingContext2D, weight: number, size: number) => {
  ctx.font = `${weight} ${size}px "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
};

export async function gerarJpegCards(cards: CardInfo[], subtitulo: string): Promise<Blob> {
  const W = 1080;
  const PAD = 48;
  const CARD_H = 320;
  const GAP = 26;
  const HEADER_H = 216;
  const FOOTER_H = 74;
  const H = HEADER_H + cards.length * (CARD_H + GAP) + FOOTER_H;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");

  // Fundo
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Cabeçalho
  const headX = PAD;
  ctx.fillStyle = C.accent;
  rr(ctx, headX, 52, 64, 8, 4);
  ctx.fill();
  ctx.fillStyle = C.text;
  font(ctx, 700, 44);
  ctx.fillText("Monitor ABC · Analisar", headX, 116);
  ctx.fillStyle = C.muted;
  font(ctx, 400, 25);
  ctx.fillText(subtitulo, headX, 156);

  // Cards
  let y = HEADER_H;
  for (const m of cards) {
    const x = PAD;
    const w = W - PAD * 2;

    // Cartão
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.08)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = C.card;
    rr(ctx, x, y, w, CARD_H, 18);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1.5;
    rr(ctx, x, y, w, CARD_H, 18);
    ctx.stroke();

    const inX = x + 34;
    const inW = w - 68;

    // Selo de variação (direita)
    const badgeText = `${m.igual ? "–" : m.subiu ? "▲" : "▼"} ${m.rotulo}${!m.igual ? ` ${m.pctText}` : ""}`;
    font(ctx, 600, 23);
    const bw = ctx.measureText(badgeText).width + 40;
    const bx = x + w - 34 - bw;
    const by = y + 28;
    ctx.fillStyle = m.igual || m.bom === null ? C.neutralBg : m.bom ? C.okBg : C.badBg;
    rr(ctx, bx, by, bw, 44, 22);
    ctx.fill();
    ctx.fillStyle = m.igual || m.bom === null ? C.neutralText : m.bom ? C.okText : C.badText;
    ctx.fillText(badgeText, bx + 20, by + 30);

    // Título e subtítulo
    ctx.fillStyle = C.text;
    font(ctx, 700, 31);
    ctx.fillText(m.label, inX, y + 62);
    ctx.fillStyle = C.muted;
    font(ctx, 400, 23);
    ctx.fillText(m.hint, inX, y + 94);

    // Colunas de números
    const col1 = inX;
    const col2 = inX + 390;
    const col3 = inX + 660;
    ctx.fillStyle = C.muted;
    font(ctx, 600, 19);
    ctx.fillText("MÉDIA GERAL", col1, y + 156);
    ctx.fillText("ÚLTIMA IMPORTAÇÃO", col2, y + 156);
    if (m.temAnterior) ctx.fillText("MÉDIA ANTERIOR", col3, y + 156);

    ctx.fillStyle = C.text;
    font(ctx, 700, 64);
    ctx.fillText(fmt(m.media), col1, y + 224);
    font(ctx, 600, 40);
    ctx.fillText(fmt(m.atual), col2, y + 222);
    if (m.temAnterior) {
      ctx.fillStyle = C.muted;
      ctx.fillText(fmt(m.base), col3, y + 222);
    }

    // Impacto
    if (!m.igual && m.bom !== null) {
      const msg = m.bom
        ? "Impacto positivo — suas decisões estão melhorando este número."
        : "Impacto negativo — este número piorou na última importação.";
      font(ctx, 600, 21);
      const pw = Math.min(inW, ctx.measureText(msg).width + 36);
      ctx.fillStyle = m.bom ? C.okBg : C.badBg;
      rr(ctx, inX, y + 250, pw, 44, 10);
      ctx.fill();
      ctx.fillStyle = m.bom ? C.okText : C.badText;
      ctx.fillText(msg, inX + 18, y + 279);
    }

    y += CARD_H + GAP;
  }

  // Rodapé
  ctx.fillStyle = C.muted;
  font(ctx, 400, 21);
  ctx.fillText("Monitor ABC de Movimentos — Bignotto", PAD, H - 34);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar o JPEG."))), "image/jpeg", 0.92),
  );
  return blob;
}

export function baixarJpegCards(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// Calcula os dados dos 4 cards a partir do histórico (mesma lógica da tela)
export function computarCards(
  history: ImportRecord[],
  metricas: { label: string; hint: string; get: (h: ImportRecord) => number; lowerIsBetter: boolean | null }[],
): CardInfo[] {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const ultima = history[0];
  const anteriores = history.slice(1);
  return metricas.map((m) => {
    const media = avg(history.map(m.get));
    const atual = ultima ? m.get(ultima) : 0;
    const base = avg(anteriores.map(m.get));
    const diff = anteriores.length ? atual - base : 0;
    const pct = base ? (diff / base) * 100 : 0;
    const subiu = diff > 0;
    const igual = Math.abs(diff) < 0.05 || !anteriores.length;
    const bom = m.lowerIsBetter === null ? null : m.lowerIsBetter ? !subiu : subiu;
    const rotulo = igual ? (anteriores.length ? "Estável" : "Primeira importação") : subiu ? "Aumentou" : "Caiu";
    const pctText = Math.abs(pct) >= 0.5 ? fmt(Math.abs(pct)) + "%" : "menos de 1%";
    return {
      label: m.label,
      hint: m.hint,
      media,
      atual,
      base,
      temAnterior: anteriores.length > 0,
      igual,
      subiu,
      rotulo,
      pctText,
      bom,
    };
  });
}
