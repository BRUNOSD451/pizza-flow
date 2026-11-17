import { withTransaction } from "../db/db";
import { AppError } from "../errors/app_error";
import type { AuthContext } from "../middlewares/autenticar";
import {
  comandaRepository,
  type Comanda,
  type ListarComandasFiltros,
} from "../repositories/comanda_repository";
import { mesaRepository } from "../repositories/mesa_repository";
import { pagamentoRepository, type Pagamento } from "../repositories/pagamento_repository";
import { pedidoRepository, type PedidoComItens } from "../repositories/pedido_repository";
import { pizzariaRepository } from "../repositories/pizzaria_repository";
import { deCentavos, paraCentavos } from "../utils/preco";
import { resumir, type ResumoPagamentos } from "./pagamento_regras";
import { totalComanda } from "./pagamento_service";
import type { ItemSolicitado } from "./pedido_calculo";
import { pedidoService, validarDesconto, type PedidoCompleto } from "./pedido_service";
import type { StatusPedido } from "./pedido_transicoes";

export interface ComandaComTotal extends Comanda {
  total: string;
}

export interface ComandaCompleta extends ComandaComTotal {
  pedidos: PedidoComItens[];
  pagamentos: Pagamento[];
  resumo: ResumoPagamentos;
}

export interface AbrirComandaDados {
  mesaId: string;
  pessoas: number | null;
}

export interface LancarPedidoDados {
  chaveIdempotencia: string;
  desconto: string;
  observacao: string | null;
  itens: ItemSolicitado[];
}

const COMANDA_NAO_ENCONTRADA = () => new AppError("Comanda não encontrada", 404, "COMANDA_NAO_ENCONTRADA");
const COMANDA_NAO_ABERTA = () => new AppError("Esta comanda não está mais aberta", 400, "COMANDA_NAO_ABERTA");
const MESA_OCUPADA = () => new AppError("Esta mesa já tem uma comanda aberta", 409, "MESA_OCUPADA");

// Pedido que a cozinha ainda não terminou impede fechar a conta
const EM_PREPARO: StatusPedido[] = ["aguardando_aceite", "recebido", "preparando"];

// Arredonda meio centavo para cima, só com inteiros
function percentualEmCentavos(centavos: number, percentual: number): number {
  return Math.floor((2 * centavos * percentual + 100) / 200);
}

function comTotal(comanda: Comanda): ComandaComTotal {
  return { ...comanda, total: totalComanda(comanda.subtotal, comanda.taxa_servico) };
}

class comandaservice {
  async listar(pizzariaId: string, filtros: ListarComandasFiltros): Promise<ComandaComTotal[]> {
    return (await comandaRepository.listar(pizzariaId, filtros)).map(comTotal);
  }

  async buscar(pizzariaId: string, comandaId: string): Promise<ComandaCompleta> {
    const comanda = await comandaRepository.findById(pizzariaId, comandaId);
    if (!comanda) throw COMANDA_NAO_ENCONTRADA();

    const [pedidos, pagamentos, soma] = await Promise.all([
      pedidoRepository.listarDaComanda(pizzariaId, comandaId),
      pagamentoRepository.listar(pizzariaId, { comandaId }),
      pagamentoRepository.somar(pizzariaId, { comandaId }),
    ]);
    const completa = comTotal(comanda);
    return {
      ...completa,
      pedidos: await pedidoRepository.comItens(pizzariaId, pedidos),
      pagamentos,
      resumo: resumir({ total: completa.total, ...soma }),
    };
  }

  // Quem abre fica registrado como garçom da comanda
  async abrir(auth: AuthContext, dados: AbrirComandaDados): Promise<ComandaCompleta> {
    const pizzariaId = auth.pizzariaId!;
    const mesa = await mesaRepository.findById(pizzariaId, dados.mesaId);
    if (!mesa || !mesa.ativo) throw new AppError("Mesa não encontrada ou inativa", 400, "MESA_INVALIDA");
    if (mesa.comanda_aberta_id) throw MESA_OCUPADA();

    try {
      const id = await comandaRepository.create(pizzariaId, {
        mesaId: dados.mesaId,
        garcomId: auth.membroId!,
        pessoas: dados.pessoas,
      });
      return this.buscar(pizzariaId, id);
    } catch (error) {
      // Dois garçons abrindo a mesma mesa ao mesmo tempo esbarram no UNIQUE da mesa aberta
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw MESA_OCUPADA();
      throw error;
    }
  }

