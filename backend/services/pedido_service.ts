import { withTransaction } from "../db/db";
import { AppError } from "../errors/app_error";
import type { AuthContext } from "../middlewares/autenticar";
import { adicionalRepository } from "../repositories/adicional_repository";
import { areaEntregaRepository } from "../repositories/area_entrega_repository";
import { bordaRepository } from "../repositories/borda_repository";
import { categoriaRepository } from "../repositories/categoria_repository";
import { clienteRepository } from "../repositories/cliente_repository";
import { enderecoRepository } from "../repositories/endereco_repository";
import { memberRepository, type Papel } from "../repositories/member_repository";
import {
  pedidoRepository,
  type EnderecoEntrega,
  type ListarPedidosFiltros,
  type OrigemPedido,
  type Pedido,
  type PedidoComItens,
  type PedidoEvento,
} from "../repositories/pedido_repository";
import { pizzariaRepository, type Pizzaria } from "../repositories/pizzaria_repository";
import { produtoRepository } from "../repositories/produto_repository";
import { saborRepository } from "../repositories/sabor_repository";
import { tamanhoRepository } from "../repositories/tamanho_repository";
import { paraCentavos } from "../utils/preco";
import { calcularItens, calcularTotais, type CatalogoPedido, type ItemSolicitado } from "./pedido_calculo";
import { validarTransicao, type StatusPedido, type TipoPedido } from "./pedido_transicoes";

export interface CriarPedidoEntrada {
  chaveIdempotencia: string;
  tipo: TipoPedido;
  origem: OrigemPedido;
  clienteId: string | null;
  enderecoId: string | null;
  desconto: string;
  observacao: string | null;
  itens: ItemSolicitado[];
}

export interface PedidoCompleto extends PedidoComItens {
  eventos: PedidoEvento[];
}

// A cozinha não vê valores, endereço nem dados do cliente
export interface PedidoCozinha {
  id: string;
  numero: number;
  tipo: TipoPedido;
  origem: OrigemPedido;
  status: StatusPedido;
  observacao: string | null;
  criado_em: Date;
  aceito_em: Date | null;
  preparo_em: Date | null;
  pronto_em: Date | null;
  itens: {
    id: string;
    tipo: "pizza" | "produto";
    descricao: string;
    quantidade: number;
    observacao: string | null;
    total_partes: number | null;
    sabores: { nome_sabor: string; partes: number }[];
    adicionais: { nome: string; quantidade: number }[];
  }[];
}

const PODEM_DAR_DESCONTO: Papel[] = ["dono", "gerente"];
const STATUS_DA_COZINHA: StatusPedido[] = ["recebido", "preparando", "pronto"];
const STATUS_DAS_ENTREGAS: StatusPedido[] = ["pronto", "saiu_para_entrega"];
// Depois que o pedido saiu, trocar o entregador deixaria o histórico errado
const STATUS_PARA_ATRIBUIR: StatusPedido[] = ["recebido", "preparando", "pronto"];

const PEDIDO_NAO_ENCONTRADO = () => new AppError("Pedido não encontrado", 404, "PEDIDO_NAO_ENCONTRADO");

