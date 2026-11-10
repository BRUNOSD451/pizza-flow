import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db, type Executor } from "../db/db";

export interface Endereco {
  id: string;
  pizzaria_id: string;
  cliente_id: string;
  area_entrega_id: string | null;
  cep: string | null;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
  referencia: string | null;
  principal: boolean;
  atualizado_em: Date;
}

export interface CriarEnderecoDados {
  areaEntregaId: string | null;
  cep: string | null;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
  referencia: string | null;
  principal: boolean;
}

export type EditarEnderecoDados = Partial<CriarEnderecoDados>;

const COLUNAS = `id, pizzaria_id, cliente_id, area_entrega_id, cep, logradouro, numero, complemento,
  bairro, cidade, estado, referencia, principal, atualizado_em`;

// mysql2 devolve BOOLEAN (TINYINT) como 0/1
function toEndereco(row: RowDataPacket): Endereco {
  return { ...row, principal: Boolean(row.principal) } as Endereco;
}

class enderecorepository {
  async create(pizzariaId: string, clienteId: string, dados: CriarEnderecoDados, conn: Executor = db): Promise<Endereco> {
    const id = randomUUID();
    await conn.execute(
      `INSERT INTO enderecos (id, pizzaria_id, cliente_id, area_entrega_id, cep, logradouro, numero, complemento,
                              bairro, cidade, estado, referencia, principal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        pizzariaId,
        clienteId,
        dados.areaEntregaId,
        dados.cep,
        dados.logradouro,
        dados.numero,
        dados.complemento,
        dados.bairro,
        dados.cidade,
        dados.estado,
        dados.referencia,
        dados.principal,
      ]
    );
    return (await this.findById(pizzariaId, clienteId, id, conn))!;
  }

  // Principal primeiro
  async listByCliente(pizzariaId: string, clienteId: string, conn: Executor = db): Promise<Endereco[]> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM enderecos WHERE pizzaria_id = ? AND cliente_id = ? ORDER BY principal DESC, logradouro, numero`,
      [pizzariaId, clienteId]
    );
    return rows.map(toEndereco);
  }

  // Exige o cliente junto: impede usar, num pedido, o endereço de outro cliente
  async findById(pizzariaId: string, clienteId: string, id: string, conn: Executor = db): Promise<Endereco | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT ${COLUNAS} FROM enderecos WHERE pizzaria_id = ? AND cliente_id = ? AND id = ?`,
      [pizzariaId, clienteId, id]
    );
    return rows[0] ? toEndereco(rows[0]) : null;
  }

  // Só atualiza os campos enviados; devolve null se o endereço não existir para este cliente
  async edit(
    pizzariaId: string,
    clienteId: string,
    id: string,
    dados: EditarEnderecoDados,
    conn: Executor = db
  ): Promise<Endereco | null> {
    const colunas: [string, string | boolean | null | undefined][] = [
      ["area_entrega_id", dados.areaEntregaId],
      ["cep", dados.cep],
      ["logradouro", dados.logradouro],
      ["numero", dados.numero],
      ["complemento", dados.complemento],
      ["bairro", dados.bairro],
      ["cidade", dados.cidade],
      ["estado", dados.estado],
      ["referencia", dados.referencia],
      ["principal", dados.principal],
    ];
    const enviados = colunas.filter(([, valor]) => valor !== undefined);

    if (enviados.length > 0) {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE enderecos SET ${enviados.map(([coluna]) => `${coluna} = ?`).join(", ")}
          WHERE pizzaria_id = ? AND cliente_id = ? AND id = ?`,
        [...enviados.map(([, valor]) => valor ?? null), pizzariaId, clienteId, id]
      );
      if (result.affectedRows === 0) return null;
    }

    return this.findById(pizzariaId, clienteId, id, conn);
  }

  // O cliente só pode ter um principal: chamar antes de marcar outro endereço
  async desmarcarPrincipal(pizzariaId: string, clienteId: string, conn: Executor = db): Promise<void> {
    await conn.execute("UPDATE enderecos SET principal = FALSE WHERE pizzaria_id = ? AND cliente_id = ? AND principal = TRUE", [
      pizzariaId,
      clienteId,
    ]);
  }

  async delete(pizzariaId: string, clienteId: string, id: string, conn: Executor = db): Promise<boolean> {
    const [result] = await conn.execute<ResultSetHeader>(
      "DELETE FROM enderecos WHERE pizzaria_id = ? AND cliente_id = ? AND id = ?",
      [pizzariaId, clienteId, id]
    );
    return result.affectedRows > 0;
  }
}

export const enderecoRepository = new enderecorepository();
