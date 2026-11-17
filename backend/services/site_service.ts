import { AppError } from "../errors/app_error";
import { areaEntregaRepository } from "../repositories/area_entrega_repository";
import { clienteRepository } from "../repositories/cliente_repository";
import { horarioRepository } from "../repositories/horario_repository";
import { pagamentoRepository, type FormaPagamento, type StatusPagamento } from "../repositories/pagamento_repository";
import { pedidoRepository, type EnderecoEntrega, type PedidoComItens } from "../repositories/pedido_repository";
import { pizzariaRepository, type Pizzaria } from "../repositories/pizzaria_repository";
import { cardapioService, type Cardapio } from "./cardapio_service";
import { estaAberta } from "./horario_service";
import type { ItemSolicitado } from "./pedido_calculo";
import { pedidoService, type EntregaResolvida } from "./pedido_service";
import type { StatusPedido, TipoPedido } from "./pedido_transicoes";

// Site do cliente: rotas públicas, a pizzaria vem do slug da URL.
// Nada aqui expõe dados internos (equipe, outros clientes, configuração de preço)

export interface LojaPublica {
  nome: string;
  slug: string;
  telefone: string | null;
  logo_url: string | null;
  cor_primaria: string | null;
  fuso_horario: string;
  tempo_alvo_preparo_min: number;
  taxa_entrega_padrao: string;
  pedido_minimo: string;
  aceitando_pedidos: boolean;
  aberta_agora: boolean;
  // aceitando_pedidos e dentro do horário: o site pode deixar finalizar o pedido
  recebendo_pedidos: boolean;
  horarios: { dia_semana: number; abre: string; fecha: string }[];
  areas_entrega: { id: string; bairro: string; cidade: string; taxa: string; tempo_estimado_min: number | null }[];
}

export interface EnderecoSite {
  areaEntregaId: string | null;
  cep: string | null;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string;
  referencia: string | null;
}

export interface PedidoSiteEntrada {
  chaveIdempotencia: string;
  tipo: "delivery" | "retirada";
  cliente: { nome: string; telefone: string; email: string | null };
  endereco: EnderecoSite | null;
  pagamento: { forma: FormaPagamento; trocoPara: string | null };
  observacao: string | null;
  itens: ItemSolicitado[];
}

// O que o cliente vê do próprio pedido (acompanhamento pelo link com o id)
export interface PedidoSite {
  id: string;
  numero: number;
  tipo: TipoPedido;
  status: StatusPedido;
  cliente_nome: string | null;
  endereco_entrega: EnderecoEntrega | null;
  observacao: string | null;
  itens: {
    descricao: string;
    quantidade: number;
    preco_unitario: string;
    preco_total: string;
    observacao: string | null;
    adicionais: { nome: string; quantidade: number; preco: string }[];
  }[];
  subtotal: string;
  desconto: string;
  taxa_entrega: string;
  total: string;
  pagamento: { forma: FormaPagamento; troco_para: string | null; status: StatusPagamento } | null;
  criado_em: Date;
  aceito_em: Date | null;
  preparo_em: Date | null;
  pronto_em: Date | null;
  saiu_em: Date | null;
  finalizado_em: Date | null;
  cancelado_em: Date | null;
  motivo_cancelamento: string | null;
}

const PIZZARIA_NAO_ENCONTRADA = () => new AppError("Pizzaria não encontrada", 404, "PIZZARIA_NAO_ENCONTRADA");
const PEDIDO_NAO_ENCONTRADO = () => new AppError("Pedido não encontrado", 404, "PEDIDO_NAO_ENCONTRADO");

