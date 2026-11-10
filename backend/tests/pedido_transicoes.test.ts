import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app_error";
import { PAPEIS, type Papel } from "../repositories/member_repository";
import { STATUS_PEDIDO, TIPOS_PEDIDO, validarTransicao, type StatusPedido, type TipoPedido } from "../services/pedido_transicoes";

const MEMBRO = "membro-1";

function erroDe(fn: () => void): AppError | null {
  try {
    fn();
    return null;
  } catch (error) {
    assert.ok(error instanceof AppError);
    return error;
  }
}

function transicao(statusAtual: StatusPedido, statusNovo: StatusPedido, tipo: TipoPedido, papel: Papel, entregadorId: string | null = MEMBRO) {
  return () => validarTransicao({ statusAtual, statusNovo, tipo, papel, membroId: MEMBRO, entregadorId });
}

// Tabela combinada com o negócio, escrita à mão para travar qualquer mudança nas regras
const TODOS: TipoPedido[] = ["delivery", "retirada", "local"];
const PERMITIDAS: [StatusPedido, StatusPedido, TipoPedido[], Papel[]][] = [
  ["aguardando_aceite", "recebido", TODOS, ["dono", "gerente", "atendente"]],
  ["recebido", "preparando", TODOS, ["dono", "gerente", "cozinha"]],
  ["preparando", "pronto", TODOS, ["dono", "gerente", "cozinha"]],
  ["pronto", "saiu_para_entrega", ["delivery"], ["dono", "gerente", "entregador"]],
  ["saiu_para_entrega", "finalizado", ["delivery"], ["dono", "gerente", "entregador"]],
  ["pronto", "finalizado", ["retirada", "local"], ["dono", "gerente", "atendente"]],
  ["aguardando_aceite", "cancelado", TODOS, ["dono", "gerente", "atendente"]],
  ["recebido", "cancelado", TODOS, ["dono", "gerente"]],
  ["preparando", "cancelado", TODOS, ["dono", "gerente"]],
  ["pronto", "cancelado", TODOS, ["dono", "gerente"]],
  ["saiu_para_entrega", "cancelado", TODOS, ["dono", "gerente"]],
];

describe("validarTransicao", () => {
  it("segue a tabela em todas as combinações de status, tipo e papel", () => {
    for (const de of STATUS_PEDIDO) {
      for (const para of STATUS_PEDIDO) {
        for (const tipo of TIPOS_PEDIDO) {
          for (const papel of PAPEIS) {
            const linha = PERMITIDAS.find((l) => l[0] === de && l[1] === para && l[2].includes(tipo));
            const erro = erroDe(transicao(de, para, tipo, papel));
            const caso = `${de} → ${para} (${tipo}, ${papel})`;

            if (!linha) assert.equal(erro?.code, "TRANSICAO_INVALIDA", caso);
            else if (!linha[3].includes(papel)) assert.equal(erro?.statusCode, 403, caso);
            else assert.equal(erro, null, caso);
          }
        }
      }
    }
  });

  it("não deixa o entregador mexer em pedido de outro entregador", () => {
    assert.equal(erroDe(transicao("pronto", "saiu_para_entrega", "delivery", "entregador", "outro"))?.statusCode, 403);
    assert.equal(erroDe(transicao("saiu_para_entrega", "finalizado", "delivery", "entregador", "outro"))?.statusCode, 403);
    assert.equal(erroDe(transicao("pronto", "saiu_para_entrega", "delivery", "entregador", null))?.statusCode, 403);
  });

  it("exige entregador atribuído para o pedido sair", () => {
    assert.equal(erroDe(transicao("pronto", "saiu_para_entrega", "delivery", "gerente", null))?.code, "ENTREGADOR_NAO_ATRIBUIDO");
  });

  it("recusa finalizar delivery direto de pronto", () => {
    assert.equal(erroDe(transicao("pronto", "finalizado", "delivery", "dono"))?.code, "TRANSICAO_INVALIDA");
  });
});
