import type { RowDataPacket } from "mysql2/promise";
import { db, type Executor } from "../db/db";

// dia_semana: 0 = domingo ... 6 = sábado. Horas no fuso da pizzaria, como "HH:MM".
// fecha <= abre = fecha no dia seguinte (ex.: 18:00 → 02:00); fecha = abre = 24 horas
export interface Horario {
  id: string;
  pizzaria_id: string;
  dia_semana: number;
  abre: string;
  fecha: string;
  atualizado_em: Date;
}

export interface HorarioDados {
  diaSemana: number;
  abre: string;
  fecha: string;
}

// TIME volta do MySQL como "18:00:00"; a API usa "18:00"
const COLUNAS = `id, pizzaria_id, dia_semana, TIME_FORMAT(abre, '%H:%i') AS abre,
  TIME_FORMAT(fecha, '%H:%i') AS fecha, atualizado_em`;

class horariorepository {
  async listByPizzaria(pizzariaId: string, conn: Executor = db): Promise<Horario[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM horarios_funcionamento WHERE pizzaria_id = ? ORDER BY dia_semana, abre`,
      [pizzariaId]
    );
    return rows as Horario[];
  }

  // Usado só para substituir a semana inteira, dentro de transação
  async deleteByPizzaria(pizzariaId: string, conn: Executor = db): Promise<void> {
    await conn.execute("DELETE FROM horarios_funcionamento WHERE pizzaria_id = ?", [pizzariaId]);
  }

  async createMany(pizzariaId: string, horarios: HorarioDados[], conn: Executor = db): Promise<void> {
    if (horarios.length === 0) return;
    await conn.execute(
      `INSERT INTO horarios_funcionamento (pizzaria_id, dia_semana, abre, fecha)
       VALUES ${horarios.map(() => "(?, ?, ?, ?)").join(", ")}`,
      horarios.flatMap((h) => [pizzariaId, h.diaSemana, h.abre, h.fecha])
    );
  }
}

export const horarioRepository = new horariorepository();
