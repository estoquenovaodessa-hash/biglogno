import { RotateCcw } from "lucide-react";

/** Área inicial reservada à Logística Reversa do gestor.
 * Nenhuma rotina de movimentação é habilitada antes da definição do fluxo. */
export function LogisticaReversa() {
  return (
    <section className="mx-auto max-w-[1600px] space-y-4" aria-label="Logística Reversa">
      <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-[#10396a] via-[#0c294b] to-[#091d36] p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-300/40 bg-sky-400/15 text-sky-200">
            <RotateCcw className="h-8 w-8" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Logística Reversa</h2>
            <p className="mt-1 text-sm text-sky-100/80">
              Área de gestão de retornos, disponível para configuração das próximas etapas.
            </p>
          </div>
        </div>
        <div className="mt-6 rounded-xl border border-dashed border-sky-300/30 bg-[#12385d]/50 px-5 py-7 text-center">
          <p className="text-base font-bold text-sky-100">Módulo preparado</p>
          <p className="mt-2 text-sm text-sky-100/70">
            As operações e os controles de logística reversa serão adicionados conforme as regras do setor.
          </p>
        </div>
      </div>
    </section>
  );
}
