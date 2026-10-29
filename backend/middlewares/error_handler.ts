import type { ErrorRequestHandler, RequestHandler } from "express";
import { z, ZodError } from "zod";
import { AppError } from "../errors/app_error";

// Mensagens de validação do zod em português (vale para todos os schemas da API)
z.config(z.locales.pt());

// Formato único de erro da API: { erro: { mensagem, codigo?, campos? } }

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ erro: { mensagem: `Rota não encontrada: ${req.method} ${req.path}` } });
};

// Express 5 já encaminha para cá erros lançados em handlers async
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ erro: { mensagem: error.message, codigo: error.code } });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      erro: {
        mensagem: "Dados inválidos",
        codigo: "VALIDACAO",
        campos: error.issues.map((issue) => ({
          campo: issue.path.join("."),
          mensagem: issue.message,
        })),
      },
    });
    return;
  }

  // JSON malformado no body (lançado pelo express.json())
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ erro: { mensagem: "JSON inválido no corpo da requisição" } });
    return;
  }

  console.error(`[${req.method} ${req.path}]`, error);
  res.status(500).json({ erro: { mensagem: "Erro interno do servidor" } });
};
