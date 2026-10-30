import {useDeferredValue,useMemo,useState} from "react";
import {PackagePlus,Search} from "lucide-react";
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {reverseSearchGroups,type reverseGroups} from "@/lib/reverse-logistics";

const PAGE_SIZE=80;
type Group=ReturnType<typeof reverseGroups>[number];

/** Janela isolada: digitar não causa renderização dos cards ou da contagem
 * abertos na tela principal do operador. */
export function ReverseGroupPicker({groups,index,busy,onClose,onCreate}:{
  groups:Group[];
  index:ReadonlyMap<string,string>;
  busy:boolean;
  onClose:()=>void;
  onCreate:(keys:string[])=>void;
}){
  const [query,setQuery]=useState("");
  const deferredQuery=useDeferredValue(query);
  const [limit,setLimit]=useState(PAGE_SIZE);
  const [selected,setSelected]=useState<string[]>([]);
  const chosen=useMemo(()=>new Set(selected),[selected]);
  const result=useMemo(()=>reverseSearchGroups(groups,index,deferredQuery,limit),
    [groups,index,deferredQuery,limit]);
  const searching=query!==deferredQuery;
  function updateSearch(value:string){setQuery(value);setLimit(PAGE_SIZE);}
  function toggle(key:string,checked:boolean){
    setSelected(current=>checked
      ? current.includes(key)?current:[...current,key]
      : current.filter(item=>item!==key));
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto border-sky-400/40 bg-[#0b2949] text-white">
      <DialogHeader><DialogTitle>Selecionar linhas e grupos</DialogTitle></DialogHeader>
      <p className="text-sm text-sky-200">Selecione um ou vários grupos da mesma base utilizada na Contagem.</p>
      <label className="relative block">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-300"/>
        <Input autoFocus className="border-sky-400/40 bg-[#071b34] pl-10 text-white"
          value={query} onChange={event=>updateSearch(event.target.value)}
          placeholder="Buscar linha, grupo, código ou descrição..."/>
      </label>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-sky-200" aria-live="polite">
        <span>{searching?"Pesquisando...":result.total+" grupo(s) encontrado(s)"}</span>
        <span>{result.visible.length} exibidos de {result.total} · {selected.length} selecionado(s)</span>
      </div>
      <div className="max-h-[400px] overflow-y-auto rounded-xl border border-sky-400/30">
        {result.visible.map(group=><label key={group.key}
          className="flex cursor-pointer items-center gap-3 border-b border-sky-400/15 p-3 hover:bg-sky-500/10">
          <input type="checkbox" className="h-5 w-5 accent-sky-500"
            checked={chosen.has(group.key)}
            onChange={event=>toggle(group.key,event.target.checked)}/>
          <span className="flex-1 text-sm"><strong className="block">Linha {group.linha}</strong>
            <small className="text-sky-200">Grupo {group.grupo}</small></span>
          <span className="text-xs">{group.count} itens</span>
        </label>)}
        {!result.total&&!searching&&<p className="p-4 text-center text-sky-200">Nenhum grupo encontrado.</p>}
      </div>
      {result.visible.length<result.total&&<Button type="button" variant="outline"
        className="border-sky-400/40 bg-[#14385f] text-sky-50 hover:bg-[#20517c]"
        disabled={busy||searching}
        onClick={()=>setLimit(current=>current+PAGE_SIZE)}>
        Mostrar mais grupos ({result.total-result.visible.length} restantes)
      </Button>}
      <p className="text-xs text-sky-200">A seleção permanece marcada mesmo ao pesquisar outro grupo.</p>
      <Button className="bg-sky-600 text-white" disabled={busy||!selected.length}
        onClick={()=>onCreate(selected)}>
        <PackagePlus size={17} className="mr-2"/> Abrir ciclo de Logística Reversa ({selected.length} grupos)
      </Button>
    </DialogContent>
  </Dialog>;
}
