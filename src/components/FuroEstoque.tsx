import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const FURO_URL = "https://diver-flow.lovable.app";
const FURO_ORIGIN = "https://diver-flow.lovable.app";

export function FuroEstoque() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const recarregar = () => setReloadKey((k) => k + 1);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <AlertTriangle className="h-5 w-5 text-critical" />
        <div className="flex-1">
          <h2 className="font-semibold">Furo de Estoque</h2>
          <p className="text-sm text-muted-foreground">
            Painel de furos de estoque integrado. Apenas este painel é atualizado — o restante
            do sistema permanece intacto. Você será notificado no canto inferior quando chegar
            uma nova informação de furo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={recarregar}>
            <RefreshCw className="mr-1 h-4 w-4" /> Atualizar painel
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={FURO_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" /> Abrir em nova aba
            </a>
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={FURO_URL}
          title="Furo de Estoque"
          className="h-[calc(100vh-260px)] min-h-[520px] w-full border-0"
        />
      </Card>
    </div>
  );
}

// Fonte de dados do painel de furos (mesma base do link diver-flow.lovable.app).
// A chave é publishable (pública) — leitura somente das ocorrências.
const FURO_API = "https://ddcpxpwtucuhexbjnjtv.supabase.co/rest/v1/divergencias";
const FURO_KEY = "sb_publishable_bFzsfWDFxbwIiTuJ-yH6mQ_1M_szBkU";
const SEEN_KEY = "furo_last_seen";
const POLL_MS = 30_000;

interface Divergencia {
  id: string;
  codigo_produto: string | null;
  status: string | null;
  data_hora_criacao: string;
  observacoes: string | null;
  descricao: string | null;
  localizacao: string | null;
}

// Listener global de notificações de furo de estoque. Fica montado o tempo todo
// (independente da aba ativa). Faz polling apenas do link informado (não recarrega
// o painel inteiro) e mostra um toast no canto inferior quando surge uma nova
// ocorrência de furo registrada no painel de Ocorrências.
export function FuroEstoqueNotifier() {
  // Fallback: mensagens diretas via postMessage do painel embutido.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== FURO_ORIGIN) return;
      const data = e.data;
      let titulo = "Novo furo de estoque";
      let descricao: string | undefined;
      if (typeof data === "string") {
        descricao = data;
      } else if (data && typeof data === "object") {
        titulo = data.titulo || data.title || titulo;
        descricao =
          data.descricao || data.message || data.mensagem || data.codigo
            ? `${data.codigo ? `Código ${data.codigo} · ` : ""}${
                data.descricao || data.message || data.mensagem || ""
              }`.trim()
            : undefined;
      }
      toast.warning(titulo, {
        description: descricao,
        position: "bottom-right",
        duration: 8000,
        icon: <AlertTriangle className="h-4 w-4 text-critical" />,
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Polling da base de ocorrências: notifica novos furos assim que aparecerem.
  useEffect(() => {
    let ativo = true;

    const buscar = async () => {
      try {
        const url = `${FURO_API}?select=id,codigo_produto,status,data_hora_criacao,observacoes,descricao,localizacao&order=data_hora_criacao.desc&limit=20`;
        const res = await fetch(url, {
          headers: { apikey: FURO_KEY, Authorization: `Bearer ${FURO_KEY}` },
        });
        if (!res.ok || !ativo) return;
        const rows = (await res.json()) as Divergencia[];
        if (!rows.length) return;

        const lastSeen = localStorage.getItem(SEEN_KEY);
        const maisRecente = rows[0].data_hora_criacao;

        // Primeira carga: apenas registra a baseline, sem notificar o histórico.
        if (!lastSeen) {
          localStorage.setItem(SEEN_KEY, maisRecente);
          return;
        }

        const novos = rows
          .filter((r) => r.data_hora_criacao > lastSeen)
          .reverse();
        for (const n of novos) {
          const detalhe = [
            n.codigo_produto ? `Código ${n.codigo_produto}` : null,
            n.localizacao,
            n.observacoes || n.descricao,
          ]
            .filter(Boolean)
            .join(" · ");
          toast.warning("Novo furo de estoque registrado", {
            description: detalhe || "Verifique o painel de Ocorrências.",
            position: "bottom-right",
            duration: 10000,
            icon: <AlertTriangle className="h-4 w-4 text-critical" />,
          });
        }
        if (novos.length) localStorage.setItem(SEEN_KEY, maisRecente);
      } catch {
        // silencioso — tenta de novo no próximo ciclo
      }
    };

    buscar();
    const id = setInterval(buscar, POLL_MS);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, []);

  return null;
}

