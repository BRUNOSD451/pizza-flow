import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  admin_plataforma: boolean;
  criado_em: Date;
  atualizado_em: Date;
}

// Só o login precisa do hash; o resto do sistema usa Usuario
export interface UsuarioComSenha extends Usuario {
  senha_hash: string;
}

export interface CriarUsuarioDados {
  nome: string;
  email: string;
  senhaHash: string;
  adminPlataforma?: boolean;
}

export type EditarUsuarioDados = Partial<CriarUsuarioDados>;

const COLUNAS_PUBLICAS = "id, nome, email, admin_plataforma, criado_em, atualizado_em";

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toUsuario<T extends Usuario>(row: RowDataPacket): T {
  return { ...row, admin_plataforma: Boolean(row.admin_plataforma) } as T;
}

class userrepository {
  // O id é gerado aqui para poder devolver o usuário criado sem outra busca por email
  async create(dados: CriarUsuarioDados, conn: Executor = db): Promise<Usuario> {
    const id = randomUUID();
    await conn.execute(
      "INSERT INTO usuarios (id, nome, email, senha_hash, admin_plataforma) VALUES (?, ?, ?, ?, ?)",
      [id, dados.nome, dados.email.trim(), dados.senhaHash, dados.adminPlataforma ?? false]
    );

    const usuario = await this.findById(id, conn);
    return usuario!;
  }

  async findByEmail(email: string, conn: Executor = db): Promise<UsuarioComSenha | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS_PUBLICAS}, senha_hash FROM usuarios WHERE email = ?`,
      [email.trim()]
    );
    return rows[0] ? toUsuario<UsuarioComSenha>(rows[0]) : null;
  }

  async findById(id: string, conn: Executor = db): Promise<Usuario | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS_PUBLICAS} FROM usuarios WHERE id = ?`,
      [id]
    );
    return rows[0] ? toUsuario<Usuario>(rows[0]) : null;
  }

  // Só atualiza os campos enviados; devolve null se o usuário não existir
  async edit(id: string, dados: EditarUsuarioDados, conn: Executor = db): Promise<Usuario | null> {
    const campos: string[] = [];
    const valores: (string | boolean)[] = [];

    if (dados.nome !== undefined) {
      campos.push("nome = ?");
      valores.push(dados.nome);
    }
    if (dados.email !== undefined) {
      campos.push("email = ?");
      valores.push(dados.email.trim());
    }
    if (dados.senhaHash !== undefined) {
      campos.push("senha_hash = ?");
      valores.push(dados.senhaHash);
    }
    if (dados.adminPlataforma !== undefined) {
      campos.push("admin_plataforma = ?");
      valores.push(dados.adminPlataforma);
    }

    if (campos.length > 0) {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE usuarios SET ${campos.join(", ")} WHERE id = ?`,
        [...valores, id]
      );
      if (result.affectedRows === 0) return null;
    }

    return this.findById(id, conn);
  }
}

export const userRepository = new userrepository();
