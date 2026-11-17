import type { PoolConnection } from "mysql2/promise";
import { withTransaction } from "../db/db";
import { AppError } from "../errors/app_error";
import type { AuthContext } from "../middlewares/autenticar";
import { comandaRepository } from "../repositories/comanda_repository";
import {
  pagamentoRepository,
  type AlvoPagamento,
  type FormaPagamento,
  type Pagamento,
  type StatusPagamento,
} from "../repositories/pagamento_repository";
import { pedidoRepository } from "../repositories/pedido_repository";
import { deCentavos, paraCentavos } from "../utils/preco";
import { podeVerPedido } from "./pedido_transicoes";
import {
  resumir,
  validarMudancaPagamento,
  validarNovoPagamento,
  validarTroco,
  type NovoPagamento,
  type ResumoPagamentos,
} from "./pagamento_regras";

export interface RegistrarPagamentoDados extends NovoPagamento {
  status: "pendente" | "pago";
}

// Ao confirmar um pendente dá para corrigir a forma (combinou dinheiro, pagou no pix)
export interface AlterarPagamentoEntrada {
  status: StatusPagamento;
  forma?: FormaPagamento;
  trocoPara?: string | null;
}

export interface PagamentoComResumo {
  pagamento: Pagamento;
  resumo: ResumoPagamentos;
}

export interface PagamentosComResumo {
  pagamentos: Pagamento[];
  resumo: ResumoPagamentos;
}

const PEDIDO_NAO_ENCONTRADO = () => new AppError("Pedido não encontrado", 404, "PEDIDO_NAO_ENCONTRADO");
const COMANDA_NAO_ENCONTRADA = () => new AppError("Comanda não encontrada", 404, "COMANDA_NAO_ENCONTRADA");
const PAGAMENTO_NAO_ENCONTRADO = () => new AppError("Pagamento não encontrado", 404, "PAGAMENTO_NAO_ENCONTRADO");

// Trava o pedido ou a comanda e devolve o total a pagar.
// Cada alvo tem as suas regras de quando aceita pagamento
type TravarAlvo = (conn: PoolConnection, novoPagamento: boolean) => Promise<string>;

class pagamentoservice {
  async listarDoPedido(auth: AuthContext, pedidoId: string): Promise<PagamentosComResumo> {
    const pizzariaId = auth.pizzariaId!;
    const pedido = await pedidoRepository.findById(pizzariaId, pedidoId);
    if (!pedido || !podeVerPedido(auth, pedido)) throw PEDIDO_NAO_ENCONTRADO();
    return this.listar(pizzariaId, { pedidoId }, pedido.total);
  }

  async listarDaComanda(auth: AuthContext, comandaId: string): Promise<PagamentosComResumo> {
    const pizzariaId = auth.pizzariaId!;
    const comanda = await comandaRepository.findById(pizzariaId, comandaId);
    if (!comanda) throw COMANDA_NAO_ENCONTRADA();
    return this.listar(pizzariaId, { comandaId }, totalComanda(comanda.subtotal, comanda.taxa_servico));
  }

  async registrarNoPedido(auth: AuthContext, pedidoId: string, dados: RegistrarPagamentoDados): Promise<PagamentoComResumo> {
    return this.registrar(auth, { pedidoId }, this.travarPedido(auth, pedidoId), dados);
  }

  async registrarNaComanda(auth: AuthContext, comandaId: string, dados: RegistrarPagamentoDados): Promise<PagamentoComResumo> {
    return this.registrar(auth, { comandaId }, this.travarComanda(auth, comandaId), dados);
  }

  async alterarNoPedido(
    auth: AuthContext,
    pedidoId: string,
    pagamentoId: string,
    dados: AlterarPagamentoEntrada
  ): Promise<PagamentoComResumo> {
    return this.alterar(auth, { pedidoId }, pagamentoId, this.travarPedido(auth, pedidoId), dados);
  }

  async alterarNaComanda(
    auth: AuthContext,
    comandaId: string,
    pagamentoId: string,
    dados: AlterarPagamentoEntrada
  ): Promise<PagamentoComResumo> {
    return this.alterar(auth, { comandaId }, pagamentoId, this.travarComanda(auth, comandaId), dados);
  }

  private async listar(pizzariaId: string, alvo: AlvoPagamento, total: string): Promise<PagamentosComResumo> {
    const [pagamentos, soma] = await Promise.all([
      pagamentoRepository.listar(pizzariaId, alvo),
      pagamentoRepository.somar(pizzariaId, alvo),
    ]);
    return { pagamentos, resumo: resumir({ total, ...soma }) };
  }

