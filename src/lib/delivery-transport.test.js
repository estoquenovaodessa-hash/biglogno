import { describe, expect, test } from "bun:test";
import { finishedDeliveryTransport } from "./delivery-transport";

const delivery = (driver, options = {}) => ({
  driver, source: "conferencia", collectionTransport: undefined, ...options,
});

describe("coluna Transporte nas entregas finalizadas do Gestor", () => {
  test("Marcelo mostra a moto, mesmo com sobrenome e variações de acento", () => {
    expect(finishedDeliveryTransport(delivery("Marcelo"))).toBe("moto");
    expect(finishedDeliveryTransport(delivery("  MARCELO SILVA "))).toBe("moto");
    expect(finishedDeliveryTransport(delivery("Marcélo Alves"))).toBe("moto");
  });
  test("Luciano e Cauê mostram o carro, inclusive Caue sem acento", () => {
    expect(finishedDeliveryTransport(delivery("Luciano"))).toBe("carro");
    expect(finishedDeliveryTransport(delivery("Luciano Almeida"))).toBe("carro");
    expect(finishedDeliveryTransport(delivery("Cauê"))).toBe("carro");
    expect(finishedDeliveryTransport(delivery("Caue da Silva"))).toBe("carro");
  });
  test("outros entregadores não recebem ícone de veículo inventado", () => {
    expect(finishedDeliveryTransport(delivery("Carlos"))).toBeNull();
    expect(finishedDeliveryTransport(delivery("José Marcelo"))).toBeNull();
    expect(finishedDeliveryTransport(delivery("Marcelino"))).toBeNull();
    expect(finishedDeliveryTransport(delivery(""))).toBeNull();
    expect(finishedDeliveryTransport(delivery(undefined))).toBeNull();
  });
  test("para coleta, aproveita transporte registrado sem sobrescrever as regras dos três entregadores", () => {
    expect(finishedDeliveryTransport(delivery("Ana", { source: "coleta", collectionTransport: "moto" }))).toBe("moto");
    expect(finishedDeliveryTransport(delivery("Luciano", { source: "coleta", collectionTransport: "moto" }))).toBe("carro");
  });
});
