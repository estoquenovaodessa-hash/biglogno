import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Upload,
  Barcode,
  ScanLine,
  CheckCircle2,
  Plus,
  Minus,
  Trash2,
  FileText,
  RotateCcw,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { nowParts, fmtDateBR } from "@/lib/format";

// Detecção de "bipado" vs "digitado":
// Um leitor de código de barras emite todos os caracteres em rajada
// (intervalos < 30ms) e finaliza com Enter. Digitação humana tem
// intervalos muito maiores. Usamos ~40ms como corte.
const SCAN_INTERVAL_MS = 40;

const limparValorBipado = (value: string) => value.replace(/[\r\n\t]/g, "").trim();

const candidatosBarcode = (value: string) => {
  const limpo = limparValorBipado(value);
  const compacto = limpo.replace(/\s/g, "").replace(/\|/g, "");
  const somenteDigitos = compacto.replace(/\D/g, "");
  return Array.from(new Set([limpo, compacto, somenteDigitos].filter(Boolean)));
};

export function Contagem() {
  const {
    barcodesBase,
    contagemAtual,
    importBarcodesBase,
    importContagem,
    atualizarContagemItem,
    setContagemContado,
    removerContagemItem,
    marcarContagemZerado,
    finalizarContagem,
    cancelarContagem,
  } = useStore();

  const barcodesFileRef = useRef<HTMLInputElement>(null);
  const contagemFileRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const [scan, setScan] = useState("");
  const [ultimo, setUltimo] = useState<{
    codigo: string;
    descricao: string;
    modo: "bip" | "manual";
  } | null>(null);
  const intervals = useRef<number[]>([]);
  const lastTs = useRef<number | null>(null);
  const ultimoCommit = useRef<{ raw: string; at: number } | null>(null);

  const barcodesTotal = Object.keys(barcodesBase.registros).length;
  const itens = contagemAtual?.itens ?? [];
  const bipados = itens.filter((i) => i.bipado).length;
  const divergentes = itens.filter((i) => i.bipado && i.contado !== i.saldo).length;

  const itemPorCodigo = useMemo(() => {
    const m = new Map<string, number>();
    itens.forEach((i, idx) => m.set(i.codigo, idx));
    return m;
  }, [itens]);

  const codigoPorBarcode = useCallback(
    (value: string) => {
      for (const candidato of candidatosBarcode(value)) {
        const codigo = barcodesBase.porBarcode[candidato];
        if (codigo) return codigo;
      }
      return undefined;
    },
    [barcodesBase.porBarcode],
  );

  const limparCampoBipagem = useCallback(() => {
    setScan("");
    if (scanInputRef.current) scanInputRef.current.value = "";
  }, []);

  // Prévia do item conforme o usuário digita/bipa.
  const preview = useMemo(() => {
    const raw = limparValorBipado(scan);
    if (!raw) return null;
    // Tenta como código de barras
    const porBarcode = codigoPorBarcode(raw);
    const codigo = porBarcode ?? raw;
    const idx = itemPorCodigo.get(codigo);
    if (idx === undefined) return { encontrado: false as const, codigo: raw };
    const it = itens[idx];
    return { encontrado: true as const, codigo: it.codigo, descricao: it.descricao };
  }, [scan, codigoPorBarcode, itemPorCodigo, itens]);

  const onBarcodesFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await importBarcodesBase(f);
    if (barcodesFileRef.current) barcodesFileRef.current.value = "";
  };

  const onContagemFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await importContagem(f);
    if (contagemFileRef.current) contagemFileRef.current.value = "";
  };

  const focoScan = () => setTimeout(() => scanInputRef.current?.focus(), 30);

  const registrarKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = performance.now();
    if (lastTs.current != null && e.key.length === 1) {
      intervals.current.push(now - lastTs.current);
    }
    if (e.key.length === 1) lastTs.current = now;
  };

  const commitScan = useCallback((override?: string) => {
    const raw = limparValorBipado(override ?? scanInputRef.current?.value ?? scan);
    if (!raw) return;
    if (!contagemAtual) {
      toast.error("Carregue a planilha de contagem antes de bipar.");
      limparCampoBipagem();
      return;
    }

    // Determina modo com base no intervalo médio entre teclas.
    const avg =
      intervals.current.length > 0
        ? intervals.current.reduce((a, b) => a + b, 0) / intervals.current.length
        : Infinity;
    const modoBip = intervals.current.length >= 2 && avg < SCAN_INTERVAL_MS;

    intervals.current = [];
    lastTs.current = null;

    let codigo: string | undefined;
    let modoFinal: "bip" | "manual" = modoBip ? "bip" : "manual";

    // Primeiro tenta como código de barras real. Alguns leitores enviam os
    // caracteres como um único input/paste rápido, então a medição por tempo
    // pode não detectar "bip". Se existir na base, contabiliza direto.
    const codigoEncontradoPorBarcode = codigoPorBarcode(raw);
    if (codigoEncontradoPorBarcode) {
      codigo = codigoEncontradoPorBarcode;
      modoFinal = "bip";
    } else if (modoBip) {
      toast.error(`Código de barras ${raw} não encontrado na base.`);
      limparCampoBipagem();
      focoScan();
      return;
    } else {
      // Digitação: só aceita se for um código de item (não um código de barras).
      // Códigos de barras normalmente têm >= 12 dígitos.
      if (/^\d{12,}$/.test(raw)) {
        toast.error(
          "Código de barras não funciona digitado. Bipe com o leitor ou digite o código do item.",
        );
        limparCampoBipagem();
        focoScan();
        return;
      }
      codigo = raw;
      modoFinal = "manual";
    }

    const idx = itemPorCodigo.get(codigo);
    if (idx === undefined) {
      toast.error(`Item ${codigo} não está na planilha de contagem atual.`);
      limparCampoBipagem();
      focoScan();
      return;
    }

    const agora = performance.now();
    if (ultimoCommit.current?.raw === raw && agora - ultimoCommit.current.at < 120) {
      limparCampoBipagem();
      focoScan();
      return;
    }
    ultimoCommit.current = { raw, at: agora };

    const itemAtual = itens[idx];
    atualizarContagemItem(codigo, 1);
    setUltimo({ codigo, descricao: itemAtual?.descricao ?? "", modo: modoFinal });
    limparCampoBipagem();
    focoScan();
  }, [atualizarContagemItem, codigoPorBarcode, contagemAtual, itemPorCodigo, limparCampoBipagem, scan]);

  useEffect(() => {
    const raw = limparValorBipado(scan);
    if (!raw || !contagemAtual || !codigoPorBarcode(raw)) return;
    const timer = window.setTimeout(() => commitScan(raw), 80);
    return () => window.clearTimeout(timer);
  }, [codigoPorBarcode, commitScan, contagemAtual, scan]);

  const doFinalizar = () => {
    const res = finalizarContagem();
    if (res.contados === 0 && res.naoContados.length === 0) return;
    // Gera PDF dos itens NÃO bipados.
    if (res.naoContados.length > 0) {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const p = nowParts();
      doc.setFontSize(15);
      doc.text("Itens não bipados — Contagem", 14, 14);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(
        `Gerado em ${p.dataBR} ${p.hora} · ${res.naoContados.length} itens sem bipagem de ${res.contados + res.naoContados.length} totais.`,
        14,
        20,
      );
      doc.setTextColor(0);
      autoTable(doc, {
        startY: 26,
        head: [["Código", "Descrição", "Endereço", "Linha", "Grupo", "Qtd. que consta"]],
        body: res.naoContados.map((i) => [
          i.codigo,
          (i.descricao || "").slice(0, 46),
          i.endereco || "—",
          i.linha || "—",
          i.grupo || "—",
          String(i.saldo),
        ]),
        theme: "striped",
        styles: { fontSize: 8, halign: "center" },
        headStyles: { fillColor: [37, 99, 235] },
      });
      doc.save(`itens-nao-bipados-${p.data}.pdf`);
    }
    toast.success(
      `Contagem finalizada: ${res.contados} bipados enviados para Zona Segura` +
        (res.naoContados.length > 0
          ? ` · PDF com ${res.naoContados.length} não bipados baixado.`
          : "."),
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <ScanLine className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Conferência Manual por bipagem</h2>
            <p className="text-sm text-muted-foreground">
              Carregue a base de códigos de barras (permanente) e a planilha de contagem do dia.
              Bipe cada item — o sistema soma a quantidade contada. Códigos de barras só funcionam
              bipados; códigos do item funcionam apenas se digitados. Ao finalizar, itens bipados
              vão para a Zona Segura (Correto se bater com o saldo, Divergente se não bater) e é
              baixado um PDF com os itens que não foram bipados.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <Barcode className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Base de códigos de barras</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {barcodesTotal > 0
                  ? `${barcodesTotal} produtos · ${Object.keys(barcodesBase.porBarcode).length} códigos de barras. Arquivo: ${barcodesBase.nomeArquivo || "—"}.`
                  : "Nenhuma base carregada. Importe a planilha de produtos com CÓD. BARRAS."}
              </p>
              <div className="mt-3">
                <input
                  ref={barcodesFileRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={onBarcodesFile}
                  className="hidden"
                />
                <Button
                  variant={barcodesTotal > 0 ? "outline" : "default"}
                  size="sm"
                  onClick={() => barcodesFileRef.current?.click()}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  {barcodesTotal > 0 ? "Substituir base" : "Carregar base"}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Planilha de contagem</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {contagemAtual
                  ? `${itens.length} itens carregados · Arquivo: ${contagemAtual.nomeArquivo}.`
                  : "Nenhuma contagem carregada. Importe a planilha CONTAGEM DE ESTOQUE."}
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  ref={contagemFileRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={onContagemFile}
                  className="hidden"
                />
                <Button size="sm" onClick={() => contagemFileRef.current?.click()}>
                  <Upload className="mr-1 h-4 w-4" />
                  {contagemAtual ? "Substituir contagem" : "Carregar contagem"}
                </Button>
                {contagemAtual && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <RotateCcw className="mr-1 h-4 w-4" /> Cancelar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar contagem?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Todo o progresso desta contagem será descartado sem envio à Zona
                          Segura.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={cancelarContagem}>
                          Descartar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {contagemAtual && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[240px]">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Bipar código de barras ou digitar código do item
                </label>
                <Input
                  ref={scanInputRef}
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => {
                    registrarKey(e);
                    if (e.key === "Enter") {
                      e.preventDefault();
                      // Lê direto do input: o leitor bipa tão rápido que o
                      // Enter chega antes do React atualizar o state `scan`.
                      const val = (e.currentTarget as HTMLInputElement).value;
                      commitScan(val);
                    }
                  }}
                  placeholder="Bipe agora…"
                  autoFocus
                  className="h-11 text-base"
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    type="button"
                    size="default"
                    onClick={() => commitScan()}
                    disabled={!scan.trim()}
                    title="Confirmar (equivale ao Enter)"
                  >
                    Bipar
                  </Button>
                  {scan.trim() && preview ? (
                    preview.encontrado ? (
                      <span className="text-sm font-medium text-success">
                        <span className="font-mono">{preview.codigo}</span> —{" "}
                        {preview.descricao || "sem descrição"}
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-critical">
                        NÃO ENCONTRADO
                      </span>
                    )
                  ) : ultimo ? (
                    <span className="text-sm font-medium text-success">
                      <span className="font-mono">{ultimo.codigo}</span> —{" "}
                      {ultimo.descricao || "sem descrição"}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Bipe ou digite o código do item e pressione Enter/Bipar.
                    </span>
                  )}
                </div>
                {ultimo && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Último:{" "}
                    <span className="font-mono font-semibold">{ultimo.codigo}</span>{" "}
                    <span
                      className={cn(
                        "ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        ultimo.modo === "bip"
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {ultimo.modo === "bip" ? "bipado" : "digitado"}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Bipados</div>
                  <div className="text-lg font-semibold text-success">
                    {bipados} / {itens.length}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Divergentes</div>
                  <div className="text-lg font-semibold text-critical">{divergentes}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Faltam</div>
                  <div className="text-lg font-semibold">{itens.length - bipados}</div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={bipados === 0}>
                      <CheckCircle2 className="mr-1 h-4 w-4" /> Finalizar contagem
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Finalizar contagem?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Os {bipados} itens bipados serão enviados para a Zona Segura como{" "}
                        <strong>Correto</strong> ou <strong>Divergente</strong> conforme
                        conferência com o saldo. Um PDF com os {itens.length - bipados} itens
                        não bipados será baixado e a contagem atual será apagada. Deseja
                        continuar?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction onClick={doFinalizar}>
                        Finalizar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </Card>

          <Card className="p-0">
            <div className="mobile-table-wrap max-h-[60vh] overflow-y-auto">
              <table className="mobile-table w-full text-sm">
                <thead className="sticky top-0 bg-muted/70 text-muted-foreground">
                  <tr>
                    {[
                      "Código",
                      "Descrição",
                      "Endereço",
                      "Qtd. contada",
                      "Qtd. consta",
                      "Ações",
                    ].map((h) => (
                      <th key={h} className="px-2 py-2 text-center font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it) => {
                    const divergente = it.bipado && it.contado !== it.saldo;
                    return (
                      <tr
                        key={it.codigo}
                        className={cn(
                          "border-t border-border text-center",
                          it.bipado && !divergente && "bg-success/15",
                          divergente && "bg-critical/15",
                        )}
                      >
                        <td data-label="Código" className="px-2 py-1.5 font-mono">{it.codigo}</td>
                        <td data-label="Descrição" className="px-2 py-1.5 max-w-[320px] truncate text-left">
                          {it.descricao || "—"}
                        </td>
                        <td data-label="Endereço" className="px-2 py-1.5 font-mono">{it.endereco || "—"}</td>
                        <td data-label="Qtd. contada" className="px-2 py-1.5">
                          <input
                            type="number"
                            value={it.contado}
                            min={0}
                            onChange={(e) =>
                              setContagemContado(it.codigo, Number(e.target.value) || 0)
                            }
                            className={cn(
                              "w-20 rounded border border-border bg-background px-2 py-1 text-center font-mono",
                              it.bipado && "font-semibold",
                            )}
                          />
                        </td>
                        <td data-label="Qtd. consta" className="px-2 py-1.5 font-mono">{it.saldo}</td>
                        <td data-label="Ações" className="px-2 py-1.5">
                          <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-center sm:gap-3">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-11 w-12"
                              onClick={() => atualizarContagemItem(it.codigo, 1)}
                              title="Adicionar 1"
                            >
                              <Plus className="h-5 w-5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-11 w-12"
                              onClick={() => atualizarContagemItem(it.codigo, -1)}
                              disabled={it.contado <= 0}
                              title="Reduzir 1"
                            >
                              <Minus className="h-5 w-5" />
                            </Button>
                            {it.bipado && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => removerContagemItem(it.codigo)}
                                title="Limpar contagem"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => marcarContagemZerado(it.codigo)}
                              title="Marcar como conferido, mas zerado"
                            >
                              <Ban className="mr-1 h-3 w-3" /> Zerado
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {itens.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-2 py-8 text-center text-muted-foreground"
                      >
                        Nenhum item na contagem atual.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {contagemAtual.atualizadoEm && (
            <p className="text-center text-xs text-muted-foreground">
              Atualizado em {fmtDateBR(contagemAtual.atualizadoEm.slice(0, 10))} ·{" "}
              {contagemAtual.atualizadoEm.slice(11, 16)}
            </p>
          )}
        </>
      )}
    </div>
  );
}