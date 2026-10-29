import { withTransaction } from "../db/db";
import { AppError } from "../errors/app_error";
import {
  memberRepository,
  type EditarMembroDados,
  type MembroComUsuario,
  type Papel,
} from "../repositories/member_repository";
import { userRepository } from "../repositories/user_repository";
import { gerarSenhaTemporaria, hashSenha } from "../utils/senha";
import type { AuthContext } from "../middlewares/autenticar";

// Papéis que o dono pode dar a um membro: só existe um dono por pizzaria, criado no cadastro
export type PapelEquipe = Exclude<Papel, "dono">;

export interface CriarMembroEquipeDados {
  nome: string;
  email: string;
  papel: PapelEquipe;
}

export interface EditarMembroEquipeDados extends EditarMembroDados {
  papel?: PapelEquipe;
}

// A senha provisória só existe nesta resposta: no banco fica apenas o hash
export interface MembroComSenhaTemporaria {
  membro: MembroComUsuario;
  senha_temporaria: string;
}

const EMAIL_EM_USO = () =>
  new AppError("Este email já está cadastrado. Cada usuário pertence a uma única pizzaria.", 409, "EMAIL_EM_USO");

class memberservice {
  async listar(pizzariaId: string): Promise<MembroComUsuario[]> {
    return memberRepository.listByPizzaria(pizzariaId);
  }

  // Cria o usuário com senha aleatória e já o liga à pizzaria; no primeiro login ele é obrigado a trocar
  async criar(pizzariaId: string, dados: CriarMembroEquipeDados): Promise<MembroComSenhaTemporaria> {
    if (await userRepository.findByEmail(dados.email)) throw EMAIL_EM_USO();

    const senhaTemporaria = gerarSenhaTemporaria();
    const senhaHash = await hashSenha(senhaTemporaria);

    try {
      const membro = await withTransaction(async (conn) => {
        const usuario = await userRepository.create(
          { nome: dados.nome, email: dados.email, senhaHash, deveTrocarSenha: true },
          conn
        );
        const criado = await memberRepository.create({ pizzariaId, usuarioId: usuario.id, papel: dados.papel }, conn);
        return (await memberRepository.findById(pizzariaId, criado.id, conn))!;
      });
      return { membro, senha_temporaria: senhaTemporaria };
    } catch (error) {
      // Dois cadastros ao mesmo tempo com o mesmo email passam pela checagem prévia
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw EMAIL_EM_USO();
      throw error;
    }
  }

  // Troca de papel e desligamento/reativação
  async editar(auth: AuthContext, membroId: string, dados: EditarMembroEquipeDados): Promise<MembroComUsuario> {
    await this.buscarAlteravel(auth, membroId);
    return (await memberRepository.edit(auth.pizzariaId!, membroId, dados))!;
  }

  // Para quando o funcionário esquece a senha: gera outra provisória e exige troca no próximo acesso
  async resetarSenha(auth: AuthContext, membroId: string): Promise<MembroComSenhaTemporaria> {
    const membro = await this.buscarAlteravel(auth, membroId);

    const senhaTemporaria = gerarSenhaTemporaria();
    await userRepository.edit(membro.usuario_id, {
      senhaHash: await hashSenha(senhaTemporaria),
      deveTrocarSenha: true,
    });

    return {
      membro: (await memberRepository.findById(auth.pizzariaId!, membroId))!,
      senha_temporaria: senhaTemporaria,
    };
  }

  // Busca o membro na pizzaria de quem está logado e barra alterações no dono
  private async buscarAlteravel(auth: AuthContext, membroId: string): Promise<MembroComUsuario> {
    const membro = await memberRepository.findById(auth.pizzariaId!, membroId);
    if (!membro) {
      throw new AppError("Membro não encontrado", 404, "MEMBRO_NAO_ENCONTRADO");
    }
    if (membro.id === auth.membroId) {
      throw new AppError("Você não pode alterar o seu próprio acesso por aqui", 400, "ALTERAR_PROPRIO_ACESSO");
    }
    if (membro.papel === "dono") {
      throw new AppError("O dono da pizzaria não pode ser alterado", 403, "ALTERAR_DONO");
    }
    return membro;
  }
}

export const memberService = new memberservice();
