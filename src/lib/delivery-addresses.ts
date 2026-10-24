import Papa from "papaparse";

export interface DeliveryClientAddress {
  client_code: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
}

const normalize = (value: string) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
export const normalizeDeliveryClientCode = (value: string) => String(value ?? "").trim().replace(/^0+(?=\d)/, "");

export function parseDeliveryAddressesCsv(csvText: string): DeliveryClientAddress[] {
  const parsed = Papa.parse<string[]>(csvText, { delimiter: ";", skipEmptyLines: true });
  const rows = parsed.data;
  const header = rows.findIndex(row =>
    normalize(row[0]) === "CODIGO" &&
    normalize(row[2]) === "ENDERECO" &&
    normalize(row[3]) === "BAIRRO" &&
    normalize(row[4]) === "CIDADE" &&
    normalize(row[5]) === "UF"
  );
  if (header < 0) throw new Error("Não encontrei as colunas A: CÓDIGO, C: ENDEREÇO, D: BAIRRO, E: CIDADE e F: UF no CSV.");

  const results = new Map<string, DeliveryClientAddress>();
  for (const row of rows.slice(header + 1)) {
    const code = normalizeDeliveryClientCode(row[0]);
    if (!/^\d{1,12}$/.test(code)) continue;
    const entry = {
      client_code: code,
      address: String(row[2] ?? "").trim(),
      neighborhood: String(row[3] ?? "").trim(),
      city: String(row[4] ?? "").trim(),
      state: String(row[5] ?? "").trim().toUpperCase(),
    };
    if (!entry.address || !entry.city || !/^[A-Z]{2}$/.test(entry.state)) continue;
    if ([entry.address, entry.neighborhood, entry.city].some(s => s.length > 300)) continue;
    results.set(code, entry);
  }
  if (!results.size) throw new Error("Nenhum cliente válido com endereço foi encontrado no CSV.");
  return [...results.values()];
}
