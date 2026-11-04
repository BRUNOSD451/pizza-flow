import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";

// taxa chega do MySQL como string ("5.00") e fica assim, para não fazer conta com float
export interface AreaEntrega {
  id: string;
  pizzaria_id: string;
  bairro: string;
  cidade: string;
  taxa: string;
  tempo_estimado_min: number | null;
  ativo: boolean;
  atualizado_em: Date;
}

export interface CriarAreaEntregaDados {
  bairro: string;
  cidade: string;
  taxa: string;
  tempoEstimadoMin: number | null;
}

export interface EditarAreaEntregaDados {
  bairro?: string;
  cidade?: string;
  taxa?: string;
  tempoEstimadoMin?: number | null;
  ativo?: boolean;
}

const COLUNAS = "id, pizzaria_id, bairro, cidade, taxa, tempo_estimado_min, ativo, atualizado_em";

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toAreaEntrega(row: RowDataPacket): AreaEntrega {
  return { ...row, ativo: Boolean(row.ativo) } as AreaEntrega;
}

class areaentregarepository {
  async create(pizzariaId: string, dados: CriarAreaEntregaDados, conn: Executor = db): Promise<AreaEntrega> {
    const id = randomUUID();
    await conn.execute(
      `INSERT INTO areas_entrega (id, pizzaria_id, bairro, cidade, taxa, tempo_estimado_min) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, pizzariaId, dados.bairro, dados.cidade, dados.taxa, dados.tempoEstimadoMin]
    );
    return (await this.findById(pizzariaId, id, conn))!;
  }

  // Ativas primeiro, em ordem alfabética para o atendente achar o bairro rápido
  async listByPizzaria(pizzariaId: string, conn: Executor = db): Promise<AreaEntrega[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM areas_entrega WHERE pizzaria_id = ? ORDER BY ativo DESC, cidade, bairro`,
      [pizzariaId]
    );
    return rows.map(toAreaEntrega);
  }

  // Filtrar por pizzariaId impede usar área de outra pizzaria mesmo sabendo o id
  async findById(pizzariaId: string, id: string, conn: Executor = db): Promise<AreaEntrega | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM areas_entrega WHERE pizzaria_id = ? AND id = ?`,
      [pizzariaId, id]
    );
    return rows[0] ? toAreaEntrega(rows[0]) : null;
  }

  // Só atualiza os campos enviados; devolve null se a área não existir nesta pizzaria
  async edit(pizzariaId: string, id: string, dados: EditarAreaEntregaDados, conn: Executor = db): Promise<AreaEntrega | null> {
    const colunas: [string, string | number | boolean | null | undefined][] = [
      ["bairro", dados.bairro],
      ["cidade", dados.cidade],
      ["taxa", dados.taxa],
      ["tempo_estimado_min", dados.tempoEstimadoMin],
      ["ativo", dados.ativo],
    ];
    const enviados = colunas.filter(([, valor]) => valor !== undefined);

    if (enviados.length > 0) {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE areas_entrega SET ${enviados.map(([coluna]) => `${coluna} = ?`).join(", ")} WHERE pizzaria_id = ? AND id = ?`,
        [...enviados.map(([, valor]) => valor ?? null), pizzariaId, id]
      );
      if (result.affectedRows === 0) return null;
    }

    return this.findById(pizzariaId, id, conn);
  }
}

export const areaEntregaRepository = new areaentregarepository();
