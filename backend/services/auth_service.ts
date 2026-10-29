import bcrypt from "bcryptjs";
import { AppError } from "../errors/app_error";
import { userRepository, type Usuario } from "../repositories/user_repository";
import { memberRepository, type Papel } from "../repositories/member_repository";
import { pizzariaService, type CriarPizzariaComDonoDados } from "./pizzaria_service";
import { gerarToken } from "../utils/jwt";
import { compararSenha, hashSenha } from "../utils/senha";

// Quem está logado e onde: admin da plataforma não tem pizzaria, papel nem membro.
// Campos em snake_case porque a sessão sai direto no JSON do login e do /auth/me.
export interface Sessao {
  // deve_trocar_senha = true: senha provisória; o app deve levar para a tela de troca
  usuario: { id: string; nome: string; email: string; admin_plataforma: boolean; deve_trocar_senha: boolean };
  pizzaria: { id: string; nome: string; slug: string } | null;
  papel: Papel | null;
  membro_id: string | null;
}

export interface LoginResultado extends Omit<Sessao, "membro_id"> {
  token: string;
}

// Hash válido de uma senha qualquer: quando o email não existe, ainda comparamos contra ele
// para a resposta levar o mesmo tempo e não revelar quais emails têm conta
const HASH_FALSO = bcrypt.hashSync("senha-que-nunca-vai-bater", 10);

class authservice {
  async login(email: string, senha: string): Promise<LoginResultado> {
    const usuario = await userRepository.findByEmail(email);
    const senhaConfere = await compararSenha(senha, usuario?.senha_hash ?? HASH_FALSO);

    if (!usuario || !senhaConfere) {
      throw new AppError("Email ou senha inválidos", 401, "CREDENCIAIS_INVALIDAS");
    }

    const { membro_id: _, ...sessao } = await this.montarSessao(usuario);
    const token = gerarToken({
      sub: usuario.id,
      pizzariaId: sessao.pizzaria?.id ?? null,
      papel: sessao.papel,
      admin: sessao.usuario.admin_plataforma,
    });

    return { token, ...sessao };
  }

  // Cadastro público: o dono cria a conta e a pizzaria de uma vez e já sai logado
  async cadastrar(dados: CriarPizzariaComDonoDados): Promise<LoginResultado> {
    await pizzariaService.criarComDono(dados);
    return this.login(dados.dono.email, dados.dono.senha);
  }

  // Troca feita pelo próprio usuário; também libera quem estava com senha provisória
  async trocarSenha(usuarioId: string, senhaAtual: string, novaSenha: string): Promise<void> {
    const usuario = await userRepository.findById(usuarioId);
    const comSenha = usuario && (await userRepository.findByEmail(usuario.email));
    if (!comSenha || !(await compararSenha(senhaAtual, comSenha.senha_hash))) {
      throw new AppError("Senha atual incorreta", 401, "SENHA_ATUAL_INCORRETA");
    }
    if (senhaAtual === novaSenha) {
      throw new AppError("A nova senha precisa ser diferente da atual", 400, "SENHA_REPETIDA");
    }

    await userRepository.edit(usuarioId, { senhaHash: await hashSenha(novaSenha), deveTrocarSenha: false });
  }

  // Usado a cada requisição autenticada: reflete na hora desligamentos e trocas de papel,
  // mesmo que o token ainda esteja dentro da validade
  async carregarSessao(usuarioId: string): Promise<Sessao> {
    const usuario = await userRepository.findById(usuarioId);
    if (!usuario) {
      throw new AppError("Sessão inválida, faça login novamente", 401, "TOKEN_INVALIDO");
    }
    return this.montarSessao(usuario);
  }

  private async montarSessao(usuario: Usuario): Promise<Sessao> {
    const dadosUsuario = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      admin_plataforma: usuario.admin_plataforma,
      deve_trocar_senha: usuario.deve_trocar_senha,
    };

    if (usuario.admin_plataforma) {
      return { usuario: dadosUsuario, pizzaria: null, papel: null, membro_id: null };
    }

    const membro = await memberRepository.findByUsuario(usuario.id);
    if (!membro) {
      throw new AppError("Usuário sem pizzaria vinculada", 403, "SEM_PIZZARIA");
    }
    if (!membro.ativo) {
      throw new AppError("Seu acesso a esta pizzaria foi desativado", 403, "MEMBRO_INATIVO");
    }
    if (!membro.pizzaria_ativa) {
      throw new AppError("Esta pizzaria está desativada", 403, "PIZZARIA_INATIVA");
    }

    return {
      usuario: dadosUsuario,
      pizzaria: { id: membro.pizzaria_id, nome: membro.pizzaria_nome, slug: membro.pizzaria_slug },
      papel: membro.papel,
      membro_id: membro.id,
    };
  }
}

export const authService = new authservice();
