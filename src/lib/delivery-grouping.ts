import type { Delivery } from "./deliveries";
import { isConsumerDelivery } from "./deliveries";
import { deliveryCompanyIdentity, vehicleForDelivery } from "./delivery-dispatch";

export type IndividualGroupingAction =
  | { action: "group_one"; id: string; targetId: string }
  | { action: "ungroup_one"; id: string };

/** Outras notas compatíveis para unificação manual. Um pedido isolado
 * só oferece o botão Unificar quando existe pelo menos outra nota
 * pendente do mesmo cliente e veículo. */
export function individualUnifyTargets(all: Delivery[], selected: Delivery): Delivery[] {
  if (selected.status !== "nao_iniciada" || selected.source === "coleta"
    || isConsumerDelivery(selected) || !!selected.deliveryGroupId) return [];
  const identity = deliveryCompanyIdentity(selected);
  const vehicle = vehicleForDelivery(selected);
  return all.filter(target => {
    if (target.id === selected.id) return false;
    const group = target.deliveryGroupId
      ? all.filter(row => row.deliveryGroupId === target.deliveryGroupId)
      : [target];
    return group.every(row => row.id !== selected.id
      && row.source !== "coleta" && !isConsumerDelivery(row)
      && row.status === "nao_iniciada" && deliveryCompanyIdentity(row) === identity
      && vehicleForDelivery(row) === vehicle
      && !(row.separate && !!row.deliveryGroupId));
  });
}

/** Alterações atômicas de unificação individual.
 * A Expedição apenas muda deliveryGroupId; nenhuma nota, status, rota
 * ou comprovante de assinatura é modificado. */
export function individualGroupingChanges(
  all: Delivery[],
  request: IndividualGroupingAction,
  newGroupId: () => string = () => crypto.randomUUID(),
): Delivery[] {
  const selected = all.find(row => row.id === request.id);
  if (!selected) throw new Error("Pedido não encontrado. Atualize a Expedição.");
  if (selected.source === "coleta" || isConsumerDelivery(selected))
    throw new Error("Coletas e notas do CONSUMIDOR não podem ser unificadas.");
  if (selected.status !== "nao_iniciada")
    throw new Error("Só é possível alterar notas pendentes.");

  if (request.action === "ungroup_one") {
    if (!selected.deliveryGroupId)
      throw new Error("Esta nota não está unificada.");
    const members = all.filter(row => row.deliveryGroupId === selected.deliveryGroupId);
    if (members.some(row => row.status !== "nao_iniciada"))
      throw new Error("Não é possível desunificar um grupo já movimentado ou concluído.");
    // Quando restar só uma nota, também limpar o marcador de grupo dela.
    const remaining = members.filter(row => row.id !== selected.id);
    const changed = remaining.length === 1 ? [selected, remaining[0]] : [selected];
    return changed.map(row => ({ ...row, deliveryGroupId: undefined }));
  }

  if (selected.deliveryGroupId)
    throw new Error("Esta nota já está unificada. Desunifique-a antes de juntá-la a outro grupo.");
  if (request.targetId === selected.id)
    throw new Error("Selecione outra nota para unificar.");

  const target = all.find(row => row.id === request.targetId);
  if (!target) throw new Error("Nota de destino não encontrada. Atualize a Expedição.");
  const members = target.deliveryGroupId
    ? all.filter(row => row.deliveryGroupId === target.deliveryGroupId)
    : [target];
  const identity = deliveryCompanyIdentity(selected);
  const vehicle = vehicleForDelivery(selected);
  if (members.some(row => row.id === selected.id || row.source === "coleta"
    || isConsumerDelivery(row) || (row.separate && !!row.deliveryGroupId) || row.status !== "nao_iniciada"
    || deliveryCompanyIdentity(row) !== identity || vehicleForDelivery(row) !== vehicle))
    throw new Error("Unifique somente pedidos pendentes do mesmo cliente e veículo.");

  const groupId = target.deliveryGroupId || newGroupId();
  // Grupo existente: adicionar apenas a nota selecionada.
  // Novo grupo: marcar a nota selecionada e a nota de destino.
  return (target.deliveryGroupId ? [selected] : [selected, target])
    .map(row => ({ ...row, deliveryGroupId: groupId, separate: undefined }));
}
