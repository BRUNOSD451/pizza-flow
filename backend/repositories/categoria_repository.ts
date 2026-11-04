import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";

export type TipoCategoria = "pizza" | "produto";

export interface Categoria {
  id: string;
  pizzaria_id: string;
  nome: string;
  tipo: TipoCategoria;
  ordem: number;
  ativo: boolean;
  atualizado_em: Date;
}

export interface CriarCategoriaDados {
  nome: string;
  tipo: TipoCategoria;
  ordem: number;
}

// tipo não muda: sabores e produtos já ligados à categoria ficariam no tipo errado
export interface EditarCategoriaDados {
  nome?: string;
  ordem?: number;
  ativo?: boolean;
}

const COLUNAS = "id, pizzaria_id, nome, tipo, ordem, ativo, atualizado_em";

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toCategoria(row: RowDataPacket): Categoria {
  return { ...row, ativo: Boolean(row.ativo) } as Categoria;
}

class categoriarepository {
  async create(pizzariaId: string, dados: CriarCategoriaDados, conn: Executor = db): Promise<Categoria> {
    const id = randomUUID();
    await conn.execute(
      `INSERT INTO categorias (id, pizzaria_id, nome, tipo, ordem) VALUES (?, ?, ?, ?, ?)`,
      [id, pizzariaId, dados.nome, dados.tipo, dados.ordem]
    );
    return (await this.findById(pizzariaId, id, conn))!;
  }

  // Filtrar por pizzariaId impede usar categoria de outra pizzaria mesmo sabendo o id
  async findById(pizzariaId: string, id: string, conn: Executor = db): Promise<Categoria | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM categorias WHERE pizzaria_id = ? AND id = ?`,
      [pizzariaId, id]
    );
    return rows[0] ? toCategoria(rows[0]) : null;
  }

  // Pizza antes de produto; dentro de cada tipo, pela ordem definida pela pizzaria
  async listByPizzaria(pizzariaId: string, conn: Executor = db): Promise<Categoria[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM categorias WHERE pizzaria_id = ? ORDER BY tipo = 'produto', ordem, nome`,
      [pizzariaId]
    );
    return rows.map(toCategoria);
  }

  // Só atualiza os campos enviados; devolve null se a categoria não existir nesta pizzaria
  async edit(pizzariaId: string, id: string, dados: EditarCategoriaDados, conn: Executor = db): Promise<Categoria | null> {
    const colunas: [string, string | number | boolean | undefined][] = [
      ["nome", dados.nome],
      ["ordem", dados.ordem],
      ["ativo", dados.ativo],
    ];
    const enviados = colunas.filter(([, valor]) => valor !== undefined);

    if (enviados.length > 0) {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE categorias SET ${enviados.map(([coluna]) => `${coluna} = ?`).join(", ")} WHERE pizzaria_id = ? AND id = ?`,
        [...enviados.map(([, valor]) => valor ?? null), pizzariaId, id]
      );
      if (result.affectedRows === 0) return null;
    }

    return this.findById(pizzariaId, id, conn);
  }
}

export const categoriaRepository = new categoriarepository();
