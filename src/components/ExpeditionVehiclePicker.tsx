import type { ExpeditionVehicle } from "@/lib/delivery-dispatch";

/** Controle de veículo reutilizável. A atribuição é feita pela Expedição. */
export function ExpeditionVehiclePicker({vehicle,readOnly,disabled,onChange}:{
  vehicle?:ExpeditionVehicle|null;
  readOnly?:boolean;
  disabled?:boolean;
  onChange:(value:ExpeditionVehicle|null)=>void;
}) {
  if(readOnly) return <span className="exp-shift">{vehicle==="moto"?"🏍️ MOTO":vehicle==="carro"?"🚗 CARRO":"N/D"}</span>;
  return <select
    className="exp-shift exp-shift-trigger cursor-pointer"
    aria-label="Veículo designado para a operação"
    value={vehicle??""} disabled={disabled}
    onChange={event=>onChange((event.target.value||null) as ExpeditionVehicle|null)}>
    <option value="">N/D</option>
    <option value="moto">🏍️ MOTO</option>
    <option value="carro">🚗 CARRO</option>
  </select>;
}
