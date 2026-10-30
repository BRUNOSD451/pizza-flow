import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";

export interface Tamanho {
  id: string;
  pizzaria_id: string;
  nome: string;
  fatias: number;
  max_sabores: number;
  ordem: number;
  ativo: boolean;
  atualizado_em: Date;
}

export interface CriarTamanhoDados {
  nome: string;
  fatias: number;
  maxSabores: number;
  ordem: number;
}

export interface EditarTamanhoDados {
  nome?: string;
  fatias?: number;
  maxSabores?: number;
  ordem?: number;
  ativo?: boolean;
}

// Preço de um item (sabor, borda) num tamanho, já validado e normalizado com 2 casas ("45.90")
export interface PrecoPorTamanho {
  tamanhoId: string;
  preco: string;
}

const COLUNAS = "id, pizzaria_id, nome, fatias, max_sabores, ordem, ativo, atualizado_em";

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toTamanho(row: RowDataPacket): Tamanho {
  return { ...row, ativo: Boolean(row.ativo) } as Tamanho;
}

class tamanhorepository {
  async create(pizzariaId: string, dados: CriarTamanhoDados, conn: Executor = db): Promise<Tamanho> {
    const id = randomUUID();
    await conn.execute(
      "INSERT INTO tamanhos (id, pizzaria_id, nome, fatias, max_sabores, ordem) VALUES (?, ?, ?, ?, ?, ?)",
      [id, pizzariaId, dados.nome, dados.fatias, dados.maxSabores, dados.ordem]
    );
    return (await this.findById(pizzariaId, id, conn))!;
  }

  // Ativos primeiro, na ordem definida pela pizzaria (ex.: broto, média, grande)
  async listByPizzaria(pizzariaId: string, conn: Executor = db): Promise<Tamanho[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM tamanhos WHERE pizzaria_id = ? ORDER BY ativo DESC, ordem, nome`,
      [pizzariaId]
    );
    return rows.map(toTamanho);
  }

  // Filtrar por pizzariaId impede acessar tamanho de outra pizzaria mesmo sabendo o id
  async findById(pizzariaId: string, id: string, conn: Executor = db): Promise<Tamanho | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM tamanhos WHERE pizzaria_id = ? AND id = ?`,
      [pizzariaId, id]
    );
    return rows[0] ? toTamanho(rows[0]) : null;
  }

  // Usado para validar listas de tamanhos (ex.: preços de um sabor) numa query só
  async findByIds(pizzariaId: string, ids: string[], conn: Executor = db): Promise<Tamanho[]> {
    if (ids.length === 0) return [];
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM tamanhos WHERE pizzaria_id = ? AND id IN (${ids.map(() => "?").join(", ")})`,
      [pizzariaId, ...ids]
    );
    return rows.map(toTamanho);
  }

  // Só atualiza os campos enviados; devolve null se o tamanho não existir nesta pizzaria
  async edit(pizzariaId: string, id: string, dados: EditarTamanhoDados, conn: Executor = db): Promise<Tamanho | null> {
    const colunas: [string, string | number | boolean | undefined][] = [
      ["nome", dados.nome],
      ["fatias", dados.fatias],
      ["max_sabores", dados.maxSabores],
      ["ordem", dados.ordem],
      ["ativo", dados.ativo],
    ];
    const enviados = colunas.filter(([, valor]) => valor !== undefined);

    if (enviados.length > 0) {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE tamanhos SET ${enviados.map(([coluna]) => `${coluna} = ?`).join(", ")} WHERE pizzaria_id = ? AND id = ?`,
        [...enviados.map(([, valor]) => valor!), pizzariaId, id]
      );
      if (result.affectedRows === 0) return null;
    }

    return this.findById(pizzariaId, id, conn);
  }
}

export const tamanhoRepository = new tamanhorepository();
