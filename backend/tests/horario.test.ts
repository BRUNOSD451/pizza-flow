import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estaAberta, minutoDaSemana } from "../services/horario_service";

const SP = "America/Sao_Paulo";
// Em SP (UTC-3): segunda-feira 16/11/2026 às 19:00
const SEGUNDA_19H = new Date("2026-11-16T22:00:00Z");

function em(base: Date, horas: number): Date {
  return new Date(base.getTime() + horas * 60 * 60 * 1000);
}

describe("minutoDaSemana", () => {
  it("usa o dia e a hora no fuso da pizzaria", () => {
    assert.equal(minutoDaSemana(SEGUNDA_19H, SP), 1 * 24 * 60 + 19 * 60);
    // Mesmo instante em UTC já é segunda 22:00
    assert.equal(minutoDaSemana(SEGUNDA_19H, "UTC"), 1 * 24 * 60 + 22 * 60);
  });
});

describe("estaAberta", () => {
  const segundaNoite = [{ diaSemana: 1, abre: "18:00", fecha: "23:00" }];

  it("sem horário cadastrado fica fechada", () => {
    assert.equal(estaAberta([], SP, SEGUNDA_19H), false);
  });

  it("abre no horário de abrir e fecha no de fechar", () => {
    assert.equal(estaAberta(segundaNoite, SP, SEGUNDA_19H), true);
    assert.equal(estaAberta(segundaNoite, SP, em(SEGUNDA_19H, -1)), true); // 18:00
    assert.equal(estaAberta(segundaNoite, SP, em(SEGUNDA_19H, -1.01)), false); // 17:59
    assert.equal(estaAberta(segundaNoite, SP, em(SEGUNDA_19H, 4)), false); // 23:00
  });

  it("não vale para outro dia da semana", () => {
    assert.equal(estaAberta([{ diaSemana: 2, abre: "18:00", fecha: "23:00" }], SP, SEGUNDA_19H), false);
  });

  it("turno que vira a noite continua aberto no dia seguinte", () => {
    const ateDuas = [{ diaSemana: 1, abre: "18:00", fecha: "02:00" }];
    assert.equal(estaAberta(ateDuas, SP, em(SEGUNDA_19H, 6)), true); // terça 01:00
    assert.equal(estaAberta(ateDuas, SP, em(SEGUNDA_19H, 7)), false); // terça 02:00
  });

  it("turno de sábado que vira a noite continua no domingo", () => {
    const sabado = [{ diaSemana: 6, abre: "18:00", fecha: "01:00" }];
    const domingoMeiaNoiteEMeia = new Date("2026-11-22T03:30:00Z");
    assert.equal(estaAberta(sabado, SP, domingoMeiaNoiteEMeia), true);
  });

  it("abre = fecha é aberto 24 horas naquele dia", () => {
    const diaTodo = [{ diaSemana: 1, abre: "00:00", fecha: "00:00" }];
    assert.equal(estaAberta(diaTodo, SP, SEGUNDA_19H), true);
    assert.equal(estaAberta(diaTodo, SP, em(SEGUNDA_19H, 5)), false); // terça 00:00
  });
});
