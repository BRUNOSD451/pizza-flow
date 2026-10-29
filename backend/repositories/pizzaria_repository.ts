import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";

export type RegraPrecoPizza = "maior" | "media";

// Valores em dinheiro chegam do MySQL como string ("5.00") e ficam assim:
// converter para number traria erro de arredondamento de float
export interface Pizzaria {
  id: string;
  nome: string;
  slug: string;
  telefone: string | null;
  logo_url: string | null;
  cor_primaria: string | null;
  fuso_horario: string;
  regra_preco_pizza: RegraPrecoPizza;
  tempo_alvo_preparo_min: number;
  taxa_entrega_padrao: string;
  aceitando_pedidos: boolean;
  pedido_minimo: string;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
}

export interface CriarPizzariaDados {
  nome: string;
  slug: string;
  telefone?: string | null;
  fusoHorario?: string;
}

export interface EditarPizzariaDados {
  nome?: string;
  slug?: string;
  telefone?: string | null;
  logoUrl?: string | null;
  corPrimaria?: string | null;
  fusoHorario?: string;
  regraPrecoPizza?: RegraPrecoPizza;
  tempoAlvoPreparoMin?: number;
  taxaEntregaPadrao?: string;
  aceitandoPedidos?: boolean;
  pedidoMinimo?: string;
  ativo?: boolean;
}

export interface ListarPizzariasFiltros {
  ativo?: boolean;
  limit?: number;
  offset?: number;
}

// ultimo_numero_pedido fica de fora: é controle interno da numeração dos pedidos
const COLUNAS = `id, nome, slug, telefone, logo_url, cor_primaria, fuso_horario, regra_preco_pizza,
  tempo_alvo_preparo_min, taxa_entrega_padrao, aceitando_pedidos, pedido_minimo, ativo,
  criado_em, atualizado_em`;

// Campo de EditarPizzariaDados → coluna; só o que está aqui pode ser alterado pelo edit
const COLUNAS_EDITAVEIS: Record<keyof EditarPizzariaDados, string> = {
  nome: "nome",
  slug: "slug",
  telefone: "telefone",
  logoUrl: "logo_url",
  corPrimaria: "cor_primaria",
  fusoHorario: "fuso_horario",
  regraPrecoPizza: "regra_preco_pizza",
  tempoAlvoPreparoMin: "tempo_alvo_preparo_min",
  taxaEntregaPadrao: "taxa_entrega_padrao",
  aceitandoPedidos: "aceitando_pedidos",
  pedidoMinimo: "pedido_minimo",
  ativo: "ativo",
};

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toPizzaria(row: RowDataPacket): Pizzaria {
  return {
    ...row,
    aceitando_pedidos: Boolean(row.aceitando_pedidos),
    ativo: Boolean(row.ativo),
  } as Pizzaria;
}

function normalizarSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

class pizzariarepository {
  async create(dados: CriarPizzariaDados, conn: Executor = db): Promise<Pizzaria> {
    const id = randomUUID();
    await conn.execute(
      `INSERT INTO pizzarias (id, nome, slug, telefone, fuso_horario)
       VALUES (?, ?, ?, ?, COALESCE(?, DEFAULT(fuso_horario)))`,
      [id, dados.nome, normalizarSlug(dados.slug), dados.telefone ?? null, dados.fusoHorario ?? null]
    );

    const pizzaria = await this.findById(id, conn);
    return pizzaria!;
  }

  async findById(id: string, conn: Executor = db): Promise<Pizzaria | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM pizzarias WHERE id = ?`,
      [id]
    );
    return rows[0] ? toPizzaria(rows[0]) : null;
  }

  // Usado pelo site do cliente (cardápio público) e para checar se o slug está livre
  async findBySlug(slug: string, conn: Executor = db): Promise<Pizzaria | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM pizzarias WHERE slug = ?`,
      [normalizarSlug(slug)]
    );
    return rows[0] ? toPizzaria(rows[0]) : null;
  }

  // Painel do admin da plataforma
  async list(filtros: ListarPizzariasFiltros = {}, conn: Executor = db): Promise<Pizzaria[]> {
    const where = filtros.ativo === undefined ? "" : "WHERE ativo = ?";
    const params = filtros.ativo === undefined ? [] : [filtros.ativo];

    // query (e não execute): prepared statements do MySQL não aceitam LIMIT como parâmetro numérico
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM pizzarias ${where} ORDER BY nome LIMIT ? OFFSET ?`,
      [...params, filtros.limit ?? 50, filtros.offset ?? 0]
    );
    return rows.map(toPizzaria);
  }

  // Só atualiza os campos enviados; devolve null se a pizzaria não existir.
  // Quem pode mudar o quê (ex.: só o admin mexe em `ativo`) é decidido no service.
  async edit(id: string, dados: EditarPizzariaDados, conn: Executor = db): Promise<Pizzaria | null> {
    const campos: string[] = [];
    const valores: (string | number | boolean | null)[] = [];

    for (const [campo, coluna] of Object.entries(COLUNAS_EDITAVEIS)) {
      let valor = dados[campo as keyof EditarPizzariaDados];
      if (valor === undefined) continue;
      if (campo === "slug") valor = normalizarSlug(valor as string);
      campos.push(`${coluna} = ?`);
      valores.push(valor);
    }

    if (campos.length > 0) {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE pizzarias SET ${campos.join(", ")} WHERE id = ?`,
        [...valores, id]
      );
      if (result.affectedRows === 0) return null;
    }

    return this.findById(id, conn);
  }
}

export const pizzariaRepository = new pizzariarepository();
