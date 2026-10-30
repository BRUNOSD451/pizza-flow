import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";
import type { PrecoPorTamanho } from "./tamanho_repository";

// Preço próprio do adicional num tamanho. preco vem como string ("8.00"):
// é assim que o mysql2 devolve DECIMAL, sem passar por float
export interface AdicionalPreco {
  tamanho_id: string;
  tamanho_nome: string;
  preco: string;
}

// preco é o padrão: vale para produtos e para tamanhos sem preço próprio
export interface Adicional {
  id: string;
  pizzaria_id: string;
  nome: string;
  preco: string;
  ativo: boolean;
  atualizado_em: Date;
}

export interface AdicionalComPrecos extends Adicional {
  precos: AdicionalPreco[];
}

export interface CriarAdicionalDados {
  nome: string;
  preco: string;
}

export interface EditarAdicionalDados {
  nome?: string;
  preco?: string;
  ativo?: boolean;
}

const COLUNAS = "id, pizzaria_id, nome, preco, ativo, atualizado_em";

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toAdicional(row: RowDataPacket): Adicional {
  return { ...row, ativo: Boolean(row.ativo) } as Adicional;
}

class adicionalrepository {
  async create(pizzariaId: string, dados: CriarAdicionalDados, conn: Executor = db): Promise<Adicional> {
    const id = randomUUID();
    await conn.execute("INSERT INTO adicionais (id, pizzaria_id, nome, preco) VALUES (?, ?, ?, ?)", [
      id,
      pizzariaId,
      dados.nome,
      dados.preco,
    ]);
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM adicionais WHERE pizzaria_id = ? AND id = ?`,
      [pizzariaId, id]
    );
    return toAdicional(rows[0]);
  }

  // Ativos primeiro, depois por nome
  async listByPizzaria(pizzariaId: string, conn: Executor = db): Promise<AdicionalComPrecos[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM adicionais WHERE pizzaria_id = ? ORDER BY ativo DESC, nome`,
      [pizzariaId]
    );
    return this.comPrecos(pizzariaId, rows.map(toAdicional), conn);
  }

  // Filtrar por pizzariaId impede acessar adicional de outra pizzaria mesmo sabendo o id
  async findById(pizzariaId: string, id: string, conn: Executor = db): Promise<AdicionalComPrecos | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM adicionais WHERE pizzaria_id = ? AND id = ?`,
      [pizzariaId, id]
    );
    if (!rows[0]) return null;
    const [adicional] = await this.comPrecos(pizzariaId, [toAdicional(rows[0])], conn);
    return adicional;
  }

  // Só atualiza os campos enviados; devolve false se o adicional não existir nesta pizzaria
  async edit(pizzariaId: string, id: string, dados: EditarAdicionalDados, conn: Executor = db): Promise<boolean> {
    const colunas: [string, string | boolean | undefined][] = [
      ["nome", dados.nome],
      ["preco", dados.preco],
      ["ativo", dados.ativo],
    ];
    const enviados = colunas.filter(([, valor]) => valor !== undefined);
    if (enviados.length === 0) return true;

    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE adicionais SET ${enviados.map(([coluna]) => `${coluna} = ?`).join(", ")} WHERE pizzaria_id = ? AND id = ?`,
      [...enviados.map(([, valor]) => valor!), pizzariaId, id]
    );
    return result.affectedRows > 0;
  }

  // A lista enviada vira a tabela completa de preços próprios ([] = só o preço padrão).
  // Pedidos guardam snapshot do preço, e nenhuma tabela referencia adicional_precos.
  async substituirPrecos(pizzariaId: string, adicionalId: string, precos: PrecoPorTamanho[], conn: Executor = db) {
    await conn.execute("DELETE FROM adicional_precos WHERE pizzaria_id = ? AND adicional_id = ?", [
      pizzariaId,
      adicionalId,
    ]);
    if (precos.length === 0) return;

    await conn.execute(
      `INSERT INTO adicional_precos (pizzaria_id, adicional_id, tamanho_id, preco)
       VALUES ${precos.map(() => "(?, ?, ?, ?)").join(", ")}`,
      precos.flatMap((p) => [pizzariaId, adicionalId, p.tamanhoId, p.preco])
    );
  }

  // Busca os preços de todos os adicionais numa query só (evita N+1), na ordem dos tamanhos
  private async comPrecos(pizzariaId: string, adicionais: Adicional[], conn: Executor): Promise<AdicionalComPrecos[]> {
    if (adicionais.length === 0) return [];

    const ids = adicionais.map((a) => a.id);
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ap.adicional_id, ap.tamanho_id, t.nome AS tamanho_nome, ap.preco
         FROM adicional_precos ap
         JOIN tamanhos t ON t.pizzaria_id = ap.pizzaria_id AND t.id = ap.tamanho_id
        WHERE ap.pizzaria_id = ? AND ap.adicional_id IN (${ids.map(() => "?").join(", ")})
        ORDER BY t.ordem, t.nome`,
      [pizzariaId, ...ids]
    );

    const porAdicional = new Map<string, AdicionalPreco[]>(ids.map((id) => [id, []]));
    for (const row of rows) {
      porAdicional.get(row.adicional_id)!.push({
        tamanho_id: row.tamanho_id,
        tamanho_nome: row.tamanho_nome,
        preco: row.preco,
      });
    }
    return adicionais.map((adicional) => ({ ...adicional, precos: porAdicional.get(adicional.id)! }));
  }
}

export const adicionalRepository = new adicionalrepository();
