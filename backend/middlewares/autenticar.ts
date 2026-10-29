import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../errors/app_error";
import { authService, type Sessao } from "../services/auth_service";
import { verificarToken } from "../utils/jwt";
import type { Papel } from "../repositories/member_repository";

// Contexto do usuário logado, disponível em req.auth depois do middleware `autenticar`.
// pizzariaId vem SEMPRE daqui nas rotas da pizzaria, nunca do body/params.
export interface AuthContext {
  usuarioId: string;
  pizzariaId: string | null;
  membroId: string | null;
  papel: Papel | null;
  adminPlataforma: boolean;
  sessao: Sessao;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function lerToken(header: string | undefined): string {
  const [tipo, token] = header?.split(" ") ?? [];
  if (tipo !== "Bearer" || !token) {
    throw new AppError("Token de acesso não informado", 401, "TOKEN_AUSENTE");
  }
  return token;
}

export const autenticar: RequestHandler = async (req, _res, next) => {
  const token = lerToken(req.headers.authorization);

  let payload;
  try {
    payload = verificarToken(token);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError("Sessão expirada, faça login novamente", 401, "TOKEN_EXPIRADO");
    }
    throw new AppError("Token de acesso inválido", 401, "TOKEN_INVALIDO");
  }

  // O banco é a fonte da verdade: papel e pizzaria vêm da sessão atual, não do token
  const sessao = await authService.carregarSessao(payload.sub);

  // Token emitido para outra pizzaria ou antes de virar/deixar de ser admin: precisa logar de novo
  if ((sessao.pizzaria?.id ?? null) !== payload.pizzariaId || sessao.usuario.adminPlataforma !== payload.admin) {
    throw new AppError("Sessão desatualizada, faça login novamente", 401, "TOKEN_INVALIDO");
  }

  req.auth = {
    usuarioId: sessao.usuario.id,
    pizzariaId: sessao.pizzaria?.id ?? null,
    membroId: sessao.membroId,
    papel: sessao.papel,
    adminPlataforma: sessao.usuario.adminPlataforma,
    sessao,
  };
  next();
};
