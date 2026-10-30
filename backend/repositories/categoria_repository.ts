import type { RowDataPacket } from "mysql2/promise";
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

const COLUNAS = "id, pizzaria_id, nome, tipo, ordem, ativo, atualizado_em";

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toCategoria(row: RowDataPacket): Categoria {
  return { ...row, ativo: Boolean(row.ativo) } as Categoria;
}

class categoriarepository {
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
}

export const categoriaRepository = new categoriarepository();