class siteservice {
  async loja(slug: string): Promise<LojaPublica> {
    const pizzaria = await this.pizzaria(slug);
    const [horarios, areas] = await Promise.all([
      horarioRepository.listByPizzaria(pizzaria.id),
      areaEntregaRepository.listByPizzaria(pizzaria.id),
    ]);
    const abertaAgora = estaAberta(
      horarios.map((h) => ({ diaSemana: h.dia_semana, abre: h.abre, fecha: h.fecha })),
      pizzaria.fuso_horario
    );

    return {
      nome: pizzaria.nome,
      slug: pizzaria.slug,
      telefone: pizzaria.telefone,
      logo_url: pizzaria.logo_url,
      cor_primaria: pizzaria.cor_primaria,
      fuso_horario: pizzaria.fuso_horario,
      tempo_alvo_preparo_min: pizzaria.tempo_alvo_preparo_min,
      taxa_entrega_padrao: pizzaria.taxa_entrega_padrao,
      pedido_minimo: pizzaria.pedido_minimo,
      aceitando_pedidos: pizzaria.aceitando_pedidos,
      aberta_agora: abertaAgora,
      recebendo_pedidos: pizzaria.aceitando_pedidos && abertaAgora,
      horarios: horarios.map((h) => ({ dia_semana: h.dia_semana, abre: h.abre, fecha: h.fecha })),
      areas_entrega: areas
        .filter((a) => a.ativo)
        .map((a) => ({ id: a.id, bairro: a.bairro, cidade: a.cidade, taxa: a.taxa, tempo_estimado_min: a.tempo_estimado_min })),
    };
  }

  async cardapio(slug: string): Promise<Cardapio> {
    return cardapioService.montar((await this.pizzaria(slug)).id);
  }

  // Entra como aguardando_aceite, sem membro; a forma de pagamento escolhida vira um pagamento pendente
  async criarPedido(slug: string, dados: PedidoSiteEntrada): Promise<{ pedido: PedidoSite; criado: boolean }> {
    const pizzaria = await this.pizzaria(slug);

    // Envio repetido devolve o pedido original mesmo que a loja tenha fechado nesse meio-tempo
    const existente = await pedidoRepository.findIdByChave(pizzaria.id, dados.chaveIdempotencia);
    if (existente) return { pedido: await this.pedidoDoSite(pizzaria.id, existente), criado: false };

    if (!pizzaria.aceitando_pedidos) {
      throw new AppError("A pizzaria não está aceitando pedidos pelo site agora", 400, "LOJA_NAO_ACEITANDO");
    }
    const horarios = await horarioRepository.listByPizzaria(pizzaria.id);
    if (!estaAberta(horarios.map((h) => ({ diaSemana: h.dia_semana, abre: h.abre, fecha: h.fecha })), pizzaria.fuso_horario)) {
      throw new AppError("A pizzaria está fechada agora", 400, "LOJA_FECHADA");
    }

    const { pedidoId, criado } = await pedidoService.registrar(pizzaria, {
      chaveIdempotencia: dados.chaveIdempotencia,
      tipo: dados.tipo,
      origem: "site",
      status: "aguardando_aceite",
      clienteId: null,
      criadoPor: null,
      comandaId: null,
      entrega: await this.resolverEntrega(pizzaria, dados),
      desconto: "0.00",
      observacao: dados.observacao,
      itens: dados.itens,
      exigirPedidoMinimo: true,
      pagamentoPendente: dados.pagamento,
      // Cliente já cadastrado (pelo telefone) é reaproveitado sem alterar o cadastro: quem digita no site
      // não pode mudar o nome ou o email de outra pessoa
      resolverCliente: async (conn) => {
        const cliente = await clienteRepository.bloquearPorTelefone(pizzaria.id, dados.cliente.telefone, conn);
        if (cliente) return cliente.id;
        return (await clienteRepository.create(pizzaria.id, { ...dados.cliente, observacoes: null }, conn)).id;
      },
    });
    return { pedido: await this.pedidoDoSite(pizzaria.id, pedidoId), criado };
  }

  // O id (UUID) funciona como código de acompanhamento
  async buscarPedido(slug: string, pedidoId: string): Promise<PedidoSite> {
    const pizzaria = await this.pizzaria(slug);
    return this.pedidoDoSite(pizzaria.id, pedidoId);
  }

