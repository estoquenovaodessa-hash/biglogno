import {
  displayDay, indicatorChange, indicatorValue,
  type GeneralIndicator, type GeneralReport,
} from "./general-report";

// A prévia e o JPEG usam a mesma rotina Canvas 2D: não existe imagem ilustrativa com dados fictícios.
const W = 1080, H = 1920;
const P = { bg: "#061529", panel: "#0b233d", panel2: "#0d2b48", border: "#24517e", blue: "#79b8ff", white: "#f3f8ff", muted: "#aac3dc", green: "#4be0a1", red: "#ff7a81", gold: "#ffbf24" };
const format = (v: number) => Math.abs(v).toFixed(0);

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, stroke = P.border) {
  ctx.fillStyle = P.panel;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 20);
  ctx.fill();
  ctx.stroke();
}
function text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, color = P.white, bold = false, align: CanvasTextAlign = "left") {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.font = `${bold ? "700" : "400"} ${size}px Arial, sans-serif`;
  ctx.fillText(str, x, y);
}
function fitText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, maxW: number, size: number, color = P.white, bold = false) {
  let s = size;
  do {
    ctx.font = `${bold ? "700" : "400"} ${s}px Arial, sans-serif`;
    if (ctx.measureText(str).width <= maxW) break;
    s -= 1;
  } while (s > 17);
  text(ctx, str, x, y, s, color, bold);
}
function paragraphs(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number, size: number, lineHeight: number, maxLines = 3, color = P.muted, bold = false) {
  ctx.font = `${bold ? "700" : "400"} ${size}px Arial, sans-serif`;
  const words = value.split(/\s+/);
  let line = "", written = 0;
  for (let i = 0; i < words.length; i++) {
    const possible = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(possible).width > maxWidth && line) {
      text(ctx, line, x, y + written * lineHeight, size, color, bold);
      written++;
      if (written >= maxLines) return;
      line = words[i];
    } else line = possible;
  }
  if (line && written < maxLines) text(ctx, line, x, y + written * lineHeight, size, color, bold);
}
function metric(report: GeneralReport, key: GeneralIndicator["key"]) { return report.indicators.find(m => m.key === key)!; }
function tone(indicator: GeneralIndicator) {
  return indicator.direction === "up" ? P.green : indicator.direction === "down" ? P.red : P.blue;
}
function iconBox(ctx: CanvasRenderingContext2D, x: number, y: number, symbol: string) {
  ctx.fillStyle = "#184577";
  ctx.beginPath();
  ctx.roundRect(x, y, 62, 62, 12);
  ctx.fill();
  text(ctx, symbol, x + 31, y + 44, 37, P.blue, true, "center");
}
function graph(ctx: CanvasRenderingContext2D, indicator: GeneralIndicator, x: number, y: number) {
  const maximum = Math.max(1, indicator.previous ?? 0, indicator.current ?? 0);
  const values = [indicator.previous ?? 0, indicator.current ?? 0];
  values.forEach((v, i) => {
    ctx.fillStyle = i === 0 ? "#426f9e" : P.green;
    const h = Math.max(2, Math.round(Math.min(1, v / maximum) * 72));
    ctx.fillRect(x + i * 44, y + 72 - h, 27, h);
  });
  text(ctx, "ANT.", x + 13, y + 94, 13, P.muted, true, "center");
  text(ctx, "ATUAL", x + 57, y + 94, 13, P.muted, true, "center");
}
function kpi(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, indicator: GeneralIndicator, symbol: string) {
  card(ctx, x, y, w, 286);
  iconBox(ctx, x + 25, y + 23, symbol);
  fitText(ctx, indicator.title, x + 101, y + 55, w - 122, 24, P.white, true);
  paragraphs(ctx, indicator.detail, x + 102, y + 82, w - 125, 18, 23, 2);
  const v = indicatorValue(indicator.current, indicator.unit);
  fitText(ctx, v, x + 27, y + 191, w - 193, 70, P.white, true);
  graph(ctx, indicator, x + w - 123, y + 123);
  text(ctx, indicatorChange(indicator), x + 29, y + 244, 23, tone(indicator), true);
  text(ctx, "comparado à semana anterior", x + 29, y + 267, 17, P.muted);
}

