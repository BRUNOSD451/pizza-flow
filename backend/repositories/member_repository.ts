import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
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

export interface CriarMembroDados {
  pizzariaId: string;
  usuarioId: string;
  papel: Papel;
}

const COLUNAS = "m.id, m.pizzaria_id, m.usuario_id, m.papel, m.ativo, m.atualizado_em";

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toMembro<T extends Membro>(row: RowDataPacket): T {
  const membro = { ...row, ativo: Boolean(row.ativo) } as T;
  if ("pizzaria_ativa" in row) {
    (membro as unknown as MembroComPizzaria).pizzaria_ativa = Boolean(row.pizzaria_ativa);
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
}

export const memberRepository = new memberrepository();
