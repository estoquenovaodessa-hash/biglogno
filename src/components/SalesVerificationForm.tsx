import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ClipboardCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canonicalCode, formatMoneyInput, parseMoneyInput, ERROR_REASONS, SELLERS, verificationSchema, type ErrorReason, type SalesClient } from "@/lib/sales-verification";
import { registerSalesVerification } from "@/lib/sales-verification.functions";
import { useActiveEmployee } from "./EmployeeGate";

export function SalesVerificationForm({ clients, prefix, lastClientCode, lastVerifierCode, onRegistered }: { clients: SalesClient[]; prefix: string; lastClientCode: string; lastVerifierCode: string; onRegistered: () => void }) {
  const { employee } = useActiveEmployee();
  const [document, setDocument] = useState(prefix);
  const [items, setItems] = useState("");
  const [clientCode, setClientCode] = useState(lastClientCode);
  const [verifierCode, setVerifierCode] = useState(lastVerifierCode === "102" ? "102" : "101");
  const [value, setValue] = useState("");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [errorReasons, setErrorReasons] = useState<ErrorReason[]>([]);
  const [seller, setSeller] = useState("");
  const [forDelivery, setForDelivery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const started = useRef(Date.now());
  const requestId = useRef<string | null>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const register = useServerFn(registerSalesVerification);
  const client = clients.find(c => canonicalCode(c.code) === canonicalCode(clientCode));
  const verifier = { code: verifierCode, expedition: verifierCode === "102", name: employee?.name ?? "" };
  return <section className="mx-auto w-full max-w-md py-2">
    <div className="mb-3 flex items-center gap-3"><ClipboardCheck className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold">Conferência</h1></div>
    <form className="sales-entry-form space-y-3 rounded-lg border border-border border-t-4 border-t-primary bg-card p-3 text-lg shadow-brand sm:p-4" onKeyDown={e => {
      if (e.key !== "Enter") return;
      const t = e.target as HTMLElement;
      if (t instanceof HTMLButtonElement && t.type === "submit") return;
      e.preventDefault();
      if (t instanceof HTMLButtonElement) t.click();
      const form = e.currentTarget;
      setTimeout(() => {
        const els = [...form.querySelectorAll<HTMLElement>("input, button:not([disabled])")];
        const i = els.indexOf(t);
        els[i + 1]?.focus();
      }, 0);
    }} onSubmit={async e => {
      e.preventDefault(); if (busy) return; setError(""); setMessage("");
      const numericValue = parseMoneyInput(value);
      const parsed = verificationSchema.safeParse({ requestId: requestId.current ?? crypto.randomUUID(), document, items: Number(items), clientCode, verifierCode, value: numericValue, correct, errorReasons: correct === false ? errorReasons : [], seller: verifier?.expedition ? "EXPEDIÇÃO" : seller, forDelivery: verifier?.expedition ? forDelivery : false, durationSeconds: Math.min(86400, Math.floor((Date.now() - started.current) / 1000)) });
      if (!parsed.success || !value.trim()) { setError(parsed.success ? "Informe o valor." : parsed.error.issues[0]?.message ?? "Confira os campos."); return; }
      if (!client || !employee) { setError(!client ? "Cliente não encontrado na base." : "Selecione o perfil do funcionário."); return; }
      requestId.current = parsed.data.requestId; setBusy(true);
      try {
        const result = await register({ data: parsed.data });
        setDocument(result.prefix); setItems(""); setClientCode(parsed.data.clientCode); setVerifierCode(parsed.data.verifierCode); setValue(""); setCorrect(null); setErrorReasons([]); setSeller(""); setForDelivery(false);
        setMessage(`Documento ${document} registrado com sucesso.`); requestId.current = null; started.current = Date.now(); onRegistered(); documentInput.current?.focus();
      } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível registrar."); }
      finally { setBusy(false); }
    }}>
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
        <Field label="Nº do documento" id="sales-document"><Input ref={documentInput} id="sales-document" inputMode="numeric" required pattern="[0-9]{4,20}" maxLength={20} value={document} onChange={e => { setDocument(e.target.value.replace(/\D/g, "")); requestId.current = null; }} className="h-11 text-xl font-semibold md:text-xl" /></Field>
        <Field label="Qtd. itens" id="sales-items"><Input id="sales-items" type="number" required min={1} max={100000} value={items} onChange={e => { setItems(e.target.value); requestId.current = null; }} className="h-11 text-xl font-semibold md:text-xl" /></Field>
      </div>
      <Field label="Código do cliente" id="sales-client"><Input id="sales-client" inputMode="numeric" required maxLength={12} value={clientCode} onChange={e => { setClientCode(e.target.value.replace(/\D/g, "")); requestId.current = null; }} className="h-11 text-xl font-semibold md:text-xl" /><p className={`mt-1 min-h-6 truncate text-base font-medium ${client ? "text-success" : "text-muted-foreground"}`}>{client?.name ?? (clientCode ? "Cliente não encontrado" : "—")}</p></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <fieldset><legend className="mb-1 text-base font-bold uppercase text-muted-foreground">Setor *</legend><div className="grid grid-cols-2 gap-2">{[{code:"101",name:"Balcão"},{code:"102",name:"Expedição"}].map(v => <Button key={v.code} type="button" variant={verifierCode === v.code ? "default" : "outline"} className="h-11 gap-1 text-sm font-bold" aria-pressed={verifierCode === v.code} onClick={() => { setVerifierCode(v.code); setSeller(""); setForDelivery(false); requestId.current = null; }}>{v.code} · {v.name}</Button>)}</div><p className="mt-1 text-sm font-semibold text-success">Funcionário: {employee?.name ?? "Não selecionado"}</p></fieldset>
        <Field label="Valor (R$)" id="sales-value"><Input id="sales-value" inputMode="decimal" required maxLength={15} placeholder="0,00" value={value} onChange={e => { setValue(e.target.value.replace(/[^\d.,]/g, "")); requestId.current = null; }} onBlur={() => value.trim() && setValue(formatMoneyInput(value))} className="h-11 text-xl font-semibold md:text-xl" /></Field>
      </div>
      <fieldset><legend className="mb-1 text-base font-bold uppercase text-muted-foreground">Situação *</legend><div className="grid grid-cols-2 gap-3">{[true, false].map(option => <Button key={String(option)} type="button" variant={correct === option ? "default" : "outline"} className="h-11 text-lg font-bold" aria-pressed={correct === option} onClick={() => { setCorrect(option); if (option) setErrorReasons([]); requestId.current = null; }}>{correct === option && <Check className="h-4 w-4" />}{option ? "Certo" : "Errado"}</Button>)}</div></fieldset>
      {correct === false && <fieldset><legend className="mb-1 text-base font-bold uppercase text-muted-foreground">Motivos do erro *</legend><div className="grid grid-cols-3 gap-2">{ERROR_REASONS.map(reason => <Button key={reason} type="button" variant={errorReasons.includes(reason) ? "secondary" : "outline"} aria-pressed={errorReasons.includes(reason)} className="h-11 min-w-0 gap-1 px-1 text-sm font-bold sm:px-2 sm:text-base" onClick={() => { setErrorReasons(current => current.includes(reason) ? current.filter(item => item !== reason) : [...current, reason]); requestId.current = null; }}>{errorReasons.includes(reason) && <Check className="h-3 w-3 shrink-0" />}{reason}</Button>)}</div></fieldset>}
      <fieldset><legend className="mb-1 text-base font-bold uppercase text-muted-foreground">Vendedor *</legend><div className={`grid gap-2 ${verifier?.expedition ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4"}`}>{(verifier?.expedition ? ["EXPEDIÇÃO"] : SELLERS).map(name => <Button type="button" key={name} variant={seller === name || verifier?.expedition ? "secondary" : "outline"} aria-pressed={seller === name || verifier?.expedition} onClick={() => { setSeller(name); requestId.current = null; }} className="min-h-10 px-2 text-base font-semibold">{name}</Button>)}</div></fieldset>
      {verifier?.expedition && <Button type="button" variant={forDelivery ? "default" : "outline"} aria-pressed={forDelivery} className="h-11 w-full text-lg font-bold" onClick={() => { setForDelivery(v => !v); requestId.current = null; }}>{forDelivery ? <Check className="h-5 w-5" /> : <Truck className="h-5 w-5" />}Para entrega</Button>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {message && <p role="status" className="text-success">{message}</p>}
      <Button type="submit" disabled={busy || !clients.length || !employee} className="h-12 w-full text-lg font-bold"><ClipboardCheck className="h-5 w-5" />{busy ? "Registrando…" : "Registrar"}</Button>
      {!clients.length && <p className="text-sm text-muted-foreground">Aguardando importação dos clientes pelo gestor.</p>}
    </form>
  </section>;
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className="min-w-0"><label htmlFor={id} className="mb-1 block text-base font-bold uppercase text-muted-foreground">{label} *</label>{children}</div>;
}