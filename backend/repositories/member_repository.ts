import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";

export const PAPEIS = ["dono", "gerente", "atendente", "garcom", "cozinha", "entregador"] as const;
export type Papel = (typeof PAPEIS)[number];

export interface Membro {
  id: string;
  pizzaria_id: string;
  usuario_id: string;
  papel: Papel;
  ativo: boolean;
  atualizado_em: Date;
}

// Login e middleware precisam saber também se a pizzaria está ativa
export interface MembroComPizzaria extends Membro {
  pizzaria_nome: string;
  pizzaria_slug: string;
  pizzaria_ativa: boolean;
}

// Telas de equipe mostram nome e email do usuário junto
export interface MembroComUsuario extends Membro {
  nome: string;
  email: string;
  deve_trocar_senha: boolean;
}

export interface CriarMembroDados {
  pizzariaId: string;
  usuarioId: string;
  papel: Papel;
}

export interface EditarMembroDados {
  papel?: Papel;
  ativo?: boolean;
}

const COLUNAS = "m.id, m.pizzaria_id, m.usuario_id, m.papel, m.ativo, m.atualizado_em";

const SELECT_COM_USUARIO = `SELECT ${COLUNAS}, u.nome, u.email, u.deve_trocar_senha
  FROM membros m
  JOIN usuarios u ON u.id = m.usuario_id`;

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toMembro<T extends Membro>(row: RowDataPacket): T {
  const membro = { ...row, ativo: Boolean(row.ativo) } as T;
  if ("pizzaria_ativa" in row) {
    (membro as unknown as MembroComPizzaria).pizzaria_ativa = Boolean(row.pizzaria_ativa);
  }
  if ("deve_trocar_senha" in row) {
    (membro as unknown as MembroComUsuario).deve_trocar_senha = Boolean(row.deve_trocar_senha);
  }
  return membro;
}

class memberrepository {
  async create(dados: CriarMembroDados, conn: Executor = db): Promise<Membro> {
    const id = randomUUID();
    await conn.execute(
      "INSERT INTO membros (id, pizzaria_id, usuario_id, papel) VALUES (?, ?, ?, ?)",
      [id, dados.pizzariaId, dados.usuarioId, dados.papel]
    );

    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM membros m WHERE m.id = ?`,
      [id]
    );
    return toMembro<Membro>(rows[0]);
  }

  // Cada usuário tem no máximo um membro (UNIQUE usuario_id), que define sua pizzaria e papel.
  // Devolve inativos também: quem chama decide se bloqueia o acesso.
  async findByUsuario(usuarioId: string, conn: Executor = db): Promise<MembroComPizzaria | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS},
              p.nome  AS pizzaria_nome,
              p.slug  AS pizzaria_slug,
              p.ativo AS pizzaria_ativa
         FROM membros m
         JOIN pizzarias p ON p.id = m.pizzaria_id
        WHERE m.usuario_id = ?`,
      [usuarioId]
    );
    return rows[0] ? toMembro<MembroComPizzaria>(rows[0]) : null;
  }

  // Equipe da pizzaria: ativos primeiro, depois por nome
  async listByPizzaria(pizzariaId: string, conn: Executor = db): Promise<MembroComUsuario[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `${SELECT_COM_USUARIO} WHERE m.pizzaria_id = ? ORDER BY m.ativo DESC, u.nome`,
      [pizzariaId]
    );
    return rows.map((row) => toMembro<MembroComUsuario>(row));
  }

  // Filtrar por pizzariaId impede acessar membro de outra pizzaria mesmo sabendo o id
  async findById(pizzariaId: string, id: string, conn: Executor = db): Promise<MembroComUsuario | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `${SELECT_COM_USUARIO} WHERE m.pizzaria_id = ? AND m.id = ?`,
      [pizzariaId, id]
    );
    return rows[0] ? toMembro<MembroComUsuario>(rows[0]) : null;
  }

  // Só atualiza os campos enviados; devolve null se o membro não existir nesta pizzaria
  async edit(
    pizzariaId: string,
    id: string,
    dados: EditarMembroDados,
    conn: Executor = db
  ): Promise<MembroComUsuario | null> {
    const campos: string[] = [];
    const valores: (string | boolean)[] = [];

    if (dados.papel !== undefined) {
      campos.push("papel = ?");
      valores.push(dados.papel);
    }
    if (dados.ativo !== undefined) {
      campos.push("ativo = ?");
      valores.push(dados.ativo);
    }

    if (campos.length > 0) {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE membros SET ${campos.join(", ")} WHERE pizzaria_id = ? AND id = ?`,
        [...valores, pizzariaId, id]
      );
      if (result.affectedRows === 0) return null;
    }

    return this.findById(pizzariaId, id, conn);
  }
}

export const memberRepository = new memberrepository();