  // Pizzaria desativada pelo admin some do site
  private async pizzaria(slug: string): Promise<Pizzaria> {
    const pizzaria = await pizzariaRepository.findBySlug(slug);
    if (!pizzaria || !pizzaria.ativo) throw PIZZARIA_NAO_ENCONTRADA();
    return pizzaria;
  }

  // Com áreas de entrega cadastradas, o cliente escolhe uma delas (a taxa vem dela).
  // Sem nenhuma, vale o bairro digitado e a taxa padrão da loja
  private async resolverEntrega(pizzaria: Pizzaria, dados: PedidoSiteEntrada): Promise<EntregaResolvida> {
    if (dados.tipo !== "delivery") return { endereco: null, areaEntregaId: null, taxa: "0.00" };
    const endereco = dados.endereco!;

    const areas = (await areaEntregaRepository.listByPizzaria(pizzaria.id)).filter((a) => a.ativo);
    let bairro = endereco.bairro;
    let cidade = endereco.cidade;
    let taxa = pizzaria.taxa_entrega_padrao;

    if (endereco.areaEntregaId) {
      const area = areas.find((a) => a.id === endereco.areaEntregaId);
      if (!area) throw new AppError("Não entregamos neste bairro", 400, "AREA_ENTREGA_INVALIDA");
      ({ bairro, cidade, taxa } = area);
    } else if (areas.length > 0) {
      throw new AppError("Escolha o bairro na lista de áreas de entrega", 400, "AREA_ENTREGA_OBRIGATORIA");
    } else if (!bairro || !cidade) {
      throw new AppError("Informe bairro e cidade", 400, "ENDERECO_INVALIDO");
    }

    return {
      areaEntregaId: endereco.areaEntregaId,
      taxa,
      endereco: {
        cep: endereco.cep,
        logradouro: endereco.logradouro,
        numero: endereco.numero,
        complemento: endereco.complemento,
        bairro: bairro!,
        cidade: cidade!,
        estado: endereco.estado,
        referencia: endereco.referencia,
      },
    };
  }

  // Só pedidos feitos pelo site aparecem aqui
  private async pedidoDoSite(pizzariaId: string, pedidoId: string): Promise<PedidoSite> {
    const pedido = await pedidoRepository.findById(pizzariaId, pedidoId);
    if (!pedido || pedido.origem !== "site") throw PEDIDO_NAO_ENCONTRADO();

    const [[comItens], pagamentos] = await Promise.all([
      pedidoRepository.comItens(pizzariaId, [pedido]),
      pagamentoRepository.listar(pizzariaId, { pedidoId }),
    ]);
    const pagamento = pagamentos.find((p) => p.status !== "estornado") ?? null;
    return paraSite(comItens, pagamento && { forma: pagamento.forma, troco_para: pagamento.troco_para, status: pagamento.status });
  }
}

function paraSite(pedido: PedidoComItens, pagamento: PedidoSite["pagamento"]): PedidoSite {
  return {
    id: pedido.id,
    numero: pedido.numero,
    tipo: pedido.tipo,
    status: pedido.status,
    cliente_nome: pedido.cliente_nome,
    endereco_entrega: pedido.endereco_entrega,
    observacao: pedido.observacao,
    itens: pedido.itens.map((item) => ({
      descricao: item.descricao,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      preco_total: item.preco_total,
      observacao: item.observacao,
      adicionais: item.adicionais.map((a) => ({ nome: a.nome, quantidade: a.quantidade, preco: a.preco })),
    })),
    subtotal: pedido.subtotal,
    desconto: pedido.desconto,
    taxa_entrega: pedido.taxa_entrega,
    total: pedido.total,
    pagamento,
    criado_em: pedido.criado_em,
    aceito_em: pedido.aceito_em,
    preparo_em: pedido.preparo_em,
    pronto_em: pedido.pronto_em,
    saiu_em: pedido.saiu_em,
    finalizado_em: pedido.finalizado_em,
    cancelado_em: pedido.cancelado_em,
    motivo_cancelamento: pedido.motivo_cancelamento,
  };
}

export const siteService = new siteservice();
