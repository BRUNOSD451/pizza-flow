import type { Request, Response } from "express";
import { z } from "zod";
import { adminService } from "../services/admin_service";

const listarSchema = z.object({
  ativo: z.enum(["true", "false"], "ativo deve ser true ou false").transform((v) => v === "true").optional(),
  busca: z.string().trim().max(100, "Busca muito longa").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const alterarSchema = z.object({
  ativo: z.boolean("ativo deve ser true ou false"),
});

const paramsSchema = z.object({ id: z.uuid("id inválido") });

class admincontroller {
  // GET /admin/pizzarias?ativo=&busca=&limit=&offset=
  listarPizzarias = async (req: Request, res: Response) => {
    res.json(await adminService.listarPizzarias(listarSchema.parse(req.query)));
  };

  // GET /admin/pizzarias/:id → pizzaria com dono, números de uso e equipe
  buscarPizzaria = async (req: Request, res: Response) => {
    res.json(await adminService.buscarPizzaria(paramsSchema.parse(req.params).id));
  };

  // PATCH /admin/pizzarias/:id
  alterarPizzaria = async (req: Request, res: Response) => {
    const { ativo } = alterarSchema.parse(req.body ?? {});
    res.json(await adminService.alterarAtivo(paramsSchema.parse(req.params).id, ativo));
  };

  // POST /admin/pizzarias/:id/resetar-senha-dono
  resetarSenhaDono = async (req: Request, res: Response) => {
    res.json(await adminService.resetarSenhaDono(paramsSchema.parse(req.params).id));
  };
}

export const adminController = new admincontroller();