  private async registrar(
    auth: AuthContext,
    alvo: AlvoPagamento,
    travar: TravarAlvo,
    dados: RegistrarPagamentoDados
  ): Promise<PagamentoComResumo> {
    const pizzariaId = auth.pizzariaId!;

    return withTransaction(async (conn) => {
      const total = await travar(conn, true);
      validarNovoPagamento({ total, ...(await pagamentoRepository.somar(pizzariaId, alvo, conn)) }, dados);

      const pagamento = await pagamentoRepository.create(pizzariaId, alvo, dados, conn);
      const resumo = resumir({ total, ...(await pagamentoRepository.somar(pizzariaId, alvo, conn)) });
      return { pagamento, resumo };
    });
  }

  private async alterar(
    auth: AuthContext,
    alvo: AlvoPagamento,
    pagamentoId: string,
    travar: TravarAlvo,
    dados: AlterarPagamentoEntrada
  ): Promise<PagamentoComResumo> {
    const pizzariaId = auth.pizzariaId!;

    return withTransaction(async (conn) => {
      const total = await travar(conn, false);
      const atual = await pagamentoRepository.findById(pizzariaId, alvo, pagamentoId, conn);
      if (!atual) throw PAGAMENTO_NAO_ENCONTRADO();

      validarMudancaPagamento(atual.status, dados.status, auth.papel!);

      // Forma e troco só mudam na confirmação
      if (dados.status !== "pago" && (dados.forma !== undefined || dados.trocoPara !== undefined)) {
        throw new AppError("Forma e troco só podem ser alterados ao confirmar o pagamento", 400, "ALTERACAO_INVALIDA");
      }
      const forma = dados.forma ?? atual.forma;
      // Trocar para uma forma que não é dinheiro limpa o troco
      const trocoPara = dados.trocoPara !== undefined ? dados.trocoPara : forma === "dinheiro" ? atual.troco_para : null;
      validarTroco(forma, atual.valor, trocoPara);

      await pagamentoRepository.alterar(pizzariaId, pagamentoId, { status: dados.status, forma, trocoPara }, conn);

      const pagamento = (await pagamentoRepository.findById(pizzariaId, alvo, pagamentoId, conn))!;
      const resumo = resumir({ total, ...(await pagamentoRepository.somar(pizzariaId, alvo, conn)) });
      return { pagamento, resumo };
    });
  }

  // Pedido de comanda é pago na comanda; cancelado não recebe pagamento novo (mas pode ter estorno)
  private travarPedido(auth: AuthContext, pedidoId: string): TravarAlvo {
    return async (conn, novoPagamento) => {
      const pedido = await pedidoRepository.bloquear(auth.pizzariaId!, pedidoId, conn);
      if (!pedido || !podeVerPedido(auth, pedido)) throw PEDIDO_NAO_ENCONTRADO();
      if (pedido.comanda_id) {
        throw new AppError("Este pedido é de uma comanda: registre o pagamento na comanda", 400, "PAGAR_NA_COMANDA");
      }
      if (novoPagamento && pedido.status === "cancelado") {
        throw new AppError("Pedido cancelado não recebe pagamento", 400, "PEDIDO_CANCELADO");
      }
      return pedido.total;
    };
  }

  // A conta da comanda só é cobrada depois de fechada (com a taxa de serviço definida)
  private travarComanda(auth: AuthContext, comandaId: string): TravarAlvo {
    return async (conn, novoPagamento) => {
      const pizzariaId = auth.pizzariaId!;
      const comanda = await comandaRepository.bloquear(pizzariaId, comandaId, conn);
      if (!comanda) throw COMANDA_NAO_ENCONTRADA();
      if (novoPagamento && comanda.status === "aberta") {
        throw new AppError("Feche a conta da comanda antes de registrar pagamentos", 400, "COMANDA_ABERTA");
      }
      if (novoPagamento && comanda.status === "cancelada") {
        throw new AppError("Comanda cancelada não recebe pagamento", 400, "COMANDA_CANCELADA");
      }
      return totalComanda(await comandaRepository.somarPedidos(pizzariaId, comandaId, conn), comanda.taxa_servico);
    };
  }
}

export function totalComanda(subtotal: string, taxaServico: string): string {
  return deCentavos(paraCentavos(subtotal) + paraCentavos(taxaServico));
}

export const pagamentoService = new pagamentoservice();
