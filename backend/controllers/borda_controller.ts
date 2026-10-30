import type { Request, Response } from "express";
import { z } from "zod";
import { bordaService } from "../services/borda_service";
import { precosPorTamanhoSchema } from "../utils/preco";

const nomeSchema = z.string("Informe o nome").trim().min(1, "Informe o nome").max(100, "Nome muito longo");

const criarSchema = z.object({
  nome: nomeSchema,
  precos: precosPorTamanhoSchema(),
});

const editarSchema = z
  .object({
    nome: nomeSchema.optional(),
    ativo: z.boolean("ativo deve ser true ou false").optional(),
    precos: precosPorTamanhoSchema().optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), "Informe ao menos um campo");

class bordacontroller {
  // GET /bordas
  list = async (req: Request, res: Response) => {
    res.json(await bordaService.listar(req.auth!.pizzariaId!));
  };

  // POST /bordas
  create = async (req: Request, res: Response) => {
    const dados = criarSchema.parse(req.body ?? {});
    res.status(201).json(await bordaService.criar(req.auth!.pizzariaId!, dados));
  };

  // PATCH /bordas/:id
  edit = async (req: Request<{ id: string }>, res: Response) => {
    const dados = editarSchema.parse(req.body ?? {});
    res.json(await bordaService.editar(req.auth!.pizzariaId!, req.params.id, dados));
  };
}

export const bordaController = new bordacontroller();
