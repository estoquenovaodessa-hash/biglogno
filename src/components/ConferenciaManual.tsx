import { useRef, useState } from "react";
import Papa from "papaparse";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Plus, CheckCircle2, Check, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { readFileSmart, parseBRNumber } from "@/lib/csv";
import { cn } from "@/lib/utils";

type Motivo = "Correto" | "Divergente";

interface Pendente {
  codigo: string;
  observacao?: string;
  motivo: Motivo;
}

// Lê a planilha modelo de contagem por ciclo:
// Código; Descrição; Saldo sistema; Contagem; ...
// Saldo sistema (coluna C) == Contagem (coluna D) -> Correto, senão Divergente.
function padCodigo(c: string): string {
  return /^\d{1,4}$/.test(c) ? c.padStart(5, "0") : c;
}

function parseModeloContagem(text: string): Pendente[] {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    delimiter: ";",
    skipEmptyLines: true,
  });
  const out: Pendente[] = [];
  for (const [idx, row] of parsed.data.entries()) {
    if (!row || row.length === 0) continue;
    const raw = (row[0] ?? "").toString().trim().replace(/^"|"$/g, "");
    if (!raw) continue;
    if (idx === 0 && /c[oó]digo/i.test(raw)) continue;
    const codigo = padCodigo(raw);
    const saldo = parseBRNumber(row[2]);
    const contagem = parseBRNumber(row[3]);
    const motivo: Motivo = saldo === contagem ? "Correto" : "Divergente";
    out.push({
      codigo,
      observacao: `Sistema ${saldo} × Contagem ${contagem}`,
      motivo,
    });
  }
  return out;
}


// Seletor de motivo (Correto / Divergente).
function MotivoToggle({
  value,
  onChange,
  size = "default",
}: {
  value: Motivo;
  onChange: (m: Motivo) => void;
  size?: "default" | "sm";
}) {
  const base =
    size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      <button
        type="button"
        onClick={() => onChange("Correto")}
        className={cn(
          base,
          "flex items-center gap-1 font-medium transition-colors",
          value === "Correto"
            ? "bg-success text-success-foreground"
            : "bg-transparent text-muted-foreground hover:bg-accent",
        )}
      >
        <Check className="h-3.5 w-3.5" /> Correto
      </button>
      <button
        type="button"
        onClick={() => onChange("Divergente")}
        className={cn(
          base,
          "flex items-center gap-1 font-medium transition-colors",
          value === "Divergente"
            ? "bg-critical text-critical-foreground"
            : "bg-transparent text-muted-foreground hover:bg-accent",
        )}
      >
        <X className="h-3.5 w-3.5" /> Divergente
      </button>
    </div>
  );
}

