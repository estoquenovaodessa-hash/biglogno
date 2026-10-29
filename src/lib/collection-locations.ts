import type { Delivery } from "./deliveries";

/** Local de coleta validado pelo gestor. A coleta específica mantém seu
 * próprio endereço mesmo que a empresa mude de local futuramente. */
export interface ConfirmedCollectionLocation {
  collectionId: string;
  companyId: string;
  companyName: string;
  address: string;
  /** Texto do endereço original na coleta no momento da confirmação.
   * Mudanças posteriores na Expedição invalidam automaticamente o ponto antigo. */
  initialAddress?: string;
  latitude: number;
  longitude: number;
  confirmedAt: string;
}
export interface CollectionLocationCatalog {
  /** Local padrão para novas coletas de cada empresa. */
  defaults: Record<string, ConfirmedCollectionLocation>;
  /** Exceções históricas, cada confirmação vinculada à coleta original. */
  specific: Record<string, ConfirmedCollectionLocation>;
}
export const EMPTY_COLLECTION_LOCATIONS: CollectionLocationCatalog = { defaults: {}, specific: {} };

export function normalizeCollectionAddress(address?: string | null): string {
  return (address ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

export function matchingCollectionLocation(
  delivery: Pick<Delivery, "id" | "source" | "collectionCompanyId" | "collectionAddress">,
  catalog: CollectionLocationCatalog,
): ConfirmedCollectionLocation | undefined {
  if (delivery.source !== "coleta") return undefined;
  const specific = catalog.specific[delivery.id];
  if (specific) {
    const now = normalizeCollectionAddress(delivery.collectionAddress);
    const original = normalizeCollectionAddress(specific.initialAddress);
    const confirmed = normalizeCollectionAddress(specific.address);
    // Corrigir texto de uma coleta concluída é permitido. Mas se a Expedição
    // depois trocar o endereço desta operação, não reutilizar coordenadas antigas.
    if (now === original || now === confirmed) return specific;
    return undefined;
  }
  if (!delivery.collectionCompanyId) return undefined;
  const standard = catalog.defaults[delivery.collectionCompanyId];
  // Outras coletas antigas só herdam a confirmação se o texto corresponder.
  // Sem endereço ou endereço diferente, NÃO inventar uma visita ao mesmo local.
  return standard && normalizeCollectionAddress(delivery.collectionAddress)
    && normalizeCollectionAddress(delivery.collectionAddress) === normalizeCollectionAddress(standard.address)
    ? standard : undefined;
}

/** Aplicar ponto confirmado apenas à visualização dos três painéis.
 * Registro original e status da coleta permanecem intactos no banco. */
export function applyCollectionLocations(
  records: Delivery[], catalog: CollectionLocationCatalog,
): Delivery[] {
  return records.map(delivery => {
    const location = matchingCollectionLocation(delivery, catalog);
    if (!location) return delivery;
    return { ...delivery, collectionConfirmedAddress: location.address,
      collectionLatitude: location.latitude, collectionLongitude: location.longitude,
      collectionLocationConfirmedAt: location.confirmedAt,
      // A coleta específica pode estar sem rua: corrigir o endereço visual
      // para o local efetivamente conferido pelo gestor.
      collectionAddress: catalog.specific[delivery.id]?.address ?? delivery.collectionAddress };
  });
}
