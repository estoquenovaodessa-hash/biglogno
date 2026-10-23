import { useEffect, useMemo, useState } from "react";
import { Download, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { downloadCSV } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const KEY = "monitor-abc-enderecamento";

export function Enderecamento() {
  const { items } = useStore();
  const [enderecos, setEnderecos] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");

  useEffect(() => {
    try {
      setEnderecos(JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch {
      /* ignore */
    }
  }, []);

  const salvar = (codigo: string, valor: string) => {
    setEnderecos((prev) => {
      const next = { ...prev, [codigo]: valor.toUpperCase() };
      if (!next[codigo].trim()) delete next[codigo];
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  const semEndereco = useMemo(
    () => items.filter((i) => !(i.endereco && String(i.endereco).trim())),
    [items],
  );

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const map = new Map<string, typeof semEndereco>();
    for (const i of semEndereco) {
      const hay = `${i.codigo} ${i.descricao} ${i.linha ?? ""} ${i.grupo ?? ""}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      const k = i.linha?.trim() || "Sem linha";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [semEndereco, busca]);

  const enderecados = semEndereco.filter((i) => enderecos[i.codigo]?.trim());

  const exportar = () => {
    if (!enderecados.length) return toast.error("Nenhum item endereçado para exportar");
    // Coluna A = código; coluna CI (índice 86) = endereço
    const rows = enderecados.map((i) => {
      const r = new Array<string>(87).fill("");
      r[0] = i.codigo;
      r[86] = enderecos[i.codigo].trim().toUpperCase();
      return r;
    });
    downloadCSV("enderecamento.csv", rows);
    toast.success(`${rows.length} itens endereçados exportados`);
  };

  return (
    <Tabs defaultValue="enderecar" className="space-y-4">
      <TabsList>
        <TabsTrigger value="enderecar">Endereçar ({semEndereco.length})</TabsTrigger>
        <TabsTrigger value="exportar">Exportar CSV ({enderecados.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="enderecar" className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full pl-9"
            placeholder="Buscar código, descrição ou linha"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {grupos.length === 0 && (
          <p className="py-10 text-center text-muted-foreground">Nenhum item sem endereço.</p>
        )}
        {grupos.map(([nome, lista]) => (
          <details key={nome} open className="rounded-lg border bg-card">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold">
              <MapPin className="h-4 w-4 text-primary" />
              {nome}
              <span className="ml-auto text-xs text-muted-foreground">{lista.length} itens</span>
            </summary>
            <div className="mobile-table-wrap">
              <table className="mobile-table w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-center">Código</th>
                    <th className="px-3 py-2 text-center">Descrição</th>
                    <th className="px-3 py-2 text-center">Endereço</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((i) => (
                    <tr key={i.codigo} className="border-t">
                      <td data-label="Código" className="px-3 py-2 text-center font-mono">{i.codigo}</td>
                      <td data-label="Descrição" className="px-3 py-2 text-center">{i.descricao}</td>
                      <td data-label="Endereço" className="px-3 py-2">
                        <Input
                          className="uppercase"
                          placeholder="Digite o endereço"
                          value={enderecos[i.codigo] ?? ""}
                          onChange={(e) => salvar(i.codigo, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </TabsContent>

      <TabsContent value="exportar" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            CSV com o código na coluna A e o endereço (em maiúsculas) na coluna CI.
          </p>
          <Button onClick={exportar} className="gap-2">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>
        <div className="mobile-table-wrap rounded-lg border">
          <table className="mobile-table w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-center">Código</th>
                <th className="px-3 py-2 text-center">Endereço</th>
              </tr>
            </thead>
            <tbody>
              {enderecados.map((i) => (
                <tr key={i.codigo} className="border-t">
                  <td data-label="Código" className="px-3 py-2 text-center font-mono">{i.codigo}</td>
                  <td data-label="Endereço" className="px-3 py-2 text-center font-semibold">
                    {enderecos[i.codigo].toUpperCase()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>
    </Tabs>
  );
}