function unicos(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

function paraCozinha(pedido: PedidoComItens): PedidoCozinha {
  return {
    id: pedido.id,
    numero: pedido.numero,
    tipo: pedido.tipo,
    origem: pedido.origem,
    status: pedido.status,
    observacao: pedido.observacao,
    criado_em: pedido.criado_em,
    aceito_em: pedido.aceito_em,
    preparo_em: pedido.preparo_em,
    pronto_em: pedido.pronto_em,
    itens: pedido.itens.map((item) => ({
      id: item.id,
      tipo: item.tipo,
      descricao: item.descricao,
      quantidade: item.quantidade,
      observacao: item.observacao,
      total_partes: item.total_partes,
      sabores: item.sabores.map((s) => ({ nome_sabor: s.nome_sabor, partes: s.partes })),
      adicionais: item.adicionais.map((a) => ({ nome: a.nome, quantidade: a.quantidade })),
    })),
  };
}

class pedidoservice {
  // `criado` = false quando a chave de idempotência já existia e o pedido devolvido é o original
  async criar(auth: AuthContext, dados: CriarPedidoEntrada): Promise<{ pedido: PedidoCompleto; criado: boolean }> {
    const pizzariaId = auth.pizzariaId!;

    if (paraCentavos(dados.desconto) > 0 && !PODEM_DAR_DESCONTO.includes(auth.papel!)) {
      throw new AppError("Só o dono ou o gerente podem dar desconto", 403, "SEM_PERMISSAO");
    }

    const existente = await pedidoRepository.findIdByChave(pizzariaId, dados.chaveIdempotencia);
    if (existente) return { pedido: await this.completo(pizzariaId, existente), criado: false };

    const pizzaria = (await pizzariaRepository.findById(pizzariaId))!;
    const entrega = await this.resolverEntrega(pizzaria, dados);
    const catalogo = await this.carregarCatalogo(pizzariaId, dados.itens);

    const itens = calcularItens(catalogo, dados.itens, pizzaria.regra_preco_pizza);
    const totais = calcularTotais(itens, dados.desconto, entrega.taxa);

    try {
      const { pedidoId, criado } = await withTransaction(async (conn) => {
        const ultimoNumero = await pizzariaRepository.bloquearNumeracaoPedido(pizzariaId, conn);

        // Com a numeração travada, um envio repetido que estava em paralelo já foi gravado e aparece aqui
        const repetido = await pedidoRepository.findIdByChave(pizzariaId, dados.chaveIdempotencia, conn);
        if (repetido) return { pedidoId: repetido, criado: false };

        const numero = ultimoNumero + 1;
        await pizzariaRepository.salvarNumeracaoPedido(pizzariaId, numero, conn);

        const id = await pedidoRepository.create(
          pizzariaId,
          {
            numero,
            chaveIdempotencia: dados.chaveIdempotencia,
            tipo: dados.tipo,
            origem: dados.origem,
            clienteId: dados.clienteId,
            criadoPor: auth.membroId!,
            areaEntregaId: entrega.areaEntregaId,
            enderecoEntrega: entrega.endereco,
            totais,
            observacao: dados.observacao,
          },
          conn
        );
        await pedidoRepository.inserirItens(pizzariaId, id, itens, conn);
        await pedidoRepository.inserirEvento(pizzariaId, id, null, "recebido", auth.membroId, conn);
        return { pedidoId: id, criado: true };
      });

      return { pedido: await this.completo(pizzariaId, pedidoId), criado };
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === "ER_DUP_ENTRY" && err.message?.includes("uq_pedidos_idempotencia")) {
        const original = await pedidoRepository.findIdByChave(pizzariaId, dados.chaveIdempotencia);
        if (original) return { pedido: await this.completo(pizzariaId, original), criado: false };
      }
      throw error;
    }
  }

  async listar(pizzariaId: string, filtros: ListarPedidosFiltros): Promise<PedidoComItens[]> {
    return pedidoRepository.comItens(pizzariaId, await pedidoRepository.listar(pizzariaId, filtros));
  }

  async filaCozinha(pizzariaId: string): Promise<PedidoCozinha[]> {
    const pedidos = await pedidoRepository.listarPorStatus(pizzariaId, STATUS_DA_COZINHA);
    return (await pedidoRepository.comItens(pizzariaId, pedidos)).map(paraCozinha);
  }

  async minhasEntregas(auth: AuthContext): Promise<PedidoComItens[]> {
    const pizzariaId = auth.pizzariaId!;
    const pedidos = await pedidoRepository.listarDoEntregador(pizzariaId, auth.membroId!, STATUS_DAS_ENTREGAS);
    return pedidoRepository.comItens(pizzariaId, pedidos);
  }

  // A resposta depende do papel: cozinha sem valores, entregador só com os pedidos dele
  async buscar(auth: AuthContext, pedidoId: string): Promise<PedidoCompleto | PedidoCozinha> {
    const pizzariaId = auth.pizzariaId!;
    const pedido = await pedidoRepository.findById(pizzariaId, pedidoId);
    if (!pedido || !this.podeVer(auth, pedido.entregador_id)) throw PEDIDO_NAO_ENCONTRADO();

    if (auth.papel === "cozinha") {
      const [comItens] = await pedidoRepository.comItens(pizzariaId, [pedido]);
      return paraCozinha(comItens);
    }
    return this.montarCompleto(pizzariaId, pedido);
  }

  async mudarStatus(
    auth: AuthContext,
    pedidoId: string,
    statusNovo: StatusPedido,
    motivoCancelamento: string | null
  ): Promise<PedidoCompleto | PedidoCozinha> {
    const pizzariaId = auth.pizzariaId!;

    await withTransaction(async (conn) => {
      const atual = await pedidoRepository.bloquear(pizzariaId, pedidoId, conn);
      if (!atual || !this.podeVer(auth, atual.entregador_id)) throw PEDIDO_NAO_ENCONTRADO();

      validarTransicao({
        statusAtual: atual.status,
        statusNovo,
        tipo: atual.tipo,
        entregadorId: atual.entregador_id,
        papel: auth.papel!,
        membroId: auth.membroId!,
      });

      await pedidoRepository.atualizarStatus(pizzariaId, pedidoId, statusNovo, motivoCancelamento, conn);
      await pedidoRepository.inserirEvento(pizzariaId, pedidoId, atual.status, statusNovo, auth.membroId, conn);
    });

    return this.buscar(auth, pedidoId);
  }

  // entregadorId null remove a atribuição
  async atribuirEntregador(auth: AuthContext, pedidoId: string, entregadorId: string | null): Promise<PedidoCompleto> {
    const pizzariaId = auth.pizzariaId!;

    if (entregadorId) {
      const membro = await memberRepository.findById(pizzariaId, entregadorId);
      if (!membro || !membro.ativo || membro.papel !== "entregador") {
        throw new AppError("Entregador não encontrado ou inativo", 400, "ENTREGADOR_INVALIDO");
      }
    }

    await withTransaction(async (conn) => {
      const atual = await pedidoRepository.bloquear(pizzariaId, pedidoId, conn);
      if (!atual) throw PEDIDO_NAO_ENCONTRADO();
      if (atual.tipo !== "delivery") {
        throw new AppError("Só pedidos de delivery têm entregador", 400, "PEDIDO_NAO_E_DELIVERY");
      }
      if (!STATUS_PARA_ATRIBUIR.includes(atual.status)) {
        throw new AppError("Este pedido não pode mais trocar de entregador", 400, "ENTREGADOR_NAO_ALTERAVEL");
      }
      await pedidoRepository.atribuirEntregador(pizzariaId, pedidoId, entregadorId, conn);
    });

    return this.completo(pizzariaId, pedidoId);
  }

  // Entregador só enxerga o que foi atribuído a ele. Para os outros o pedido "não existe": responde 404
  private podeVer(auth: AuthContext, entregadorId: string | null): boolean {
    return auth.papel !== "entregador" || entregadorId === auth.membroId;
  }

  private async completo(pizzariaId: string, pedidoId: string): Promise<PedidoCompleto> {
    const pedido = await pedidoRepository.findById(pizzariaId, pedidoId);
    if (!pedido) throw PEDIDO_NAO_ENCONTRADO();
    return this.montarCompleto(pizzariaId, pedido);
  }

  private async montarCompleto(pizzariaId: string, pedido: Pedido): Promise<PedidoCompleto> {
    const [[comItens], eventos] = await Promise.all([
      pedidoRepository.comItens(pizzariaId, [pedido]),
      pedidoRepository.listarEventos(pizzariaId, pedido.id),
    ]);
    return { ...comItens, eventos };
  }

  // Cliente, cópia do endereço e taxa. Sem área ligada ao endereço, vale a taxa padrão da loja
  private async resolverEntrega(
    pizzaria: Pizzaria,
    dados: CriarPedidoEntrada
  ): Promise<{ endereco: EnderecoEntrega | null; areaEntregaId: string | null; taxa: string }> {
    if (dados.clienteId && !(await clienteRepository.findById(pizzaria.id, dados.clienteId))) {
      throw new AppError("Cliente não encontrado", 400, "CLIENTE_INVALIDO");
    }

    if (dados.tipo !== "delivery") return { endereco: null, areaEntregaId: null, taxa: "0.00" };

    const endereco = await enderecoRepository.findById(pizzaria.id, dados.clienteId!, dados.enderecoId!);
    if (!endereco) throw new AppError("Endereço não encontrado para este cliente", 400, "ENDERECO_INVALIDO");

    let taxa = pizzaria.taxa_entrega_padrao;
    if (endereco.area_entrega_id) {
      const area = await areaEntregaRepository.findById(pizzaria.id, endereco.area_entrega_id);
      if (!area || !area.ativo) {
        throw new AppError("A área de entrega deste endereço não está ativa", 400, "AREA_ENTREGA_INVALIDA");
      }
      taxa = area.taxa;
    }

    return {
      areaEntregaId: endereco.area_entrega_id,
      taxa,
      endereco: {
        cep: endereco.cep,
        logradouro: endereco.logradouro,
        numero: endereco.numero,
        complemento: endereco.complemento,
        bairro: endereco.bairro,
        cidade: endereco.cidade,
        estado: endereco.estado,
        referencia: endereco.referencia,
      },
    };
  }

  private async carregarCatalogo(pizzariaId: string, itens: ItemSolicitado[]): Promise<CatalogoPedido> {
    const pizzas = itens.filter((item) => item.tipo === "pizza");
    const produtos = itens.filter((item) => item.tipo === "produto");

    const [catTamanhos, catSabores, catBordas, catAdicionais, catProdutos, categorias] = await Promise.all([
      tamanhoRepository.findByIds(pizzariaId, unicos(pizzas.map((p) => p.tamanhoId))),
      saborRepository.findByIds(pizzariaId, unicos(pizzas.flatMap((p) => p.sabores.map((s) => s.saborId)))),
      bordaRepository.findByIds(pizzariaId, unicos(pizzas.map((p) => p.bordaId))),
      adicionalRepository.findByIds(pizzariaId, unicos(itens.flatMap((i) => i.adicionais.map((a) => a.adicionalId)))),
      produtoRepository.findByIds(pizzariaId, unicos(produtos.map((p) => p.produtoId))),
      categoriaRepository.listByPizzaria(pizzariaId),
    ]);

    return {
      tamanhos: catTamanhos,
      sabores: catSabores,
      bordas: catBordas,
      adicionais: catAdicionais,
      produtos: catProdutos,
      categorias,
    };
  }
}

export const pedidoService = new pedidoservice();
