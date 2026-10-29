import type { Request, Response } from "express";
import { z } from "zod";
import { criarPizzariaComDonoSchema } from "../schemas/pizzaria_schema";
import { authService } from "../services/auth_service";

const trocarSenhaSchema = z.object({
  senha_atual: z.string("Informe a senha atual").min(1, "Informe a senha atual"),
  nova_senha: z
    .string("Informe a nova senha")
    .min(8, "A nova senha precisa ter pelo menos 8 caracteres")
    .max(72, "A nova senha pode ter no máximo 72 caracteres"),
});

const loginSchema = z.object({
  email: z.email("Informe um email válido"),
  senha: z.string("Informe a senha").min(1, "Informe a senha"),
});

class authcontroller {
  // Arrow function para manter o `this` quando o método é passado direto para o router
  login = async (req: Request, res: Response) => {
    const { email, senha } = loginSchema.parse(req.body ?? {});
    const resultado = await authService.login(email, senha);
    res.json(resultado);
  };

  // POST /auth/cadastro (público)
  cadastro = async (req: Request, res: Response) => {
    const dados = criarPizzariaComDonoSchema.parse(req.body ?? {});
    const resultado = await authService.cadastrar(dados);
    res.status(201).json(resultado);
  };

  // POST /auth/trocar-senha
  trocarSenha = async (req: Request, res: Response) => {
    const { senha_atual, nova_senha } = trocarSenhaSchema.parse(req.body ?? {});
    await authService.trocarSenha(req.auth!.usuarioId, senha_atual, nova_senha);
    res.status(204).send();
  };

  // A sessão já foi carregada e validada pelo middleware `autenticar`
  me = async (req: Request, res: Response) => {
    const { membro_id: _, ...sessao } = req.auth!.sessao;
    res.json(sessao);
  };
}

export const authController = new authcontroller();