export function renderGeneralReportJPEG(canvas: HTMLCanvasElement, report: GeneralReport) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não oferece suporte à geração de imagem.");
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#06152d"); bg.addColorStop(0.6, "#061327"); bg.addColorStop(1, "#082040");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(960, 0, 30, 960, 0, 650);
  g.addColorStop(0, "rgba(38,104,178,0.25)");
  g.addColorStop(1, "rgba(38,104,178,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 720);

  // Assinatura visual do BigLogno, sem depender de imagens externas.
  ctx.fillStyle = "#164b94"; ctx.fillRect(43, 42, 94, 94);
  text(ctx, "B", 91, 113, 80, P.gold, true, "center");
  text(ctx, "GESTÃO DE LOGÍSTICA", 165, 84, 29, P.blue, true);
  text(ctx, "APURAÇÃO GERAL", 44, 199, 63, P.white, true);
  text(ctx, "RELATÓRIO EXECUTIVO SEMANAL", 45, 244, 27, P.gold, true);
  ctx.fillStyle = P.gold; ctx.fillRect(0, 276, W, 5);
  text(ctx, `${displayDay(report.weekStart)} — ${displayDay(report.weekEnd)}`, 45, 326, 26, P.white, true);
  text(ctx, `Comparação: ${displayDay(report.priorStart)} a ${displayDay(report.priorEnd)}`, 45, 360, 21, P.muted);
  if (report.partial) text(ctx, "SEMANA AINDA EM ANDAMENTO", 1034, 115, 20, P.gold, true, "right");

  card(ctx, 40, 394, 1000, 179, "#2d6394");
  const success = report.improved > report.declined;
  const equal = report.improved === report.declined;
  const overview = report.comparable === 0 ? "Dados insuficientes"
    : equal ? "Semana em equilíbrio" : success ? "Evolução positiva" : "Pontos de atenção";
  const ovColor = report.comparable === 0 ? P.blue : equal ? P.gold : success ? P.green : P.red;
  iconBox(ctx, 68, 444, report.comparable && success ? "↑" : report.comparable && !equal ? "↘" : "≋");
  text(ctx, "RESUMO DA SEMANA", 154, 445, 23, P.blue, true);
  fitText(ctx, overview, 154, 493, 822, 46, ovColor, true);
  text(ctx, `${report.improved} melhores · ${report.declined} em queda · ${report.stable} estáveis · ${report.indicators.length - report.comparable} sem comparação`,
    154, 534, 20, P.muted);

  const main = [
    ["accuracy", "◎"], ["cycles", "⬡"],
    ["checks", "▣"], ["deliveries", "▰"],
  ] as const;
  main.forEach(([key, symbol], i) => {
    kpi(ctx, 40 + (i % 2) * 510, 603 + Math.floor(i / 2) * 307, 490, metric(report, key), symbol);
  });

  card(ctx, 40, 1234, 1000, 280);
  text(ctx, "OUTROS RESULTADOS", 67, 1281, 28, P.gold, true);
  const extra = [
    ["recounts", "Reinventários"], ["checkAccuracy", "Acerto das conferências"], ["pickups", "Retiras"],
  ] as const;
  extra.forEach(([key, label], i) => {
    const m = metric(report, key), x = 66 + i * 329;
    if (i) {ctx.fillStyle = P.border; ctx.fillRect(x - 15, 1305, 1, 180);}
    paragraphs(ctx, label, x, 1342, 293, 21, 26, 2, P.muted, true);
    fitText(ctx, indicatorValue(m.current, m.unit), x, 1410, 286, 46, P.white, true);
    paragraphs(ctx, indicatorChange(m), x, 1462, 288, 19, 24, 2, tone(m), true);
  });

  card(ctx, 40, 1543, 1000, 296);
  text(ctx, "DESTAQUES DA SEMANA", 67, 1591, 29, P.gold, true);
  const highlights = report.highlights.slice(0, 4);
  highlights.forEach((highlight, i) => {
    const y = 1643 + i * 57;
    ctx.fillStyle = "#1c4d86"; ctx.beginPath(); ctx.arc(87, y - 8, 19, 0, Math.PI * 2); ctx.fill();
    text(ctx, String(i + 1), 87, y, 20, P.white, true, "center");
    paragraphs(ctx, highlight, 122, y, 885, 22, 27, 2, P.white);
  });

  text(ctx, "Indicadores calculados dos registros do BigLogno · critérios: data de conclusão e acuracidade ponderada por item.", 43, 1873, 16, P.muted);
  ctx.fillStyle = P.gold; ctx.fillRect(43, 1894, 994, 4);
  text(ctx, "BigLogno • Gestão de Logística", 43, 1915, 17, P.blue, true);
  return canvas;
}

export function saveGeneralReportJPEG(canvas: HTMLCanvasElement, report: GeneralReport) {
  canvas.toBlob(blob => {
    if (!blob) { window.alert("Não foi possível gerar o JPEG. Tente novamente."); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `BigLogno_Apuracao_Geral_${report.weekStart}.jpg`;
    link.href = url;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/jpeg", 0.93);
}
