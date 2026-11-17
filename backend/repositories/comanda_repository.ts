import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { db, type Executor } from "../db/db";

export const STATUS_COMANDA = ["aberta", "fechada", "cancelada"] as const;
export type StatusComanda = (typeof STATUS_COMANDA)[number];

// subtotal = soma dos pedidos não cancelados; total = subtotal + taxa_servico.
// Valores em dinheiro chegam do MySQL como string ("45.90")
export interface Comanda {
  id: string;
  pizzaria_id: string;
  mesa_id: string;
  mesa_nome: string;
  // Quem abriu a comanda
  garcom_id: string;
  garcom_nome: string;
  status: StatusComanda;
  pessoas: number | null;
  taxa_servico: string;
  subtotal: string;
  valor_pago: string;
  aberta_em: Date;
  fechada_em: Date | null;
  atualizado_em: Date;
}

// O mínimo para decidir uma ação, lido com a linha travada
export interface ComandaParaAlterar {
  id: string;
  status: StatusComanda;
  taxa_servico: string;
}

export interface CriarComandaDados {
  mesaId: string;
  garcomId: string;
  pessoas: number | null;
}

export interface ListarComandasFiltros {
  status: StatusComanda;
  limit: number;
  offset: number;
}

const SELECT_COMANDA = `SELECT co.id, co.pizzaria_id, co.mesa_id, me.nome AS mesa_nome, co.garcom_id, u.nome AS garcom_nome,
       co.status, co.pessoas, co.taxa_servico, co.aberta_em, co.fechada_em, co.atualizado_em,
       (SELECT COALESCE(SUM(p.total), 0) FROM pedidos p
         WHERE p.pizzaria_id = co.pizzaria_id AND p.comanda_id = co.id AND p.status <> 'cancelado') AS subtotal,
       (SELECT COALESCE(SUM(pg.valor), 0) FROM pagamentos pg
         WHERE pg.pizzaria_id = co.pizzaria_id AND pg.comanda_id = co.id AND pg.status = 'pago') AS valor_pago
  FROM comandas co
  JOIN mesas me   ON me.pizzaria_id = co.pizzaria_id AND me.id = co.mesa_id
  JOIN membros mb ON mb.pizzaria_id = co.pizzaria_id AND mb.id = co.garcom_id
  JOIN usuarios u ON u.id = mb.usuario_id`;

class comandarepository {
  async create(pizzariaId: string, dados: CriarComandaDados, conn: Executor = db): Promise<string> {
    const id = randomUUID();
    await conn.execute("INSERT INTO comandas (id, pizzaria_id, mesa_id, garcom_id, pessoas) VALUES (?, ?, ?, ?, ?)", [
      id,
      pizzariaId,
      dados.mesaId,
      dados.garcomId,
      dados.pessoas,
    ]);
    return id;
  }

  // Abertas em ordem de mesa (mapa do salão); fechadas e canceladas, as mais recentes primeiro
  async listar(pizzariaId: string, filtros: ListarComandasFiltros, conn: Executor = db): Promise<Comanda[]> {
    const ordem = filtros.status === "aberta" ? "LENGTH(me.nome), me.nome" : "co.aberta_em DESC";
    // query (e não execute): prepared statements do MySQL não aceitam LIMIT como parâmetro numérico
    const [rows] = await conn.query<RowDataPacket[]>(
      `${SELECT_COMANDA} WHERE co.pizzaria_id = ? AND co.status = ? ORDER BY ${ordem} LIMIT ? OFFSET ?`,
      [pizzariaId, filtros.status, filtros.limit, filtros.offset]
    );
    return rows as Comanda[];
  }

  // Filtrar por pizzariaId impede acessar comanda de outra pizzaria mesmo sabendo o id
  async findById(pizzariaId: string, id: string, conn: Executor = db): Promise<Comanda | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(`${SELECT_COMANDA} WHERE co.pizzaria_id = ? AND co.id = ?`, [
      pizzariaId,
      id,
    ]);
    return (rows[0] as Comanda | undefined) ?? null;
  }

  // Trava a comanda até o fim da transação: lançar pedido, fechar e pagar não se atropelam
  async bloquear(pizzariaId: string, id: string, conn: Executor): Promise<ComandaParaAlterar | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      "SELECT id, status, taxa_servico FROM comandas WHERE pizzaria_id = ? AND id = ? FOR UPDATE",
      [pizzariaId, id]
    );
    return (rows[0] as ComandaParaAlterar | undefined) ?? null;
  }

  // Soma dos pedidos não cancelados (sem a taxa de serviço)
  async somarPedidos(pizzariaId: string, id: string, conn: Executor = db): Promise<string> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(total), 0) AS subtotal FROM pedidos
        WHERE pizzaria_id = ? AND comanda_id = ? AND status <> 'cancelado'`,
      [pizzariaId, id]
    );
    return String(rows[0].subtotal);
  }

  // Fechar ou cancelar libera a mesa (mesa_aberta_id volta a NULL)
  async encerrar(
    pizzariaId: string,
    id: string,
    status: "fechada" | "cancelada",
    taxaServico: string,
    conn: Executor = db
  ): Promise<void> {
    await conn.execute(
      "UPDATE comandas SET status = ?, taxa_servico = ?, fechada_em = NOW() WHERE pizzaria_id = ? AND id = ?",
      [status, taxaServico, pizzariaId, id]
    );
  }
}

export const comandaRepository = new comandarepository();
