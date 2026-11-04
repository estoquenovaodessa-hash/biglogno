import {useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {Building2,Edit3,Plus,Save,Search} from "lucide-react";
import {toast} from "sonner";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {reverseNormalizeSearch,reverseSupplierDetailsSchema,type ReverseSupplier} from "@/lib/reverse-logistics";
import {saveReverseSupplier} from "@/lib/reverse-logistics.functions";

const field="border-sky-400/35 bg-[#061a31] text-white";
export function ReverseSupplierRegistry({open,onClose,suppliers,onSaved}:{
  open:boolean;onClose:()=>void;suppliers:ReverseSupplier[];onSaved:()=>Promise<void>;
}){
  const save=useServerFn(saveReverseSupplier);
  const [edited,setEdited]=useState<ReverseSupplier|null>(null);
  const [name,setName]=useState(""),[brandsText,setBrandsText]=useState("");
  const [contactName,setContactName]=useState(""),[phone,setPhone]=useState("");
  const [email,setEmail]=useState(""),[cnpj,setCnpj]=useState("");
  const [search,setSearch]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const brands=brandsText.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
  function reset(){
    setEdited(null);setName("");setBrandsText("");setContactName("");
    setPhone("");setEmail("");setCnpj("");setError("");
  }
  function edit(s:ReverseSupplier){
    setEdited(s);setName(s.name);setBrandsText(s.brands.join(", "));
    setContactName(s.contactName);setPhone(s.phone);setEmail(s.email);setCnpj(s.cnpj);
    setError("");
  }
  async function submit(){
    if(busy)return;
    const parsed=reverseSupplierDetailsSchema.safeParse({name,brands,contactName,phone,email,cnpj});
    if(!parsed.success){setError(parsed.error.issues[0]?.message??"Verifique os dados.");return;}
    setBusy(true);setError("");
    try{
      await save({data:{...parsed.data,...(edited?{id:edited.id,version:edited.version}:{})}});
      await onSaved();toast.success(edited?"Fornecedor atualizado.":"Fornecedor cadastrado.");
      reset();
    }catch(e){const message=e instanceof Error?e.message:"Não foi possível salvar o fornecedor.";setError(message);toast.error(message);}
    finally{setBusy(false);}
  }
  return <Dialog open={open} onOpenChange={o=>{if(!o&&!busy){onClose();reset();}}}>
    <DialogContent className="flex max-h-[91dvh] w-[calc(100%-1rem)] max-w-3xl flex-col overflow-hidden border-sky-400/45 bg-[#0a2749] text-white">
      <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl"><Building2 className="text-sky-300"/> Cadastro de fornecedores</DialogTitle>
        <DialogDescription className="text-sky-200">Cadastre o fornecedor e as marcas comercializadas por ele. Os dados ficam disponíveis para todos os operadores da Logística Reversa.</DialogDescription></DialogHeader>
      <div className="grid min-h-0 gap-4 overflow-y-auto md:grid-cols-2">
        <div className="space-y-2">
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-sky-300"/>
            <Input className={field+" pl-10"} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar fornecedor ou marca..."/></div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-sky-500/30 p-2 md:max-h-[380px]">
            {suppliers.filter(s=>reverseNormalizeSearch(s.name+" "+s.brands.join(" ")).includes(reverseNormalizeSearch(search)))
              .map(s=><button type="button" key={s.id} disabled={busy} onClick={()=>edit(s)}
                className={"flex w-full items-center justify-between gap-2 rounded-lg p-3 text-left hover:bg-sky-500/20 "+(edited?.id===s.id?"bg-sky-500/25":"bg-[#123857]/50")}>
                <span><strong className="block text-sm">{s.name}</strong><small className="block text-xs text-sky-200">{s.brands.join(" · ")}</small></span><Edit3 size={16}/></button>)}
            {!suppliers.length&&<p className="p-4 text-sm text-sky-200">Nenhum fornecedor cadastrado. Preencha o formulário ao lado.</p>}
          </div>
          <Button variant="outline" className="w-full border-sky-400/40 bg-[#143d65] text-white" disabled={busy}
            onClick={reset}><Plus className="mr-2 h-4 w-4"/> Novo fornecedor</Button>
        </div>
        <form className="space-y-3" onSubmit={e=>{e.preventDefault();void submit();}}>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-300">{edited?"Editar fornecedor":"Novo fornecedor"}</p>
          <label className="block space-y-1 text-sm font-semibold">Nome do fornecedor *
            <Input value={name} onChange={e=>setName(e.target.value)} className={field} maxLength={180} placeholder="Ex.: CCL"/></label>
          <label className="block space-y-1 text-sm font-semibold">Marcas comercializadas *
            <textarea value={brandsText} onChange={e=>setBrandsText(e.target.value)} rows={3}
              className="w-full resize-y rounded-md border border-sky-400/35 bg-[#061a31] p-3 text-sm text-white"
              placeholder="ADELBRAS, TEKBOND, ..." aria-label="Marcas, separadas por vírgula ou linha"/>
            <small className="block text-xs font-normal text-sky-200">Separe as marcas por vírgula, ponto e vírgula ou linha.</small>
          </label>
          <label className="block space-y-1 text-sm font-semibold">Nome do contato
            <Input value={contactName} onChange={e=>setContactName(e.target.value)} className={field} maxLength={120} placeholder="Ex.: Departamento de garantia"/></label>
          <label className="block space-y-1 text-sm font-semibold">Celular / WhatsApp
            <Input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} className={field} maxLength={30} placeholder="Ex.: (19) 99999-9999"/></label>
          <label className="block space-y-1 text-sm font-semibold">E-mail
            <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} className={field} placeholder="garantia@fornecedor.com"/></label>
          <label className="block space-y-1 text-sm font-semibold">CNPJ (opcional)
            <Input value={cnpj} onChange={e=>setCnpj(e.target.value)} className={field} maxLength={24} placeholder="00.000.000/0000-00"/></label>
          {error&&<p role="alert" className="text-sm font-semibold text-rose-300">{error}</p>}
          <Button type="submit" disabled={busy||!name.trim()||!brands.length} className="w-full bg-sky-600 text-white hover:bg-sky-500">
            <Save className="mr-2 h-4 w-4"/> {busy?"Salvando...":edited?"Salvar alterações":"Cadastrar fornecedor"}</Button>
        </form>
      </div>
      <DialogFooter><Button variant="outline" className="border-sky-400/35 bg-[#153759] text-white" disabled={busy}
        onClick={()=>{onClose();reset();}}>Fechar cadastro</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
