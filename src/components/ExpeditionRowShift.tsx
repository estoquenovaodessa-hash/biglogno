import {Clock3,Check,ChevronDown,Sun,Sunset} from "lucide-react";
import type {ExpeditionShift,ShiftSection} from "@/lib/expedition-schedule";
import {
  DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const choices=[
  {shift:null,label:"N/D (não definido)",Icon:Clock3},
  {shift:"manha" as const,label:"Manhã",Icon:Sun},
  {shift:"tarde" as const,label:"Tarde",Icon:Sunset},
];

/** Botão de turno em cada LINHA; gestor recebe somente um indicador estático. */
export function ExpeditionRowShift({shift,readOnly,disabled,onChange}:{
  shift:ShiftSection;
  readOnly:boolean;
  disabled:boolean;
  onChange:(value:ExpeditionShift|null)=>Promise<void>;
}){
  const selected=choices.find(c=>c.shift=== (shift==="indefinido"?null:shift))??choices[0];
  const Icon=selected.Icon;
  const badge=<span className={"exp-shift exp-shift-"+shift}>
    <Icon className="h-4 w-4 shrink-0"/>
    {shift==="indefinido"?"N/D":selected.label}
  </span>;
  if(readOnly)return <span aria-label={"Turno: "+selected.label}>{badge}</span>;
  return <DropdownMenu>
    <DropdownMenuTrigger disabled={disabled} aria-label={"Definir turno: "+selected.label}
      className="exp-shift-trigger rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-60">
      {badge}<ChevronDown className="ml-1 inline h-3.5 w-3.5"/>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" sideOffset={5} className="z-[85] min-w-[185px] border border-sky-500/50 bg-[#09243f] p-1.5 text-white shadow-xl">
      {choices.map(({shift:value,label,Icon:OptionIcon})=><DropdownMenuItem
        key={label} disabled={disabled}
        className="cursor-pointer gap-2 rounded-md py-2.5 text-sky-50 focus:bg-sky-700 focus:text-white"
        onSelect={()=>{if(value!==(shift==="indefinido"?null:shift))void onChange(value);}}>
        <OptionIcon className="h-4 w-4"/>{label}
        {value===(shift==="indefinido"?null:shift)&&<Check className="ml-auto h-4 w-4 text-emerald-300"/>}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