  // Pedido do salão: sempre tipo local, origem salao, já nasce aceito e vai para a cozinha
  async lancarPedido(
    auth: AuthContext,
    comandaId: string,
    dados: LancarPedidoDados
  ): Promise<{ pedido: PedidoCompleto; criado: boolean }> {
    const pizzariaId = auth.pizzariaId!;
    validarDesconto(auth, dados.desconto);

    const comanda = await comandaRepository.findById(pizzariaId, comandaId);
    if (!comanda) throw COMANDA_NAO_ENCONTRADA();

    const pizzaria = (await pizzariaRepository.findById(pizzariaId))!;
    const { pedidoId, criado } = await pedidoService.registrar(pizzaria, {
      ...dados,
      tipo: "local",
      origem: "salao",
      status: "recebido",
      clienteId: null,
      criadoPor: auth.membroId!,
      comandaId,
      entrega: { endereco: null, areaEntregaId: null, taxa: "0.00" },
      // A conta pode ter sido fechada entre a leitura acima e a gravação
      validarNaTransacao: async (conn) => {
        const travada = await comandaRepository.bloquear(pizzariaId, comandaId, conn);
        if (travada?.status !== "aberta") throw COMANDA_NAO_ABERTA();
      },
    });
    return { pedido: await pedidoService.completo(pizzariaId, pedidoId), criado };
  }

  // Fecha a conta: libera a mesa, finaliza o que já estava pronto e calcula a taxa de serviço.
  // Os pagamentos (que podem ser divididos) entram depois, em /comandas/:id/pagamentos
  async fechar(auth: AuthContext, comandaId: string, taxaServicoPercentual: number): Promise<ComandaCompleta> {
    const pizzariaId = auth.pizzariaId!;

    await withTransaction(async (conn) => {
      const comanda = await comandaRepository.bloquear(pizzariaId, comandaId, conn);
      if (!comanda) throw COMANDA_NAO_ENCONTRADA();
      if (comanda.status !== "aberta") throw COMANDA_NAO_ABERTA();

      const pedidos = await pedidoRepository.bloquearDaComanda(pizzariaId, comandaId, conn);
      const emPreparo = pedidos.filter((p) => EM_PREPARO.includes(p.status));
      if (emPreparo.length > 0) {
        throw new AppError(
          `Ainda há ${emPreparo.length} pedido(s) em preparo nesta comanda`,
          400,
          "PEDIDOS_EM_PREPARO"
        );
      }

      const validos = pedidos.filter((p) => p.status !== "cancelado");
      if (validos.length === 0) {
        throw new AppError("Comanda sem pedidos: cancele em vez de fechar", 400, "COMANDA_VAZIA");
      }

      for (const pedido of validos.filter((p) => p.status === "pronto")) {
        await pedidoRepository.atualizarStatus(pizzariaId, pedido.id, "finalizado", null, conn);
        await pedidoRepository.inserirEvento(pizzariaId, pedido.id, "pronto", "finalizado", auth.membroId, conn);
      }

      const subtotal = validos.reduce((soma, p) => soma + paraCentavos(p.total), 0);
      const taxa = deCentavos(percentualEmCentavos(subtotal, taxaServicoPercentual));
      await comandaRepository.encerrar(pizzariaId, comandaId, "fechada", taxa, conn);
    });

    return this.buscar(pizzariaId, comandaId);
  }

  // Para comanda aberta por engano: todos os pedidos precisam estar cancelados antes
  async cancelar(auth: AuthContext, comandaId: string): Promise<ComandaCompleta> {
    const pizzariaId = auth.pizzariaId!;

    await withTransaction(async (conn) => {
      const comanda = await comandaRepository.bloquear(pizzariaId, comandaId, conn);
      if (!comanda) throw COMANDA_NAO_ENCONTRADA();
      if (comanda.status !== "aberta") throw COMANDA_NAO_ABERTA();

      const pedidos = await pedidoRepository.bloquearDaComanda(pizzariaId, comandaId, conn);
      if (pedidos.some((p) => p.status !== "cancelado")) {
        throw new AppError("Cancele os pedidos da comanda antes de cancelá-la", 400, "COMANDA_COM_PEDIDOS");
      }
      await comandaRepository.encerrar(pizzariaId, comandaId, "cancelada", "0.00", conn);
    });

    return this.buscar(pizzariaId, comandaId);
  }
}

export const comandaService = new comandaservice();
