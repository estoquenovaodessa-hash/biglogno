import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalyzedItem, EnderecoBase, ZonaSeguraRecord } from "./types";
import type { AjusteRoboRelatorio, AjusteRoboMovimentacao } from "./zona-segura-robo-json";

export type FonteDescricaoAjustes = {
  enderecoBase: EnderecoBase;
  zonaSegura: ZonaSeguraRecord[];
  items: AnalyzedItem[];
};

export const nomePdfAjustesEstoque = (relatorio: AjusteRoboRelatorio) =>
  "ajustes-estoque-autcom-" + relatorio.data + ".pdf";

export function linhasPdfAjustesEstoque(
  relatorio: AjusteRoboRelatorio,
  fonte: FonteDescricaoAjustes,
): string[][] {
  const catalogo = new Map<string, { descricao: string; endereco: string }>();
  // Dados do cadastro preservam descrição/endereço, mesmo quando o JSON
  // contém apenas o código e os saldos.
  for (const item of fonte.items) catalogo.set(item.codigo, {
    descricao: item.descricao, endereco: item.endereco,
  });
  for (const item of fonte.zonaSegura) {
    const anterior = catalogo.get(item.codigo);
    catalogo.set(item.codigo, {
      descricao: anterior?.descricao || item.descricao,
      endereco: anterior?.endereco || item.endereco,
    });
  }
  for (const [codigo, item] of Object.entries(fonte.enderecoBase.registros)) {
    const anterior = catalogo.get(codigo);
    catalogo.set(codigo, {
      descricao: item.descricao || anterior?.descricao || "",
      endereco: item.endereco || anterior?.endereco || "",
    });
  }

  const texto = (value: string | undefined): string => value?.trim() || "Não informado";
  const status = (row: AjusteRoboMovimentacao): string =>
    row.status === "divergente" ? "Divergente" :
    row.status === "correto" ? "Correto" : texto(row.status);

  return relatorio.movimentacoes.map(row => {
    const rec = catalogo.get(row.codigo);
    return [
      String(row.ordem), row.data, texto(row.hora), row.codigo,
      texto(row.descricao || rec?.descricao),
      texto(row.endereco || rec?.endereco),
      texto(row.comando),
      texto(row.saldoAnterior),
      texto(row.saldoSolicitado),
      texto(row.saldoAtual),
      status(row),
      row.ajusteRealizado === null ? "Não informado" : (row.ajusteRealizado ? "Sim" : "Não"),
    ];
  });
}

/** Histórico integral: uma linha por ocorrência, inclusive códigos repetidos.
 * O PDF não altera o estado de estoque nem aplica um segundo ajuste.
 */
export function gerarPdfAjustesEstoque(
  relatorio: AjusteRoboRelatorio,
  fonte: FonteDescricaoAjustes,
): jsPDF {
  if (!relatorio.movimentacoes.length)
    throw new Error("Não há movimentações para incluir no relatório PDF.");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: "Relatório de movimentações do Autcom Bot - " + relatorio.data,
    subject: "Histórico integral da rotina ajuste_estoque",
    author: "BigLogno",
  });

  const dataBR = (raw: string) => raw.slice(8, 10) + "/" + raw.slice(5, 7) + "/" + raw.slice(0, 4);
  const agora = new Date();
  const geradoEm = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const ajustados = relatorio.movimentacoes.filter(r => r.ajusteRealizado === true).length;
  const semAjuste = relatorio.movimentacoes.filter(r => r.ajusteRealizado === false).length;

  doc.setFillColor(22, 45, 82);
  doc.rect(0, 0, 297, 24, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255);
  doc.setFontSize(15);
  doc.text("BIGLOGNO  |  RELATÓRIO DE AJUSTES DE ESTOQUE", 10, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("AUTCOM BOT  -  RELATÓRIO DO DIA " + dataBR(relatorio.data), 10, 18);
  doc.setTextColor(32, 41, 55);
  doc.setFontSize(9);
  doc.text("Gerado em: " + geradoEm + " (Brasília)", 10, 31);
  doc.text(
    "Movimentações: " + relatorio.totalRegistrosOriginais +
    "  |  Códigos únicos: " + relatorio.registros.length +
    "  |  Repetições: " + relatorio.registrosSubstituidos +
    "  |  Com ajuste: " + ajustados + "  |  Sem ajuste: " + semAjuste,
    10, 37,
  );
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(
    "Todas as ocorrências na ordem do JSON. Na Zona Segura vale apenas a última ocorrência por código.",
    10, 42,
  );
  doc.text(
    "Comando e hora aparecem como 'Não informado' quando o arquivo não fornece esses dados. Horário do relatório não é horário do ajuste.",
    10, 46,
  );

  const dados = linhasPdfAjustesEstoque(relatorio, fonte);
  autoTable(doc, {
    startY: 51,
    head: [[
      "#", "Data", "Hora", "Código", "Descrição", "Endereço",
      "Comando", "Saldo anterior", "Solicitado", "Saldo atual", "Status", "Ajuste realizado",
    ]],
    body: dados,
    theme: "striped",
    showHead: "everyPage",
    margin: { top: 14, right: 10, bottom: 15, left: 10 },
    styles: { font: "helvetica", fontSize: 7, cellPadding: 1.7, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [22, 45, 82], textColor: 255, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [239, 244, 249] },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 20 },
      2: { cellWidth: 15 },
      3: { cellWidth: 18 },
      4: { cellWidth: 62 },
      5: { cellWidth: 22 },
      6: { cellWidth: 30 },
      7: { cellWidth: 19 },
      8: { cellWidth: 18 },
      9: { cellWidth: 19 },
      10: { cellWidth: 22 },
      11: { cellWidth: 24 },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index === 10 && String(data.cell.raw) === "Divergente")
        data.cell.styles.textColor = [184, 42, 42];
      if (data.column.index === 11 && String(data.cell.raw) === "Sim")
        data.cell.styles.textColor = [25, 119, 75];
    },
  });

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(95);
    doc.text("BigLogno / Autcom Bot - " + relatorio.data, 10, 202);
    doc.text("Página " + i + " de " + paginas, 287, 202, { align: "right" });
  }
  return doc;
}
