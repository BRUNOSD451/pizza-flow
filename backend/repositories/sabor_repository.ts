import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";
import type { PrecoPorTamanho } from "./tamanho_repository";

export const TIPOS_SABOR = ["salgada", "doce"] as const;
export type TipoSabor = (typeof TIPOS_SABOR)[number];

// preco vem como string ("45.90"): é assim que o mysql2 devolve DECIMAL, sem passar por float
export interface SaborPreco {
  tamanho_id: string;
  tamanho_nome: string;
  preco: string;
}

export interface Sabor {
  id: string;
  pizzaria_id: string;
  categoria_id: string | null;
  nome: string;
  descricao: string | null;
  imagem_url: string | null;
  tipo: TipoSabor;
  ativo: boolean;
  atualizado_em: Date;
}

export interface SaborComPrecos extends Sabor {
  precos: SaborPreco[];
}

export interface CriarSaborDados {
  nome: string;
  tipo: TipoSabor;
  categoriaId: string | null;
  descricao: string | null;
  imagemUrl: string | null;
}

export interface EditarSaborDados {
  nome?: string;
  tipo?: TipoSabor;
  categoriaId?: string | null;
  descricao?: string | null;
  imagemUrl?: string | null;
  ativo?: boolean;
}

const COLUNAS = "id, pizzaria_id, categoria_id, nome, descricao, imagem_url, tipo, ativo, atualizado_em";

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toSabor(row: RowDataPacket): Sabor {
  return { ...row, ativo: Boolean(row.ativo) } as Sabor;
}

class saborrepository {
  async create(pizzariaId: string, dados: CriarSaborDados, conn: Executor = db): Promise<Sabor> {
    const id = randomUUID();
    await conn.execute(
      `INSERT INTO sabores (id, pizzaria_id, categoria_id, nome, descricao, imagem_url, tipo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, pizzariaId, dados.categoriaId, dados.nome, dados.descricao, dados.imagemUrl, dados.tipo]
    );
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM sabores WHERE pizzaria_id = ? AND id = ?`,
      [pizzariaId, id]
    );
    return toSabor(rows[0]);
  }

  // Ativos primeiro, depois por nome
  async listByPizzaria(pizzariaId: string, conn: Executor = db): Promise<SaborComPrecos[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM sabores WHERE pizzaria_id = ? ORDER BY ativo DESC, nome`,
      [pizzariaId]
    );
    return this.comPrecos(pizzariaId, rows.map(toSabor), conn);
  }

  // Filtrar por pizzariaId impede acessar sabor de outra pizzaria mesmo sabendo o id
  async findById(pizzariaId: string, id: string, conn: Executor = db): Promise<SaborComPrecos | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM sabores WHERE pizzaria_id = ? AND id = ?`,
      [pizzariaId, id]
    );
    if (!rows[0]) return null;
    const [sabor] = await this.comPrecos(pizzariaId, [toSabor(rows[0])], conn);
    return sabor;
  }

  // Só atualiza os campos enviados; devolve false se o sabor não existir nesta pizzaria
  async edit(pizzariaId: string, id: string, dados: EditarSaborDados, conn: Executor = db): Promise<boolean> {
    const colunas: [string, string | boolean | null | undefined][] = [
      ["nome", dados.nome],
      ["tipo", dados.tipo],
      ["categoria_id", dados.categoriaId],
      ["descricao", dados.descricao],
      ["imagem_url", dados.imagemUrl],
      ["ativo", dados.ativo],
    ];
    const enviados = colunas.filter(([, valor]) => valor !== undefined);
    if (enviados.length === 0) return true;

    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE sabores SET ${enviados.map(([coluna]) => `${coluna} = ?`).join(", ")} WHERE pizzaria_id = ? AND id = ?`,
      [...enviados.map(([, valor]) => valor ?? null), pizzariaId, id]
    );
    return result.affectedRows > 0;
  }

  // A lista enviada vira a tabela de preços completa do sabor. Pedidos guardam snapshot do preço,
  // e nenhuma tabela referencia sabor_precos, então apagar e regravar não afeta o histórico.
  async substituirPrecos(pizzariaId: string, saborId: string, precos: PrecoPorTamanho[], conn: Executor = db) {
    await conn.execute("DELETE FROM sabor_precos WHERE pizzaria_id = ? AND sabor_id = ?", [pizzariaId, saborId]);
    if (precos.length === 0) return;

    await conn.execute(
      `INSERT INTO sabor_precos (pizzaria_id, sabor_id, tamanho_id, preco)
       VALUES ${precos.map(() => "(?, ?, ?, ?)").join(", ")}`,
      precos.flatMap((p) => [pizzariaId, saborId, p.tamanhoId, p.preco])
    );
  }

  // Busca os preços de todos os sabores numa query só (evita N+1), na ordem dos tamanhos
  private async comPrecos(pizzariaId: string, sabores: Sabor[], conn: Executor): Promise<SaborComPrecos[]> {
    if (sabores.length === 0) return [];

    const ids = sabores.map((s) => s.id);
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT sp.sabor_id, sp.tamanho_id, t.nome AS tamanho_nome, sp.preco
         FROM sabor_precos sp
         JOIN tamanhos t ON t.pizzaria_id = sp.pizzaria_id AND t.id = sp.tamanho_id
        WHERE sp.pizzaria_id = ? AND sp.sabor_id IN (${ids.map(() => "?").join(", ")})
        ORDER BY t.ordem, t.nome`,
      [pizzariaId, ...ids]
    );

    const porSabor = new Map<string, SaborPreco[]>(ids.map((id) => [id, []]));
    for (const row of rows) {
      porSabor.get(row.sabor_id)!.push({
        tamanho_id: row.tamanho_id,
        tamanho_nome: row.tamanho_nome,
        preco: row.preco,
      });
    }
    return sabores.map((sabor) => ({ ...sabor, precos: porSabor.get(sabor.id)! }));
  }
}

export const saborRepository = new saborrepository();
