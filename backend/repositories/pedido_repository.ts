import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { db, type Executor } from "../db/db";
import type { ItemCalculado, TotaisPedido } from "../services/pedido_calculo";
import type { StatusPedido, TipoPedido } from "../services/pedido_transicoes";

export type OrigemPedido = "balcao" | "salao" | "site" | "whatsapp" | "ifood";

// Cópia do endereço no momento do pedido: mudar o cadastro do cliente não altera pedidos antigos
export interface EnderecoEntrega {
  cep: string | null;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
  referencia: string | null;
}

// Valores em dinheiro chegam como string ("45.90"), como o mysql2 devolve DECIMAL
export interface Pedido {
  id: string;
  pizzaria_id: string;
  numero: number;
  chave_idempotencia: string | null;
  tipo: TipoPedido;
  origem: OrigemPedido;
  status: StatusPedido;
  cliente_id: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  criado_por: string | null;
  entregador_id: string | null;
  comanda_id: string | null;
  area_entrega_id: string | null;
  endereco_entrega: EnderecoEntrega | null;
  subtotal: string;
  desconto: string;
  taxa_entrega: string;
  total: string;
  observacao: string | null;
  criado_em: Date;
  aceito_em: Date | null;
  preparo_em: Date | null;
  pronto_em: Date | null;
  saiu_em: Date | null;
  finalizado_em: Date | null;
  cancelado_em: Date | null;
  motivo_cancelamento: string | null;
  atualizado_em: Date;
}

export interface PedidoItemSabor {
  sabor_id: string;
  nome_sabor: string;
  partes: number;
  preco_referencia: string;
}

export interface PedidoItemAdicional {
  adicional_id: string;
  nome: string;
  quantidade: number;
  preco: string;
}

export interface PedidoItem {
  id: string;
  tipo: "pizza" | "produto";
  tamanho_id: string | null;
  borda_id: string | null;
  produto_id: string | null;
  total_partes: number | null;
  descricao: string;
  quantidade: number;
  preco_unitario: string;
  preco_total: string;
  observacao: string | null;
  sabores: PedidoItemSabor[];
  adicionais: PedidoItemAdicional[];
}

export interface PedidoComItens extends Pedido {
  itens: PedidoItem[];
}

export interface PedidoEvento {
  id: string;
  status_anterior: StatusPedido | null;
  status_novo: StatusPedido;
  membro_id: string | null;
  criado_em: Date;
}

// O mínimo para decidir uma transição, lido com a linha travada
export interface PedidoParaAlterar {
  id: string;
  status: StatusPedido;
  tipo: TipoPedido;
  entregador_id: string | null;
}

export interface CriarPedidoDados {
  numero: number;
  chaveIdempotencia: string;
  tipo: TipoPedido;
  origem: OrigemPedido;
  clienteId: string | null;
  criadoPor: string;
  areaEntregaId: string | null;
  enderecoEntrega: EnderecoEntrega | null;
  totais: TotaisPedido;
  observacao: string | null;
}

export interface ListarPedidosFiltros {
  status?: StatusPedido[];
  tipo?: TipoPedido;
  de?: Date;
  ate?: Date;
  limit: number;
  offset: number;
}

const COLUNAS = `p.id, p.pizzaria_id, p.numero, p.chave_idempotencia, p.tipo, p.origem, p.status,
  p.cliente_id, p.criado_por, p.entregador_id, p.comanda_id, p.area_entrega_id, p.endereco_entrega,
  p.subtotal, p.desconto, p.taxa_entrega, p.total, p.observacao, p.criado_em, p.aceito_em, p.preparo_em,
  p.pronto_em, p.saiu_em, p.finalizado_em, p.cancelado_em, p.motivo_cancelamento, p.atualizado_em`;

const SELECT_PEDIDO = `SELECT ${COLUNAS}, c.nome AS cliente_nome, c.telefone AS cliente_telefone
  FROM pedidos p
  LEFT JOIN clientes c ON c.pizzaria_id = p.pizzaria_id AND c.id = p.cliente_id`;

