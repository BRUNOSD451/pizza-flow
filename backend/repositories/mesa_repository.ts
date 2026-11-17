import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";

export interface Mesa {
  id: string;
  pizzaria_id: string;
  nome: string;
  lugares: number | null;
  ativo: boolean;
  atualizado_em: Date;
  // Comanda aberta agora nesta mesa (no máximo uma), para o mapa de mesas do garçom
  comanda_aberta_id: string | null;
}

export interface CriarMesaDados {
  nome: string;
  lugares: number | null;
}

export interface EditarMesaDados {
  nome?: string;
  lugares?: number | null;
  ativo?: boolean;
}

// comandas.mesa_aberta_id só é preenchida enquanto a comanda está aberta
const SELECT_MESA = `SELECT m.id, m.pizzaria_id, m.nome, m.lugares, m.ativo, m.atualizado_em, co.id AS comanda_aberta_id
  FROM mesas m
  LEFT JOIN comandas co ON co.pizzaria_id = m.pizzaria_id AND co.mesa_aberta_id = m.id`;

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toMesa(row: RowDataPacket): Mesa {
  return { ...row, ativo: Boolean(row.ativo) } as Mesa;
}

class mesarepository {
  async create(pizzariaId: string, dados: CriarMesaDados, conn: Executor = db): Promise<Mesa> {
    const id = randomUUID();
    await conn.execute("INSERT INTO mesas (id, pizzaria_id, nome, lugares) VALUES (?, ?, ?, ?)", [
      id,
      pizzariaId,
      dados.nome,
      dados.lugares,
    ]);
    return (await this.findById(pizzariaId, id, conn))!;
  }

  // Ativas primeiro; nomes como "2" e "10" ficam em ordem numérica
  async listByPizzaria(pizzariaId: string, conn: Executor = db): Promise<Mesa[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `${SELECT_MESA} WHERE m.pizzaria_id = ? ORDER BY m.ativo DESC, LENGTH(m.nome), m.nome`,
      [pizzariaId]
    );
    return rows.map(toMesa);
  }

  // Filtrar por pizzariaId impede usar mesa de outra pizzaria mesmo sabendo o id
  async findById(pizzariaId: string, id: string, conn: Executor = db): Promise<Mesa | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(`${SELECT_MESA} WHERE m.pizzaria_id = ? AND m.id = ?`, [
      pizzariaId,
      id,
    ]);
    return rows[0] ? toMesa(rows[0]) : null;
  }

  // Só atualiza os campos enviados; devolve null se a mesa não existir nesta pizzaria
  async edit(pizzariaId: string, id: string, dados: EditarMesaDados, conn: Executor = db): Promise<Mesa | null> {
    const colunas: [string, string | number | boolean | null | undefined][] = [
      ["nome", dados.nome],
      ["lugares", dados.lugares],
      ["ativo", dados.ativo],
    ];
    const enviados = colunas.filter(([, valor]) => valor !== undefined);

    if (enviados.length > 0) {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE mesas SET ${enviados.map(([coluna]) => `${coluna} = ?`).join(", ")} WHERE pizzaria_id = ? AND id = ?`,
        [...enviados.map(([, valor]) => valor ?? null), pizzariaId, id]
      );
      if (result.affectedRows === 0) return null;
    }

    return this.findById(pizzariaId, id, conn);
  }
}

export const mesaRepository = new mesarepository();
