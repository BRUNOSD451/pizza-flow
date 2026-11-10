import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";

// Cliente final da pizzaria, identificado pelo telefone (só dígitos, com DDD). Não é um usuário do sistema.
export interface Cliente {
  id: string;
  pizzaria_id: string;
  nome: string;
  telefone: string;
  email: string | null;
  observacoes: string | null;
  criado_em: Date;
  atualizado_em: Date;
}

export interface CriarClienteDados {
  nome: string;
  telefone: string;
  email: string | null;
  observacoes: string | null;
}

export type EditarClienteDados = Partial<CriarClienteDados>;

export interface ListarClientesFiltros {
  busca?: string;
  limit: number;
  offset: number;
}

const COLUNAS = "id, pizzaria_id, nome, telefone, email, observacoes, criado_em, atualizado_em";

// % e _ digitados na busca são texto comum, não curingas do LIKE
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, "\\$&");
}

class clienterepository {
  async create(pizzariaId: string, dados: CriarClienteDados, conn: Executor = db): Promise<Cliente> {
    const id = randomUUID();
    await conn.execute(
      "INSERT INTO clientes (id, pizzaria_id, nome, telefone, email, observacoes) VALUES (?, ?, ?, ?, ?, ?)",
      [id, pizzariaId, dados.nome, dados.telefone, dados.email, dados.observacoes]
    );
    return (await this.findById(pizzariaId, id, conn))!;
  }

  // Busca por parte do nome ou do telefone, para o atendente achar o cliente durante o pedido
  async listByPizzaria(pizzariaId: string, filtros: ListarClientesFiltros, conn: Executor = db): Promise<Cliente[]> {
    const condicoes = ["pizzaria_id = ?"];
    const params: (string | number)[] = [pizzariaId];

    if (filtros.busca) {
      const digitos = filtros.busca.replace(/\D/g, "");
      const alternativas = ["nome LIKE ?"];
      params.push(`%${escaparLike(filtros.busca)}%`);
      if (digitos) {
        alternativas.push("telefone LIKE ?");
        params.push(`%${digitos}%`);
      }
      condicoes.push(`(${alternativas.join(" OR ")})`);
    }

    // query (e não execute): prepared statements do MySQL não aceitam LIMIT como parâmetro numérico
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM clientes WHERE ${condicoes.join(" AND ")} ORDER BY nome LIMIT ? OFFSET ?`,
      [...params, filtros.limit, filtros.offset]
    );
    return rows as Cliente[];
  }

  // Filtrar por pizzariaId impede acessar cliente de outra pizzaria mesmo sabendo o id
  async findById(pizzariaId: string, id: string, conn: Executor = db): Promise<Cliente | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM clientes WHERE pizzaria_id = ? AND id = ?`,
      [pizzariaId, id]
    );
    return (rows[0] as Cliente | undefined) ?? null;
  }

  // Só atualiza os campos enviados; devolve null se o cliente não existir nesta pizzaria
  async edit(pizzariaId: string, id: string, dados: EditarClienteDados, conn: Executor = db): Promise<Cliente | null> {
    const colunas: [string, string | null | undefined][] = [
      ["nome", dados.nome],
      ["telefone", dados.telefone],
      ["email", dados.email],
      ["observacoes", dados.observacoes],
    ];
    const enviados = colunas.filter(([, valor]) => valor !== undefined);

    if (enviados.length > 0) {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE clientes SET ${enviados.map(([coluna]) => `${coluna} = ?`).join(", ")} WHERE pizzaria_id = ? AND id = ?`,
        [...enviados.map(([, valor]) => valor ?? null), pizzariaId, id]
      );
      if (result.affectedRows === 0) return null;
    }

    return this.findById(pizzariaId, id, conn);
  }
}

export const clienteRepository = new clienterepository();
