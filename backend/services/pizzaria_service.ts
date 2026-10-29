import { withTransaction } from "../db/db";
import { AppError } from "../errors/app_error";
import { pizzariaRepository, type Pizzaria } from "../repositories/pizzaria_repository";
import { userRepository } from "../repositories/user_repository";
import { memberRepository } from "../repositories/member_repository";
import { hashSenha } from "../utils/senha";

export interface CriarPizzariaComDonoDados {
  pizzaria: { nome: string; slug: string; telefone?: string | null; fusoHorario?: string };
  dono: { nome: string; email: string; senha: string };
}

export interface CriarPizzariaComDonoResultado {
  pizzaria: Pizzaria;
  dono: { id: string; nome: string; email: string };
}

const SLUG_EM_USO = () => new AppError("Este endereço (slug) já está em uso", 409, "SLUG_EM_USO");
const EMAIL_EM_USO = () =>
  new AppError("Este email já está cadastrado. Cada usuário pertence a uma única pizzaria.", 409, "EMAIL_EM_USO");

class pizzariaservice {

  // ou cria os três registros (pizzaria, usuário, membro) ou nenhum
  async criarComDono(dados: CriarPizzariaComDonoDados): Promise<CriarPizzariaComDonoResultado> {
    // Checagem prévia só para dar a mensagem certa; o UNIQUE do banco é quem garante
    if (await pizzariaRepository.findBySlug(dados.pizzaria.slug)) throw SLUG_EM_USO();
    if (await userRepository.findByEmail(dados.dono.email)) throw EMAIL_EM_USO();

    // bcrypt é lento de propósito: calcula fora da transação para não segurar a conexão
    const senhaHash = await hashSenha(dados.dono.senha);

    try {
      return await withTransaction(async (conn) => {
        const pizzaria = await pizzariaRepository.create(dados.pizzaria, conn);
        const usuario = await userRepository.create(
          { nome: dados.dono.nome, email: dados.dono.email, senhaHash },
          conn
        );
        await memberRepository.create({ pizzariaId: pizzaria.id, usuarioId: usuario.id, papel: "dono" }, conn);

        return { pizzaria, dono: { id: usuario.id, nome: usuario.nome, email: usuario.email } };
      });
    } catch (error) {
      // Duas requisições ao mesmo tempo com o mesmo slug/email passam pela checagem prévia
      const err = error as { code?: string; message?: string };
      if (err.code === "ER_DUP_ENTRY") {
        if (err.message?.includes("uq_pizzarias_slug")) throw SLUG_EM_USO();
        if (err.message?.includes("uq_usuarios_email")) throw EMAIL_EM_USO();
      }
      throw error;
    }
  }
}

export const pizzariaService = new pizzariaservice();
