import type { Request, Response } from "express";
import { z } from "zod";
import { categoriaService } from "../services/categoria_service";

const nomeSchema = z.string("Informe o nome").trim().min(1, "Informe o nome").max(100, "Nome muito longo");
const ordemSchema = z.int("ordem deve ser um número inteiro").min(0, "ordem não pode ser negativa");

const criarSchema = z.object({
  nome: nomeSchema,
  tipo: z.enum(["pizza", "produto"], "tipo deve ser pizza ou produto"),
  ordem: ordemSchema.default(0),
});

// Sem tipo: os sabores/produtos já ligados ficariam numa categoria do tipo errado
const editarSchema = z
  .object({
    nome: nomeSchema.optional(),
    ordem: ordemSchema.optional(),
    ativo: z.boolean("ativo deve ser true ou false").optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), "Informe ao menos um campo");

class categoriacontroller {
  // GET /categorias
  list = async (req: Request, res: Response) => {
    res.json(await categoriaService.listar(req.auth!.pizzariaId!));
  };

  // POST /categorias
  create = async (req: Request, res: Response) => {
    res.status(201).json(await categoriaService.criar(req.auth!.pizzariaId!, criarSchema.parse(req.body ?? {})));
  };

  // PATCH /categorias/:id
  edit = async (req: Request<{ id: string }>, res: Response) => {
    res.json(await categoriaService.editar(req.auth!.pizzariaId!, req.params.id, editarSchema.parse(req.body ?? {})));
  };
}

export const categoriaController = new categoriacontroller();
