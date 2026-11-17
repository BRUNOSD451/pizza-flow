import { AppError } from "../errors/app_error";
import type { Papel } from "../repositories/member_repository";
import type { FormaPagamento, StatusPagamento } from "../repositories/pagamento_repository";
import { deCentavos, paraCentavos } from "../utils/preco";

// Sem acesso a banco: recebe os valores já lidos (com a linha do pedido/comanda travada)

export interface NovoPagamento {
  forma: FormaPagamento;
  valor: string;
  trocoPara: string | null;
}

export interface SaldoAtual {
  total: string;
  pago: string;
  pendente: string;
}

export interface ResumoPagamentos {
  total: string;
  valor_pago: string;
  valor_pendente: string;
  // Quanto ainda falta pagar ou combinar
  restante: string;
}

const GESTAO: Papel[] = ["dono", "gerente"];

export function resumir(saldo: SaldoAtual): ResumoPagamentos {
  const restante = paraCentavos(saldo.total) - paraCentavos(saldo.pago) - paraCentavos(saldo.pendente);
  return {
    total: saldo.total,
    valor_pago: deCentavos(paraCentavos(saldo.pago)),
    valor_pendente: deCentavos(paraCentavos(saldo.pendente)),
    restante: deCentavos(Math.max(restante, 0)),
  };
}

export function validarTroco(forma: FormaPagamento, valor: string, trocoPara: string | null): void {
  if (trocoPara === null) return;
  if (forma !== "dinheiro") throw new AppError("Troco só existe para pagamento em dinheiro", 400, "TROCO_INVALIDO");
  if (paraCentavos(trocoPara) < paraCentavos(valor)) {
    throw new AppError("O troco deve ser para um valor maior ou igual ao pago", 400, "TROCO_INVALIDO");
  }
}

// Pagamentos pendentes contam: o que já foi combinado não pode ser cobrado de novo.
// Para devolver troco, use troco_para; o valor é só o que fica com a loja
export function validarNovoPagamento(saldo: SaldoAtual, novo: NovoPagamento): void {
  if (paraCentavos(novo.valor) <= 0) throw new AppError("O valor deve ser maior que zero", 400, "VALOR_INVALIDO");
  validarTroco(novo.forma, novo.valor, novo.trocoPara);

  const restante = paraCentavos(resumir(saldo).restante);
  if (paraCentavos(novo.valor) > restante) {
    throw new AppError(
      restante === 0 ? "Esta conta já está toda paga" : `O valor passa do que falta pagar (R$ ${deCentavos(restante)})`,
      400,
      "VALOR_ACIMA_DO_RESTANTE"
    );
  }
}

// pendente → pago: confirma o recebimento. pendente → estornado: desfaz o combinado.
// pago → estornado: devolve dinheiro, só a gestão
export function validarMudancaPagamento(de: StatusPagamento, para: StatusPagamento, papel: Papel): void {
  const permitido =
    (de === "pendente" && para === "pago") ||
    (de === "pendente" && para === "estornado" && papel !== "entregador") ||
    (de === "pago" && para === "estornado" && GESTAO.includes(papel));

  if (permitido) return;
  if ((de === "pendente" || de === "pago") && para === "estornado") {
    throw new AppError("Você não tem permissão para esta ação", 403, "SEM_PERMISSAO");
  }
  throw new AppError(`Um pagamento ${de} não pode ir para ${para}`, 400, "TRANSICAO_INVALIDA");
}
