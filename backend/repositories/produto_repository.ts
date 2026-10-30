import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";

// Item de preço fixo (bebida, sobremesa, porção). preco vem como string ("12.00"):
// é assim que o mysql2 devolve DECIMAL, sem passar por float
export interface Produto {
  id: string;
  pizzaria_id: string;
  categoria_id: string | null;
  nome: string;
  descricao: string | null;
  imagem_url: string | null;
  preco: string;
  ativo: boolean;
  atualizado_em: Date;
}

export interface CriarProdutoDados {
  nome: string;
  preco: string;
  categoriaId: string | null;
  descricao: string | null;
  imagemUrl: string | null;
}

export interface EditarProdutoDados {
  nome?: string;
  preco?: string;
  categoriaId?: string | null;
  descricao?: string | null;
  imagemUrl?: string | null;
  ativo?: boolean;
}

const COLUNAS = "id, pizzaria_id, categoria_id, nome, descricao, imagem_url, preco, ativo, atualizado_em";

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toProduto(row: RowDataPacket): Produto {
  return { ...row, ativo: Boolean(row.ativo) } as Produto;
}

class produtorepository {
  async create(pizzariaId: string, dados: CriarProdutoDados, conn: Executor = db): Promise<Produto> {
    const id = randomUUID();
    await conn.execute(
      `INSERT INTO produtos (id, pizzaria_id, categoria_id, nome, descricao, imagem_url, preco)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, pizzariaId, dados.categoriaId, dados.nome, dados.descricao, dados.imagemUrl, dados.preco]
    );
    return (await this.findById(pizzariaId, id, conn))!;
  }

  // Ativos primeiro, depois por nome
  async listByPizzaria(pizzariaId: string, conn: Executor = db): Promise<Produto[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM produtos WHERE pizzaria_id = ? ORDER BY ativo DESC, nome`,
      [pizzariaId]
    );
    return rows.map(toProduto);
  }

  // Filtrar por pizzariaId impede acessar produto de outra pizzaria mesmo sabendo o id
  async findById(pizzariaId: string, id: string, conn: Executor = db): Promise<Produto | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM produtos WHERE pizzaria_id = ? AND id = ?`,
      [pizzariaId, id]
    );
    return rows[0] ? toProduto(rows[0]) : null;
  }

  // Só atualiza os campos enviados; devolve null se o produto não existir nesta pizzaria
  async edit(pizzariaId: string, id: string, dados: EditarProdutoDados, conn: Executor = db): Promise<Produto | null> {
    const colunas: [string, string | boolean | null | undefined][] = [
      ["nome", dados.nome],
      ["preco", dados.preco],
      ["categoria_id", dados.categoriaId],
      ["descricao", dados.descricao],
      ["imagem_url", dados.imagemUrl],
      ["ativo", dados.ativo],
    ];
    const enviados = colunas.filter(([, valor]) => valor !== undefined);

    if (enviados.length > 0) {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE produtos SET ${enviados.map(([coluna]) => `${coluna} = ?`).join(", ")} WHERE pizzaria_id = ? AND id = ?`,
        [...enviados.map(([, valor]) => valor ?? null), pizzariaId, id]
      );
      if (result.affectedRows === 0) return null;
    }

    return this.findById(pizzariaId, id, conn);
  }
}

export const produtoRepository = new produtorepository();
