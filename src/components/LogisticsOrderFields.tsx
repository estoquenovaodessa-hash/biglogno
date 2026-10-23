import { Input } from '@/components/ui/input';
import { canonicalCode, formatMoneyInput, type SalesClient } from '@/lib/sales-verification';

export function LogisticsOrderFields({ clients, code, setCode, document, setDocument, value, setValue, onlyCompany = false }: { clients: SalesClient[]; code: string; setCode: (s: string) => void; document: string; setDocument: (s: string) => void; value: string; setValue: (s: string) => void; onlyCompany?: boolean }) {
  const company = clients.find(c => canonicalCode(c.code) === canonicalCode(code));
  return <div className="space-y-4">
    <label className="block space-y-2 font-semibold">Código da empresa<Input aria-label="Código da empresa" inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} maxLength={12} className="h-12 text-xl font-bold md:text-xl" /></label>
    <p role="status" className={`break-words text-lg font-bold ${company ? 'text-success' : 'text-muted-foreground'}`}>{company?.name ?? (code ? 'Empresa não encontrada' : '—')}</p>
    {!onlyCompany && <><label className="block space-y-2 font-semibold">Nº do documento<Input aria-label="Nº do documento" inputMode="numeric" value={document} onChange={e => setDocument(e.target.value.replace(/\D/g, ''))} maxLength={20} className="h-12 text-xl font-bold md:text-xl" /></label>
    <label className="block space-y-2 font-semibold">Valor (R$)<Input aria-label="Valor (R$)" inputMode="decimal" value={value} onChange={e => setValue(e.target.value.replace(/[^\d.,]/g, ''))} onBlur={() => value.trim() && setValue(formatMoneyInput(value))} className="h-12 text-xl font-bold md:text-xl" /></label></>}
  </div>;
}
