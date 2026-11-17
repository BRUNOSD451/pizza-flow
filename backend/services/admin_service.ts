import { AppError } from "../errors/app_error";
import { memberRepository, type MembroComUsuario } from "../repositories/member_repository";
import {
  pizzariaRepository,
  type ListarPizzariasFiltros,
  type PizzariaAdmin,
} from "../repositories/pizzaria_repository";
import { userRepository } from "../repositories/user_repository";
import { gerarSenhaTemporaria, hashSenha } from "../utils/senha";

// Painel do admin da plataforma (dono do SaaS): vê todas as pizzarias e dá suporte.
// Pizzarias só nascem pelo cadastro público; aqui não se cria nem se apaga nenhuma

export interface PizzariaAdminDetalhe extends PizzariaAdmin {
  membros: MembroComUsuario[];
}

const PIZZARIA_NAO_ENCONTRADA = () => new AppError("Pizzaria não encontrada", 404, "PIZZARIA_NAO_ENCONTRADA");

class adminservice {
  async listarPizzarias(filtros: ListarPizzariasFiltros): Promise<PizzariaAdmin[]> {
    return pizzariaRepository.list(filtros);
  }

  async buscarPizzaria(pizzariaId: string): Promise<PizzariaAdminDetalhe> {
    const pizzaria = await pizzariaRepository.findParaAdmin(pizzariaId);
    if (!pizzaria) throw PIZZARIA_NAO_ENCONTRADA();
    return { ...pizzaria, membros: await memberRepository.listByPizzaria(pizzariaId) };
  }

  // Desativada: ninguém da equipe entra (autenticar barra na hora) e o site sai do ar. Os dados ficam
  async alterarAtivo(pizzariaId: string, ativo: boolean): Promise<PizzariaAdminDetalhe> {
    if (!(await pizzariaRepository.edit(pizzariaId, { ativo }))) throw PIZZARIA_NAO_ENCONTRADA();
    return this.buscarPizzaria(pizzariaId);
  }

  // O dono não tem a quem pedir reset dentro da pizzaria: o suporte gera uma senha provisória,
  // devolvida só nesta resposta, e o dono é obrigado a trocar no próximo acesso
  async resetarSenhaDono(pizzariaId: string): Promise<{ dono: MembroComUsuario; senha_temporaria: string }> {
    if (!(await pizzariaRepository.findById(pizzariaId))) throw PIZZARIA_NAO_ENCONTRADA();
    const dono = (await memberRepository.listByPizzaria(pizzariaId)).find((m) => m.papel === "dono");
    if (!dono) throw new AppError("Esta pizzaria não tem dono cadastrado", 404, "DONO_NAO_ENCONTRADO");

    const senhaTemporaria = gerarSenhaTemporaria();
    await userRepository.edit(dono.usuario_id, { senhaHash: await hashSenha(senhaTemporaria), deveTrocarSenha: true });

    return {
      dono: (await memberRepository.findById(pizzariaId, dono.id))!,
      senha_temporaria: senhaTemporaria,
    };
  }
}

export const adminService = new adminservice();
