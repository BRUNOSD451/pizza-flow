import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";
import type { PrecoPorTamanho } from "./tamanho_repository";

// preco vem como string ("8.00"): é assim que o mysql2 devolve DECIMAL, sem passar por float
export interface BordaPreco {
  tamanho_id: string;
  tamanho_nome: string;
  preco: string;
}

export interface Borda {
  id: string;
  pizzaria_id: string;
  nome: string;
  ativo: boolean;
  atualizado_em: Date;
}

export interface BordaComPrecos extends Borda {
  precos: BordaPreco[];
}

export interface EditarBordaDados {
  nome?: string;
  ativo?: boolean;
}

const COLUNAS = "id, pizzaria_id, nome, ativo, atualizado_em";

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toBorda(row: RowDataPacket): Borda {
  return { ...row, ativo: Boolean(row.ativo) } as Borda;
}

class bordarepository {
  async create(pizzariaId: string, nome: string, conn: Executor = db): Promise<Borda> {
    const id = randomUUID();
    await conn.execute("INSERT INTO bordas (id, pizzaria_id, nome) VALUES (?, ?, ?)", [id, pizzariaId, nome]);
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM bordas WHERE pizzaria_id = ? AND id = ?`,
      [pizzariaId, id]
    );
    return toBorda(rows[0]);
  }

  // Ativas primeiro, depois por nome
  async listByPizzaria(pizzariaId: string, conn: Executor = db): Promise<BordaComPrecos[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM bordas WHERE pizzaria_id = ? ORDER BY ativo DESC, nome`,
      [pizzariaId]
    );
    return this.comPrecos(pizzariaId, rows.map(toBorda), conn);
  }

  // Filtrar por pizzariaId impede acessar borda de outra pizzaria mesmo sabendo o id
  async findById(pizzariaId: string, id: string, conn: Executor = db): Promise<BordaComPrecos | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM bordas WHERE pizzaria_id = ? AND id = ?`,
      [pizzariaId, id]
    );
    if (!rows[0]) return null;
    const [borda] = await this.comPrecos(pizzariaId, [toBorda(rows[0])], conn);
    return borda;
  }

  // Só atualiza os campos enviados; devolve false se a borda não existir nesta pizzaria
  async edit(pizzariaId: string, id: string, dados: EditarBordaDados, conn: Executor = db): Promise<boolean> {
    const colunas: [string, string | boolean | undefined][] = [
      ["nome", dados.nome],
      ["ativo", dados.ativo],
    ];
    const enviados = colunas.filter(([, valor]) => valor !== undefined);
    if (enviados.length === 0) return true;

    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE bordas SET ${enviados.map(([coluna]) => `${coluna} = ?`).join(", ")} WHERE pizzaria_id = ? AND id = ?`,
      [...enviados.map(([, valor]) => valor!), pizzariaId, id]
    );
    return result.affectedRows > 0;
  }

  // A lista enviada vira a tabela de preços completa da borda. Pedidos guardam snapshot do preço,
  // e nenhuma tabela referencia borda_precos, então apagar e regravar não afeta o histórico.
  async substituirPrecos(pizzariaId: string, bordaId: string, precos: PrecoPorTamanho[], conn: Executor = db) {
    await conn.execute("DELETE FROM borda_precos WHERE pizzaria_id = ? AND borda_id = ?", [pizzariaId, bordaId]);
    if (precos.length === 0) return;

    await conn.execute(
      `INSERT INTO borda_precos (pizzaria_id, borda_id, tamanho_id, preco)
       VALUES ${precos.map(() => "(?, ?, ?, ?)").join(", ")}`,
      precos.flatMap((p) => [pizzariaId, bordaId, p.tamanhoId, p.preco])
    );
  }

  // Busca os preços de todas as bordas numa query só (evita N+1), na ordem dos tamanhos
  private async comPrecos(pizzariaId: string, bordas: Borda[], conn: Executor): Promise<BordaComPrecos[]> {
    if (bordas.length === 0) return [];

    const ids = bordas.map((b) => b.id);
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT bp.borda_id, bp.tamanho_id, t.nome AS tamanho_nome, bp.preco
         FROM borda_precos bp
         JOIN tamanhos t ON t.pizzaria_id = bp.pizzaria_id AND t.id = bp.tamanho_id
        WHERE bp.pizzaria_id = ? AND bp.borda_id IN (${ids.map(() => "?").join(", ")})
        ORDER BY t.ordem, t.nome`,
      [pizzariaId, ...ids]
    );

    const porBorda = new Map<string, BordaPreco[]>(ids.map((id) => [id, []]));
    for (const row of rows) {
      porBorda.get(row.borda_id)!.push({
        tamanho_id: row.tamanho_id,
        tamanho_nome: row.tamanho_nome,
        preco: row.preco,
      });
    }
    return bordas.map((borda) => ({ ...borda, precos: porBorda.get(borda.id)! }));
  }
}

export const bordaRepository = new bordarepository();
