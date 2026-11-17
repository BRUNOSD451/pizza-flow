import type { Request, Response } from "express";
import { z } from "zod";
import { mesaService } from "../services/mesa_service";

const nomeSchema = z.string("Informe o nome da mesa").trim().min(1, "Informe o nome da mesa").max(20, "Nome muito longo");
// null = sem número de lugares definido
const lugaresSchema = z
  .int("lugares deve ser um número inteiro")
  .min(1, "lugares deve ser maior que zero")
  .max(100, "lugares muito alto")
  .nullable();

const criarSchema = z.object({
  nome: nomeSchema,
  lugares: lugaresSchema.default(null),
});

const editarSchema = z
  .object({
    nome: nomeSchema.optional(),
    lugares: lugaresSchema.optional(),
    ativo: z.boolean("ativo deve ser true ou false").optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), "Informe ao menos um campo");

class mesacontroller {
  // GET /mesas
  list = async (req: Request, res: Response) => {
    res.json(await mesaService.listar(req.auth!.pizzariaId!));
  };

  // POST /mesas
  create = async (req: Request, res: Response) => {
    res.status(201).json(await mesaService.criar(req.auth!.pizzariaId!, criarSchema.parse(req.body ?? {})));
  };

  // PATCH /mesas/:id
  edit = async (req: Request<{ id: string }>, res: Response) => {
    res.json(await mesaService.editar(req.auth!.pizzariaId!, req.params.id, editarSchema.parse(req.body ?? {})));
  };
}

export const mesaController = new mesacontroller();
