import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import type { Papel } from "../repositories/member_repository";

// Admin da plataforma não tem pizzaria nem papel
export interface TokenPayload {
  sub: string;
  pizzariaId: string | null;
  papel: Papel | null;
  admin: boolean;
}

const ALGORITMO = "HS256";

export function gerarToken({ sub, ...dados }: TokenPayload): string {
  return jwt.sign(dados, env.jwtSecret, {
    subject: sub,
    algorithm: ALGORITMO,
    expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"],
  });
}

// Lança TokenExpiredError ou JsonWebTokenError quando o token não serve
export function verificarToken(token: string): TokenPayload {
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITMO] });
  if (typeof payload === "string" || !payload.sub) {
    throw new jwt.JsonWebTokenError("payload inválido");
  }
  return {
    sub: payload.sub,
    pizzariaId: payload.pizzariaId ?? null,
    papel: payload.papel ?? null,
    admin: payload.admin === true,
  };
}
