import type { RequestHandler } from "express";
import { AppError } from "../errors/app_error";
import type { Papel } from "../repositories/member_repository";

// Usar sempre depois de `autenticar`, que preenche req.auth com o papel atual (lido do banco)

// Rotas da pizzaria. O admin da plataforma não tem papel, então não passa aqui:
// ações dele em pizzarias vão por rotas próprias (/admin)
export function exigirPapel(...papeis: Papel[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw new AppError("Token de acesso não informado", 401, "TOKEN_AUSENTE");
    if (!req.auth.papel || !papeis.includes(req.auth.papel)) {
      throw new AppError("Você não tem permissão para esta ação", 403, "SEM_PERMISSAO");
    }
    next();
  };
}

export const exigirAdminPlataforma: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw new AppError("Token de acesso não informado", 401, "TOKEN_AUSENTE");
  if (!req.auth.adminPlataforma) {
    throw new AppError("Você não tem permissão para esta ação", 403, "SEM_PERMISSAO");
  }
  next();
};
