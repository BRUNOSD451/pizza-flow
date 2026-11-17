import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app_error";
import { PAPEIS } from "../repositories/member_repository";
import { STATUS_PAGAMENTO } from "../repositories/pagamento_repository";
import { resumir, validarMudancaPagamento, validarNovoPagamento } from "../services/pagamento_regras";

function erroDe(fn: () => void): AppError | null {
  try {
    fn();
    return null;
  } catch (error) {
    assert.ok(error instanceof AppError);
    return error;
  }
}

describe("resumir", () => {
  it("restante desconta o pago e o pendente, sem ficar negativo", () => {
    assert.deepEqual(resumir({ total: "100.00", pago: "30.00", pendente: "20.5" }), {
      total: "100.00",
      valor_pago: "30.00",
      valor_pendente: "20.50",
      restante: "49.50",
    });
    assert.equal(resumir({ total: "10.00", pago: "15.00", pendente: "0" }).restante, "0.00");
  });
});

describe("validarNovoPagamento", () => {
  const saldo = { total: "100.00", pago: "40.00", pendente: "0" };

  it("aceita até o que falta pagar", () => {
    assert.equal(erroDe(() => validarNovoPagamento(saldo, { forma: "pix", valor: "60.00", trocoPara: null })), null);
  });

  it("recusa valor acima do restante, contando os pendentes", () => {
    assert.equal(
      erroDe(() => validarNovoPagamento(saldo, { forma: "pix", valor: "60.01", trocoPara: null }))?.code,
      "VALOR_ACIMA_DO_RESTANTE"
    );
    const comPendente = { ...saldo, pendente: "60.00" };
    assert.equal(
      erroDe(() => validarNovoPagamento(comPendente, { forma: "pix", valor: "0.01", trocoPara: null }))?.code,
      "VALOR_ACIMA_DO_RESTANTE"
    );
  });

  it("recusa valor zero", () => {
    assert.equal(erroDe(() => validarNovoPagamento(saldo, { forma: "pix", valor: "0.00", trocoPara: null }))?.code, "VALOR_INVALIDO");
  });

  it("troco só em dinheiro e para valor maior ou igual", () => {
    assert.equal(erroDe(() => validarNovoPagamento(saldo, { forma: "dinheiro", valor: "60.00", trocoPara: "100.00" })), null);
    assert.equal(erroDe(() => validarNovoPagamento(saldo, { forma: "dinheiro", valor: "60.00", trocoPara: "50.00" }))?.code, "TROCO_INVALIDO");
    assert.equal(erroDe(() => validarNovoPagamento(saldo, { forma: "pix", valor: "60.00", trocoPara: "100.00" }))?.code, "TROCO_INVALIDO");
  });
});

describe("validarMudancaPagamento", () => {
  it("segue a tabela para todos os papéis", () => {
    for (const de of STATUS_PAGAMENTO) {
      for (const para of STATUS_PAGAMENTO) {
        for (const papel of PAPEIS) {
          const erro = erroDe(() => validarMudancaPagamento(de, para, papel));
          const caso = `${de} → ${para} (${papel})`;
          const permitido =
            (de === "pendente" && para === "pago") ||
            (de === "pendente" && para === "estornado" && papel !== "entregador") ||
            (de === "pago" && para === "estornado" && (papel === "dono" || papel === "gerente"));
          const proibidoPorPapel = (de === "pendente" || de === "pago") && para === "estornado";

          if (permitido) assert.equal(erro, null, caso);
          else if (proibidoPorPapel) assert.equal(erro?.statusCode, 403, caso);
          else assert.equal(erro?.code, "TRANSICAO_INVALIDA", caso);
        }
      }
    }
  });
});