export function ConferenciaManual() {
  const { adicionarConferidos } = useStore();
  const [codigo, setCodigo] = useState("");
  const [obs, setObs] = useState("");
  const [motivo, setMotivo] = useState<Motivo>("Correto");
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const addUm = () => {
    const c = padCodigo(codigo.trim());
    if (!c) {
      toast.error("Informe o código do item.");
      return;
    }
    const r = adicionarConferidos([
      { codigo: c, observacao: obs.trim() || undefined, motivo },
    ]);
    toast.success(
      `Item ${c} (${motivo}) ${r.adicionados > 0 ? "adicionado" : "atualizado"} na Zona Segura.`,
    );
    setCodigo("");
    setObs("");
    // Mantém o motivo selecionado (ex.: Divergente) até o usuário trocar.
  };

  const carregarLista = (entradas: Pendente[]) => {
    if (entradas.length === 0) {
      toast.error("Nenhum código encontrado na planilha.");
      return;
    }
    // Mescla com a lista já em edição, sem duplicar códigos.
    setPendentes((prev) => {
      const map = new Map(prev.map((p) => [p.codigo, p]));
      for (const e of entradas) if (!map.has(e.codigo)) map.set(e.codigo, e);
      return Array.from(map.values());
    });
    const corretos = entradas.filter((e) => e.motivo === "Correto").length;
    const divergentes = entradas.length - corretos;
    toast.success(`${entradas.length} itens importados`, {
      description: `${corretos} corretos · ${divergentes} divergentes`,
      position: "top-left",
    });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileSmart(file);
    carregarLista(parseModeloContagem(text));
    if (fileRef.current) fileRef.current.value = "";
  };


  const setMotivoAll = (m: Motivo) =>
    setPendentes((prev) => prev.map((p) => ({ ...p, motivo: m })));

  const setMotivoOne = (codigo: string, m: Motivo) =>
    setPendentes((prev) => prev.map((p) => (p.codigo === codigo ? { ...p, motivo: m } : p)));

  const removeOne = (codigo: string) =>
    setPendentes((prev) => prev.filter((p) => p.codigo !== codigo));

  const confirmarLista = () => {
    if (pendentes.length === 0) return;
    const r = adicionarConferidos(pendentes);
    toast.success(
      `${r.adicionados} adicionados, ${r.atualizados} atualizados na Zona Segura.`,
    );
    setPendentes([]);
  };

  const divergentes = pendentes.filter((p) => p.motivo === "Divergente").length;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
          <div>
            <h2 className="font-semibold">Incluir itens conferidos</h2>
            <p className="text-sm text-muted-foreground">
              Marque itens já conferidos diretamente na Zona Segura. Cada item recebe um
              motivo (Correto / Divergente) que alimenta o índice de acuracidade. Em listas
              e CSV, todos entram como <strong>Correto</strong> — basta alterar os que forem
              Divergente antes de confirmar.
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="text-sm font-semibold">Adicionar um item</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs text-muted-foreground">Código</label>
            <Input
              placeholder="Ex: 12345"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addUm()}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs text-muted-foreground">Observação (opcional)</label>
            <Input placeholder="Conferência manual" value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Motivo</label>
            <MotivoToggle value={motivo} onChange={setMotivo} />
          </div>
          <Button onClick={addUm}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="text-sm font-semibold">Importar planilha de contagem (CSV modelo)</h3>
        <p className="text-xs text-muted-foreground">
          Formato: <code>Código;Descrição;Saldo sistema;Contagem;…</code>. Quando o{" "}
          <strong>Saldo sistema</strong> for igual à <strong>Contagem</strong>, o item entra como{" "}
          <strong>Correto</strong>; se for diferente, entra como <strong>Divergente</strong>.
        </p>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={onFile} className="hidden" />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> Selecionar CSV
          </Button>
        </div>
      </Card>


      {pendentes.length > 0 && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Revisar {pendentes.length} itens · {pendentes.length - divergentes} corretos ·{" "}
              {divergentes} divergentes
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Marcar todos:</span>
              <MotivoToggle value="Correto" onChange={setMotivoAll} size="sm" />
            </div>
          </div>
          <div className="mobile-table-wrap max-h-80 overflow-y-auto rounded-lg border border-border">
            <table className="mobile-table w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                <tr>
                  {["Código", "Observação", "Motivo", ""].map((h) => (
                    <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendentes.map((p) => (
                  <tr
                    key={p.codigo}
                    className={cn(
                      "border-t border-border",
                      p.motivo === "Divergente" && "bg-critical/10",
                    )}
                  >
                    <td data-label="Código" className="px-2 py-1.5 font-mono">{p.codigo}</td>
                    <td data-label="Observação" className="px-2 py-1.5 max-w-[220px] truncate text-muted-foreground">
                      {p.observacao || "—"}
                    </td>
                    <td data-label="Motivo" className="px-2 py-1.5">
                      <MotivoToggle
                        value={p.motivo}
                        onChange={(m) => setMotivoOne(p.codigo, m)}
                        size="sm"
                      />
                    </td>
                    <td data-label="Remover" className="px-2 py-1.5">
                      <Button variant="ghost" size="icon" onClick={() => removeOne(p.codigo)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button onClick={confirmarLista}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Confirmar {pendentes.length} na Zona Segura
            </Button>
            <Button variant="outline" onClick={() => setPendentes([])}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
