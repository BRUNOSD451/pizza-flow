import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { db, type Executor } from "../db/db";

export const FORMAS_PAGAMENTO = ["dinheiro", "pix", "credito", "debito", "vale"] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const STATUS_PAGAMENTO = ["pendente", "pago", "estornado"] as const;
export type StatusPagamento = (typeof STATUS_PAGAMENTO)[number];

// Um pagamento é de um pedido OU de uma comanda (CHECK no banco).
// pendente = combinado para depois (ex.: paga na entrega); estornado = devolvido ou cancelado
export interface Pagamento {
  id: string;
  pizzaria_id: string;
  pedido_id: string | null;
  comanda_id: string | null;
  forma: FormaPagamento;
  valor: string;
  troco_para: string | null;
  status: StatusPagamento;
  pago_em: Date | null;
  atualizado_em: Date;
}

export type AlvoPagamento = { pedidoId: string } | { comandaId: string };

export interface CriarPagamentoDados {
  forma: FormaPagamento;
  valor: string;
  trocoPara: string | null;
  status: "pendente" | "pago";
}

export interface AlterarPagamentoDados {
  status: StatusPagamento;
  forma?: FormaPagamento;
  // Só faz sentido em dinheiro; trocar a forma para outra limpa o troco
  trocoPara?: string | null;
}

// Soma em centavos já vem como string ("45.90") do MySQL
export interface SomaPagamentos {
  pago: string;
  pendente: string;
}

const COLUNAS = "id, pizzaria_id, pedido_id, comanda_id, forma, valor, troco_para, status, pago_em, atualizado_em";

function filtroAlvo(alvo: AlvoPagamento): { coluna: string; id: string } {
  return "pedidoId" in alvo ? { coluna: "pedido_id", id: alvo.pedidoId } : { coluna: "comanda_id", id: alvo.comandaId };
}

class pagamentorepository {
  async create(pizzariaId: string, alvo: AlvoPagamento, dados: CriarPagamentoDados, conn: Executor = db): Promise<Pagamento> {
    const id = randomUUID();
    await conn.execute(
      `INSERT INTO pagamentos (id, pizzaria_id, pedido_id, comanda_id, forma, valor, troco_para, status, pago_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, IF(? = 'pago', NOW(), NULL))`,
      [
        id,
        pizzariaId,
        "pedidoId" in alvo ? alvo.pedidoId : null,
        "comandaId" in alvo ? alvo.comandaId : null,
        dados.forma,
        dados.valor,
        dados.trocoPara,
        dados.status,
        dados.status,
      ]
    );
    return (await this.findById(pizzariaId, alvo, id, conn))!;
  }

  // Exige o alvo junto: impede mexer, por um pedido, no pagamento de outro
  async findById(pizzariaId: string, alvo: AlvoPagamento, id: string, conn: Executor = db): Promise<Pagamento | null> {
    const { coluna, id: alvoId } = filtroAlvo(alvo);
    // `coluna` vem de filtroAlvo, fixa no código
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM pagamentos WHERE pizzaria_id = ? AND ${coluna} = ? AND id = ?`,
      [pizzariaId, alvoId, id]
    );
    return (rows[0] as Pagamento | undefined) ?? null;
  }

  async listar(pizzariaId: string, alvo: AlvoPagamento, conn: Executor = db): Promise<Pagamento[]> {
    const { coluna, id } = filtroAlvo(alvo);
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM pagamentos WHERE pizzaria_id = ? AND ${coluna} = ? ORDER BY atualizado_em, id`,
      [pizzariaId, id]
    );
    return rows as Pagamento[];
  }

  async somar(pizzariaId: string, alvo: AlvoPagamento, conn: Executor = db): Promise<SomaPagamentos> {
    const { coluna, id } = filtroAlvo(alvo);
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(IF(status = 'pago', valor, 0)), 0)     AS pago,
              COALESCE(SUM(IF(status = 'pendente', valor, 0)), 0) AS pendente
         FROM pagamentos WHERE pizzaria_id = ? AND ${coluna} = ?`,
      [pizzariaId, id]
    );
    return { pago: String(rows[0].pago), pendente: String(rows[0].pendente) };
  }

  // pago_em marca o momento em que o dinheiro entrou
  async alterar(pizzariaId: string, id: string, dados: AlterarPagamentoDados, conn: Executor = db): Promise<void> {
    const campos = ["status = ?", "pago_em = IF(? = 'pago', NOW(), pago_em)"];
    const valores: (string | null)[] = [dados.status, dados.status];
    if (dados.forma !== undefined) {
      campos.push("forma = ?");
      valores.push(dados.forma);
    }
    if (dados.trocoPara !== undefined) {
      campos.push("troco_para = ?");
      valores.push(dados.trocoPara);
    }
    await conn.execute(`UPDATE pagamentos SET ${campos.join(", ")} WHERE pizzaria_id = ? AND id = ?`, [
      ...valores,
      pizzariaId,
      id,
    ]);
  }
}

export const pagamentoRepository = new pagamentorepository();
