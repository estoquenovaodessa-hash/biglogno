import { useState } from "react";
import { CalendarDays, Sun, Sunset, Clock3, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shiftLabel, scheduledDateLabel, type ExpeditionShift, type ShiftSection } from "@/lib/expedition-schedule";

export function ExpeditionShiftPicker({ ids, shift, readOnly, disabled, onSetShift, placement = "section" }: {
  ids: string[];
  shift: ShiftSection;
  readOnly: boolean;
  disabled: boolean;
  onSetShift: (ids: string[], shift: ExpeditionShift | null) => Promise<void>;
  /** Topo dos cards na Expedição; a edição existente mantém o layout anterior. */
  placement?: "section" | "top";
}) {
  return <div className={placement === "top"
    ? "mb-3 space-y-2 border-b border-border/60 pb-3"
    : "mt-3 space-y-2 border-t border-border/60 pt-3"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5" /> Turno programado
      </span>
      <span className={`rounded-full border px-2 py-1 text-[11px] font-extrabold ${shift === "indefinido"
        ? "border-border bg-muted/50 text-muted-foreground"
        : "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200"}`}>{shiftLabel(shift)}</span>
    </div>
    {!readOnly && <div className="grid grid-cols-2 gap-2">
      {(["manha", "tarde"] as const).map(value => <Button type="button" key={value} size="sm"
        variant={shift === value ? "default" : "outline"} className="h-9 gap-1.5 px-2 text-xs font-bold"
        disabled={disabled} aria-pressed={shift === value}
        title={shift === value ? "Desmarcar turno (ficará indefinido)" : "Programar para " + shiftLabel(value)}
        onClick={() => { void onSetShift(ids, shift === value ? null : value); }}>
        {value === "manha" ? <Sun className="h-4 w-4" /> : <Sunset className="h-4 w-4" />}
        {shiftLabel(value)}
      </Button>)}
    </div>}
  </div>;
}

export function ExpeditionCollectionDate({ date, readOnly, disabled, onSave }: {
  date?: string;
  readOnly: boolean;
  disabled: boolean;
  onSave: (date: string | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(date ?? "");
  return <div className="space-y-2">
    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <CalendarDays className="h-3.5 w-3.5" /> Data específica: <strong className="text-foreground">{date ? scheduledDateLabel(date) : "Não definida"}</strong>
    </p>
    {!readOnly && <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-[11px] font-semibold text-muted-foreground">Alterar data
        <input type="date" value={draft} onChange={event => setDraft(event.target.value)}
          disabled={disabled}
          className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" />
      </label>
      <Button size="sm" variant="outline" className="h-9 gap-1"
        disabled={disabled || draft === (date ?? "")}
        onClick={() => { void onSave(draft || null); }}>
        <Save className="h-3.5 w-3.5" /> Salvar
      </Button>
    </div>}
  </div>;
}
