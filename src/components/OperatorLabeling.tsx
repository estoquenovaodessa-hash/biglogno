import {useEffect,useMemo,useRef,useState} from "react";
import {ArrowLeft,CheckCircle2,FileDown,PackagePlus,Printer,ScanLine,Tag,Trash2,X} from "lucide-react";
import {toast} from "sonner";
import {useStore} from "@/lib/store";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  SBO_UNITS,createSboCatalog,findSboItem,parseSboQuantity,
  createSboLabelsPdf,sboLabelFilename,sboQuantityText,type SboUnit,type SboLabel,
} from "@/lib/sbo-label";
import symbol from "@/assets/bignotto-symbol.png.asset.json";

type SboRow={key:number;code:string;description:string;quantityText:string;unit:SboUnit};
const unitOptions=SBO_UNITS;
function toLabel(row:SboRow):SboLabel|null{
  const quantity=parseSboQuantity(row.quantityText,row.unit);
  return quantity===null?null:{code:row.code,description:row.description,quantity,unit:row.unit};
}

/** Área autônoma do operador. Não usa menu lateral, navegação do gestor
 * ou qualquer alteração nas tabelas do Supabase. */
export function OperatorLabeling({onBack}:{onBack:()=>void}){
  const {barcodesBase,enderecoBase,items,ready}=useStore();
  const catalog=useMemo(()=>createSboCatalog(barcodesBase,enderecoBase,items),
    [barcodesBase,enderecoBase,items]);
  const [sboOpen,setSboOpen]=useState(false);
  const [code,setCode]=useState("");
  const [quantity,setQuantity]=useState("1");
  const [userUnit,setUserUnit]=useState<SboUnit|null>(null);
  const [rows,setRows]=useState<SboRow[]>([]);
  const [error,setError]=useState("");
  const [generating,setGenerating]=useState(false);
  const serial=useRef(0);
  const codeRef=useRef<HTMLInputElement>(null);
  const product=useMemo(()=>findSboItem(catalog,code),[catalog,code]);
  const effectiveUnit=userUnit??product?.unit??"UN";
  const readyForPdf=rows.length>0&&rows.every(r=>toLabel(r)!==null);

  useEffect(()=>{if(sboOpen)codeRef.current?.focus();},[sboOpen]);

  function addRow(event?:React.FormEvent<HTMLFormElement>){
    event?.preventDefault();
    if(!ready){setError("Aguarde o carregamento do cadastro de itens.");return;}
    if(!product){setError("Código não encontrado no cadastro. Confira o código ou importe a base de itens.");return;}
    const parsed=parseSboQuantity(quantity,effectiveUnit);
    if(parsed===null){
      setError(effectiveUnit==="UN"?"Informe uma quantidade inteira maior que zero para UN.":"Informe quantidade maior que zero (até 3 casas decimais).");
      return;
    }
    if(rows.length>=500){setError("Máximo de 500 etiquetas por arquivo.");return;}
    const row:SboRow={key:++serial.current,code:product.code,description:product.description,
      quantityText:quantity.trim(),unit:effectiveUnit};
    setRows(current=>[...current,row]);
    setCode("");setQuantity("1");setUserUnit(null);setError("");
    codeRef.current?.focus();
  }
  function patchRow(key:number,updates:Partial<SboRow>){
    setRows(current=>current.map(row=>row.key===key?{...row,...updates}:row));
    setError("");
  }
  function download(){
    const valid=rows.map(toLabel);
    if(valid.some(record=>!record)){
      setError("Corrija as quantidades da lista antes de gerar o PDF.");return;
    }
    if(!valid.length){setError("Adicione um item antes de gerar etiquetas.");return;}
    setGenerating(true);
    try{
      const labels=valid as SboLabel[];
      createSboLabelsPdf(labels).save(sboLabelFilename(labels));
      toast.success("PDF com "+labels.length+" etiqueta(s) gerado: uma etiqueta por página, 60 × 30 mm.");
      setError("");
    }catch(e){
      const message=e instanceof Error?e.message:"Não foi possível gerar as etiquetas.";
      toast.error(message);setError(message);
    }finally{setGenerating(false);}
  }
  return <section className="min-h-[100dvh] bg-background text-foreground" aria-label="Etiquetagem do operador">
    <header className="border-b-4 border-brand-gold bg-card px-3 py-3 shadow-sm sm:px-6">
      <div className="mx-auto flex w-full max-w-[1550px] flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4">
          <Button type="button" variant="ghost" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4"/> Voltar
          </Button>
          <div className="flex items-center gap-2">
            <Tag className="h-6 w-6 text-primary"/>
            <h1 className="text-lg font-black tracking-wide sm:text-2xl">ETIQUETAGEM</h1>
          </div>
        </div>
        <Button type="button" size="lg" onClick={()=>setSboOpen(current=>!current)}
          className="gap-2 font-black" aria-expanded={sboOpen} aria-controls="sbo-grid">
          <ScanLine className="h-5 w-5"/> S.B.O
        </Button>
      </div>
    </header>
    <main className="mx-auto max-w-[1450px] space-y-5 px-3 py-5 sm:px-6 sm:py-8">
      {!sboOpen?<div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card px-5 py-12 text-center shadow-sm">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Tag className="h-10 w-10"/>
        </div>
        <h2 className="mt-5 text-2xl font-extrabold">Etiquetagem de produtos</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Esta área funcionará sem menu. Clique no botão <strong>S.B.O</strong> no topo para abrir
          o grid e gerar etiquetas de identificação dos itens.
        </p>
        <Button type="button" className="mt-6 gap-2" size="lg" onClick={()=>setSboOpen(true)}>
          <ScanLine className="h-5 w-5"/> Abrir S.B.O
        </Button>
      </div>:<section id="sbo-grid" className="space-y-5" aria-label="Grid de etiquetagem S.B.O">
        <div className="rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-card to-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-primary">Módulo S.B.O.</p>
              <h2 className="text-xl font-extrabold sm:text-2xl">Gerar etiquetas de produtos</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Informe o código do item, a quantidade e sua unidade. A descrição vem automaticamente do cadastro.
              </p>
            </div>
            <span className="rounded-full border border-primary/30 px-3 py-1.5 text-xs font-bold">
              {rows.length} etiqueta(s) na lista
            </span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <form onSubmit={addRow} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="flex items-center gap-2 text-base font-extrabold">
              <PackagePlus className="h-5 w-5 text-primary"/> Novo item para etiquetar
            </h3>
            <div className="grid gap-3 sm:grid-cols-[1.1fr_0.7fr_0.8fr]">
              <label className="space-y-1 text-sm font-semibold">Código do item
                <Input ref={codeRef} value={code} onChange={e=>{setCode(e.target.value);setUserUnit(null);setError("");}}
                  placeholder="Ex.: 03610" autoComplete="off" inputMode="text" maxLength={100} aria-label="Código do item"/>
              </label>
              <label className="space-y-1 text-sm font-semibold">Quantidade
                <Input value={quantity} onChange={e=>{setQuantity(e.target.value);setError("");}}
                  inputMode="decimal" placeholder="Ex.: 1 ou 2,5" aria-label="Quantidade do item"/>
              </label>
              <label className="space-y-1 text-sm font-semibold">Unidade
                <select value={effectiveUnit} onChange={e=>{setUserUnit(e.target.value as SboUnit);setError("");}}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  aria-label="Unidade do item">
                  {unitOptions.map(unit=><option key={unit} value={unit}>{unit}</option>)}
                </select>
              </label>
            </div>
            <div className={"rounded-xl border p-3 text-sm "+(product?"border-emerald-500/30 bg-emerald-500/10":"border-border bg-muted/40")}>
              {product?<div className="space-y-1">
                <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4"/> Item localizado
                </div>
                <p className="break-words font-bold">{product.code} — {product.description}</p>
              </div>:<p className="text-muted-foreground">
                {code.trim()?ready?"Código não encontrado no cadastro de itens.":"Carregando cadastro...":"Digite ou bipe um código para localizar sua descrição."}
              </p>}
            </div>
            {error&&<p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-sm font-semibold text-destructive">{error}</p>}
            <Button type="submit" disabled={!ready||!product||rows.length>=500} className="w-full gap-2 sm:w-auto">
              <PackagePlus className="h-4 w-4"/> Adicionar à lista
            </Button>
            <p className="text-xs text-muted-foreground">
              O leitor de código de barras que envia ENTER também pode adicionar o item com a quantidade indicada.
              Para UN, use números inteiros; para Metros, KG ou G, é possível usar casas decimais.
            </p>
          </form>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="mb-3 flex items-center gap-2 font-extrabold"><Printer className="h-5 w-5 text-primary"/> Modelo da etiqueta</h3>
            <div className="mx-auto max-w-[460px] space-y-1 rounded-xl border-2 border-black bg-white px-4 py-3 text-black shadow-md" aria-label="Prévia ilustrativa de etiqueta S.B.O">
              <div className="flex items-center gap-2 border-b border-black pb-1.5">
                <img src={symbol.url} alt="Ícone Bignotto" className="h-11 w-11 object-contain grayscale"/>
                <div className="min-w-0"><p className="text-xl font-black leading-tight tracking-tight">BIGNOTTO</p>
                  <p className="text-[10px] font-semibold tracking-[.17em]">FERRAMENTAS</p></div>
              </div>
              <div className="border-b border-black py-1.5">
                <p className="text-[10px] font-bold">CÓDIGO DO ITEM</p>
                <p className="break-all text-3xl font-black tracking-tight">{product?.code??"03610"}</p>
              </div>
              <div className="border-b border-black py-1.5">
                <p className="text-[10px] font-bold">DESCRIÇÃO</p>
                <p className="line-clamp-2 text-xs font-medium">{product?.description??"DESCRIÇÃO DO PRODUTO"}</p>
              </div>
              <p className="pt-1 text-sm font-black">QTD: {parseSboQuantity(quantity,effectiveUnit)!==null
                ?sboQuantityText(Number(quantity.replace(",",".")),effectiveUnit):"—"}</p>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Prévia ilustrativa · PDF real em preto e branco · Argox 60 × 30 mm
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-extrabold">Itens para etiquetar ({rows.length})</h3>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={!rows.length}
                onClick={()=>{if(window.confirm("Limpar a lista de etiquetas?")){setRows([]);setError("");}}}>
                <X className="mr-1.5 h-4 w-4"/> Limpar lista
              </Button>
              <Button type="button" onClick={download} disabled={!readyForPdf||generating} className="gap-2">
                <FileDown className="h-4 w-4"/> Gerar PDF ({rows.length})
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-muted/80 text-foreground"><tr>
                {["Código do item","Descrição","Quantidade","Unidade","Ações"].map(h=>
                  <th key={h} className="px-3 py-3 text-xs font-bold">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border/70">
                {rows.map(row=><tr key={row.key}>
                  <td className="px-3 py-2 font-mono font-extrabold">{row.code}</td>
                  <td className="max-w-[360px] break-words px-3 py-2">{row.description}</td>
                  <td className="px-3 py-2">
                    <Input value={row.quantityText} inputMode="decimal" className="w-32"
                      aria-label={"Quantidade "+row.code}
                      onChange={e=>patchRow(row.key,{quantityText:e.target.value})}
                      aria-invalid={toLabel(row)===null}/>
                  </td>
                  <td className="px-3 py-2">
                    <select value={row.unit} className="h-10 w-28 rounded-md border border-input bg-background px-2 text-sm"
                      aria-label={"Unidade "+row.code}
                      onChange={e=>patchRow(row.key,{unit:e.target.value as SboUnit})}>
                      {unitOptions.map(unit=><option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Button type="button" variant="ghost" size="icon" aria-label={"Excluir item "+row.code}
                      onClick={()=>setRows(list=>list.filter(item=>item.key!==row.key))}>
                      <Trash2 className="h-4 w-4 text-destructive"/>
                    </Button>
                  </td>
                </tr>)}
              </tbody>
            </table>
            {!rows.length&&<p className="p-6 text-center text-sm text-muted-foreground">
              Nenhum item na lista. Informe código e quantidade acima para começar.
            </p>}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Cada linha gera uma etiqueta de 60 × 30 mm em uma página separada do PDF.
            Imprima na Argox com a configuração de papel já testada, em escala 100%.
          </p>
        </div>
      </section>}
    </main>
  </section>;
}
