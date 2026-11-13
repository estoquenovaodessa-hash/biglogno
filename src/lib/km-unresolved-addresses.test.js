import { describe, expect, test } from "bun:test";
import { unresolvedKmAddresses } from "./km-unresolved-addresses";

const delivery = (id, companyCode = "0027", extra = {}) => ({
  id, companyCode, company: "Cliente " + id,
  source: "conferencia", document: id, value: 100,
  status: "finalizada", createdAt: "2026-11-10T09:00:00Z",
  finishedAt: "2026-11-10T10:00:00Z", position: 1, ...extra,
});
const origin = {
  kind: "origin", key: "origin:bignotto", clientCode: "1",
  company: "BIGNOTTO FERRAMENTAS", at: "", deliveries: [],
  address: { client_code: "1", address: "Av. Ampelio Gazetta 100", neighborhood: "Centro", city: "Nova Odessa", state: "SP" },
};
const destination = (id, code = "0027", address) => ({
  key: "codigo:" + code, company: "Cliente " + id, clientCode: code,
  at: "2026-11-10T10:00:00Z", deliveries: [delivery(id, code)], address,
});
const addr = { client_code: "27", address: "Rua Sem Numero", neighborhood: "", city: "Nova Odessa", state: "SP" };
const trip = (key, stops) => ({
  key, employeeId: "a", name: "Luciano", day: "2026-11-10", shift: "manha",
  documents: stops.length - 1, visits: stops.length - 1, stops,
});

describe("aviso de KM abre apenas endereços identificados como problema", () => {
  test("geocodificação falhou num cliente: listar a nota exata e deduplicar o mesmo código entre turnos", () => {
    const trips = [trip("r1", [origin, destination("111", "0027", addr)]),
      trip("r2", [origin, destination("222", "27", addr)])];
    const out = {
      r1: { meters: null, reason: "Endereço não localizado: Cliente 111",
        failureKind: "geocode", problemStopIndices: [1] },
      r2: { meters: null, reason: "Endereço não localizado: Cliente 222",
        failureKind: "geocode", problemStopIndices: [1] },
    };
    const { issues, routeFailures } = unresolvedKmAddresses(trips, out);
    expect(routeFailures).toHaveLength(0);
    expect(issues).toHaveLength(1);
    expect(issues[0].key).toBe("client:27");
    expect(issues[0].stop.deliveries[0].document).toBe("111");
    expect(issues[0].trips).toHaveLength(2);
  });

  test("cadastro ausente em duas paradas: listar ambas sem remover entregas", () => {
    const stops = [origin, destination("100", "100"), destination("200", "200")];
    const out = { r1: { meters: null, reason: "Há entregas sem endereço cadastrado.",
      failureKind: "missing_address", problemStopIndices: [1, 2] } };
    const result = unresolvedKmAddresses([trip("r1", stops)], out);
    expect(result.issues.map(x => x.stop.deliveries[0].document)).toEqual(["100", "200"]);
    expect(result.routeFailures).toHaveLength(0);
  });

  test("origem ausente: abrir cadastro do cliente 1 sem atribuir culpa às entregas", () => {
    const out = { r1: { meters: null, reason: "Origem não cadastrada.", failureKind: "origin" } };
    const { issues, routeFailures } = unresolvedKmAddresses([
      trip("r1", [destination("111", "0027", addr)]),
    ], out);
    expect(issues.map(x => x.key)).toEqual(["origin:1"]);
    expect(issues[0].stop.clientCode).toBe("1");
    expect(routeFailures).toHaveLength(0);
  });

  test("serviço OSRM ou Nominatim indisponível não significa endereço errado", () => {
    const { issues, routeFailures } = unresolvedKmAddresses([
      trip("r1", [origin, destination("111", "27", addr)]),
      trip("r2", [origin, destination("222", "28", addr)]),
    ], {
      r1: { meters: null, failureKind: "routing", reason: "Serviço de distâncias indisponível" },
      r2: { meters: 2500 },
    });
    expect(issues).toEqual([]);
    expect(routeFailures).toHaveLength(1);
    expect(routeFailures[0].trip).toContain("Luciano");
  });

  test("coleta sem endereço é ligada ao ID da coleta, e não ao código de cliente", () => {
    const collection = { key: "coleta:uuid", company: "Empresa coleta", clientCode: "", at: "",
      deliveries: [delivery("uuid", undefined, { source: "coleta" })] };
    const { issues } = unresolvedKmAddresses([trip("r1", [origin, collection])], {
      r1: { meters: null, failureKind: "missing_address", problemStopIndices: [1] },
    });
    expect(issues[0].key).toBe("collection:uuid");
  });
});