// Coluna de data preenchida quando o pedido chega em cada status
const COLUNA_DATA_STATUS: Partial<Record<StatusPedido, string>> = {
  recebido: "aceito_em",
  preparando: "preparo_em",
  pronto: "pronto_em",
  saiu_para_entrega: "saiu_em",
  finalizado: "finalizado_em",
  cancelado: "cancelado_em",
};

function marcadores(valores: unknown[]): string {
  return valores.map(() => "?").join(", ");
}

class pedidorepository {
  async create(pizzariaId: string, dados: CriarPedidoDados, conn: Executor = db): Promise<string> {
    const id = randomUUID();
    // Pedidos internos já nascem aceitos
    await conn.execute(
      `INSERT INTO pedidos (id, pizzaria_id, numero, chave_idempotencia, tipo, origem, status, cliente_id, criado_por,
                            area_entrega_id, endereco_entrega, subtotal, desconto, taxa_entrega, total, observacao, aceito_em)
       VALUES (?, ?, ?, ?, ?, ?, 'recebido', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        pizzariaId,
        dados.numero,
        dados.chaveIdempotencia,
        dados.tipo,
        dados.origem,
        dados.clienteId,
        dados.criadoPor,
        dados.areaEntregaId,
        dados.enderecoEntrega ? JSON.stringify(dados.enderecoEntrega) : null,
        dados.totais.subtotal,
        dados.totais.desconto,
        dados.totais.taxaEntrega,
        dados.totais.total,
        dados.observacao,
      ]
    );
    return id;
  }

  async inserirItens(pizzariaId: string, pedidoId: string, itens: ItemCalculado[], conn: Executor = db): Promise<void> {
    const comId = itens.map((item) => ({ id: randomUUID(), item }));

    await conn.execute(
      `INSERT INTO pedido_itens (id, pizzaria_id, pedido_id, tipo, tamanho_id, borda_id, produto_id, total_partes,
                                 descricao, quantidade, preco_unitario, preco_total, observacao)
       VALUES ${comId.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
      comId.flatMap(({ id, item }) => [
        id,
        pizzariaId,
        pedidoId,
        item.tipo,
        item.tamanhoId,
        item.bordaId,
        item.produtoId,
        item.totalPartes,
        item.descricao,
        item.quantidade,
        item.precoUnitario,
        item.precoTotal,
        item.observacao,
      ])
    );

    const sabores = comId.flatMap(({ id, item }) => item.sabores.map((sabor) => ({ itemId: id, sabor })));
    if (sabores.length > 0) {
      await conn.execute(
        `INSERT INTO pedido_item_sabores (id, pizzaria_id, pedido_item_id, sabor_id, nome_sabor, partes, preco_referencia)
         VALUES ${sabores.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
        sabores.flatMap(({ itemId, sabor }) => [
          randomUUID(),
          pizzariaId,
          itemId,
          sabor.saborId,
          sabor.nomeSabor,
          sabor.partes,
          sabor.precoReferencia,
        ])
      );
    }

    const adicionais = comId.flatMap(({ id, item }) => item.adicionais.map((adicional) => ({ itemId: id, adicional })));
    if (adicionais.length > 0) {
      await conn.execute(
        `INSERT INTO pedido_item_adicionais (id, pizzaria_id, pedido_item_id, adicional_id, nome, quantidade, preco)
         VALUES ${adicionais.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
        adicionais.flatMap(({ itemId, adicional }) => [
          randomUUID(),
          pizzariaId,
          itemId,
          adicional.adicionalId,
          adicional.nome,
          adicional.quantidade,
          adicional.preco,
        ])
      );
    }
  }

  // membroId null = mudança automática ou feita pelo site
  async inserirEvento(
    pizzariaId: string,
    pedidoId: string,
    statusAnterior: StatusPedido | null,
    statusNovo: StatusPedido,
    membroId: string | null,
    conn: Executor = db
  ): Promise<void> {
    await conn.execute(
      `INSERT INTO pedido_eventos (id, pizzaria_id, pedido_id, status_anterior, status_novo, membro_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), pizzariaId, pedidoId, statusAnterior, statusNovo, membroId]
    );
  }

  // Filtrar por pizzariaId impede acessar pedido de outra pizzaria mesmo sabendo o id
  async findById(pizzariaId: string, id: string, conn: Executor = db): Promise<Pedido | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(`${SELECT_PEDIDO} WHERE p.pizzaria_id = ? AND p.id = ?`, [
      pizzariaId,
      id,
    ]);
    return (rows[0] as Pedido | undefined) ?? null;
  }

  async findIdByChave(pizzariaId: string, chave: string, conn: Executor = db): Promise<string | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      "SELECT id FROM pedidos WHERE pizzaria_id = ? AND chave_idempotencia = ?",
      [pizzariaId, chave]
    );
    return rows[0]?.id ?? null;
  }

  // Trava só a linha do pedido até o fim da transação: duas mudanças de status não se atropelam
  async bloquear(pizzariaId: string, id: string, conn: Executor): Promise<PedidoParaAlterar | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      "SELECT id, status, tipo, entregador_id FROM pedidos WHERE pizzaria_id = ? AND id = ? FOR UPDATE",
      [pizzariaId, id]
    );
    return (rows[0] as PedidoParaAlterar | undefined) ?? null;
  }

  async atualizarStatus(
    pizzariaId: string,
    id: string,
    status: StatusPedido,
    motivoCancelamento: string | null,
    conn: Executor = db
  ): Promise<void> {
    // COLUNA_DATA_STATUS é fixa no código: nada vindo da requisição entra no SQL
    const coluna = COLUNA_DATA_STATUS[status];
    const campoData = coluna ? `, ${coluna} = NOW()` : "";
    await conn.execute(
      `UPDATE pedidos SET status = ?, motivo_cancelamento = COALESCE(?, motivo_cancelamento)${campoData}
        WHERE pizzaria_id = ? AND id = ?`,
      [status, motivoCancelamento, pizzariaId, id]
    );
  }

  async atribuirEntregador(pizzariaId: string, id: string, entregadorId: string | null, conn: Executor = db): Promise<void> {
    await conn.execute("UPDATE pedidos SET entregador_id = ? WHERE pizzaria_id = ? AND id = ?", [entregadorId, pizzariaId, id]);
  }

  // Mais recentes primeiro
  async listar(pizzariaId: string, filtros: ListarPedidosFiltros, conn: Executor = db): Promise<Pedido[]> {
    const condicoes = ["p.pizzaria_id = ?"];
    const params: (string | number | Date)[] = [pizzariaId];

    if (filtros.status?.length) {
      condicoes.push(`p.status IN (${marcadores(filtros.status)})`);
      params.push(...filtros.status);
    }
    if (filtros.tipo) {
      condicoes.push("p.tipo = ?");
      params.push(filtros.tipo);
    }
    if (filtros.de) {
      condicoes.push("p.criado_em >= ?");
      params.push(filtros.de);
    }
    if (filtros.ate) {
      condicoes.push("p.criado_em <= ?");
      params.push(filtros.ate);
    }

    // query (e não execute): prepared statements do MySQL não aceitam LIMIT como parâmetro numérico
    const [rows] = await conn.query<RowDataPacket[]>(
      `${SELECT_PEDIDO} WHERE ${condicoes.join(" AND ")} ORDER BY p.criado_em DESC, p.numero DESC LIMIT ? OFFSET ?`,
      [...params, filtros.limit, filtros.offset]
    );
    return rows as Pedido[];
  }

  // Fila em andamento: os mais antigos primeiro
  async listarPorStatus(pizzariaId: string, status: StatusPedido[], conn: Executor = db): Promise<Pedido[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `${SELECT_PEDIDO} WHERE p.pizzaria_id = ? AND p.status IN (${marcadores(status)}) ORDER BY p.criado_em, p.numero`,
      [pizzariaId, ...status]
    );
    return rows as Pedido[];
  }

  async listarDoEntregador(
    pizzariaId: string,
    entregadorId: string,
    status: StatusPedido[],
    conn: Executor = db
  ): Promise<Pedido[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `${SELECT_PEDIDO}
        WHERE p.pizzaria_id = ? AND p.entregador_id = ? AND p.status IN (${marcadores(status)})
        ORDER BY p.criado_em, p.numero`,
      [pizzariaId, entregadorId, ...status]
    );
    return rows as Pedido[];
  }

  async listarEventos(pizzariaId: string, pedidoId: string, conn: Executor = db): Promise<PedidoEvento[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT id, status_anterior, status_novo, membro_id, criado_em
         FROM pedido_eventos
        WHERE pizzaria_id = ? AND pedido_id = ?
        ORDER BY criado_em`,
      [pizzariaId, pedidoId]
    );
    return rows as PedidoEvento[];
  }

  // Busca itens, sabores e adicionais de todos os pedidos em três queries (evita N+1)
  async comItens(pizzariaId: string, pedidos: Pedido[], conn: Executor = db): Promise<PedidoComItens[]> {
    if (pedidos.length === 0) return [];

    const pedidoIds = pedidos.map((p) => p.id);
    const [itens] = await conn.execute<RowDataPacket[]>(
      `SELECT id, pedido_id, tipo, tamanho_id, borda_id, produto_id, total_partes, descricao, quantidade,
              preco_unitario, preco_total, observacao
         FROM pedido_itens
        WHERE pizzaria_id = ? AND pedido_id IN (${marcadores(pedidoIds)})
        ORDER BY tipo, descricao`,
      [pizzariaId, ...pedidoIds]
    );

    const itemIds = itens.map((item) => item.id as string);
    const saboresPorItem = new Map<string, PedidoItemSabor[]>(itemIds.map((id) => [id, []]));
    const adicionaisPorItem = new Map<string, PedidoItemAdicional[]>(itemIds.map((id) => [id, []]));

    if (itemIds.length > 0) {
      const [sabores] = await conn.execute<RowDataPacket[]>(
        `SELECT pedido_item_id, sabor_id, nome_sabor, partes, preco_referencia
           FROM pedido_item_sabores
          WHERE pizzaria_id = ? AND pedido_item_id IN (${marcadores(itemIds)})
          ORDER BY nome_sabor`,
        [pizzariaId, ...itemIds]
      );
      for (const { pedido_item_id, ...sabor } of sabores) {
        saboresPorItem.get(pedido_item_id)!.push(sabor as PedidoItemSabor);
      }

      const [adicionais] = await conn.execute<RowDataPacket[]>(
        `SELECT pedido_item_id, adicional_id, nome, quantidade, preco
           FROM pedido_item_adicionais
          WHERE pizzaria_id = ? AND pedido_item_id IN (${marcadores(itemIds)})
          ORDER BY nome`,
        [pizzariaId, ...itemIds]
      );
      for (const { pedido_item_id, ...adicional } of adicionais) {
        adicionaisPorItem.get(pedido_item_id)!.push(adicional as PedidoItemAdicional);
      }
    }

    const itensPorPedido = new Map<string, PedidoItem[]>(pedidoIds.map((id) => [id, []]));
    for (const { pedido_id, ...item } of itens) {
      itensPorPedido.get(pedido_id)!.push({
        ...(item as Omit<PedidoItem, "sabores" | "adicionais">),
        sabores: saboresPorItem.get(item.id)!,
        adicionais: adicionaisPorItem.get(item.id)!,
      });
    }

    return pedidos.map((pedido) => ({ ...pedido, itens: itensPorPedido.get(pedido.id)! }));
  }
}

export const pedidoRepository = new pedidorepository();
