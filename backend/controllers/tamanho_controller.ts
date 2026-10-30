import type { Request, Response } from "express";
import { z } from "zod";
import { tamanhoService } from "../services/tamanho_service";

const nomeSchema = z.string("Informe o nome").trim().min(1, "Informe o nome").max(50, "Nome muito longo");
const fatiasSchema = z.int("fatias deve ser um número inteiro").min(1, "fatias deve ser maior que zero");
const maxSaboresSchema = z.int("max_sabores deve ser um número inteiro").min(1, "max_sabores deve ser ao menos 1");
const ordemSchema = z.int("ordem deve ser um número inteiro").min(0, "ordem não pode ser negativa");

const criarSchema = z.object({
  nome: nomeSchema,
  fatias: fatiasSchema,
  max_sabores: maxSaboresSchema.default(1),
  ordem: ordemSchema.default(0),
});

const editarSchema = z
  .object({
    nome: nomeSchema.optional(),
    fatias: fatiasSchema.optional(),
    max_sabores: maxSaboresSchema.optional(),
    ordem: ordemSchema.optional(),
    ativo: z.boolean("ativo deve ser true ou false").optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), "Informe ao menos um campo");

class tamanhocontroller {
  // GET /tamanhos
  list = async (req: Request, res: Response) => {
    res.json(await tamanhoService.listar(req.auth!.pizzariaId!));
  };

  // POST /tamanhos
  create = async (req: Request, res: Response) => {
    const { max_sabores, ...dados } = criarSchema.parse(req.body ?? {});
    res.status(201).json(await tamanhoService.criar(req.auth!.pizzariaId!, { ...dados, maxSabores: max_sabores }));
  };

  // PATCH /tamanhos/:id
  edit = async (req: Request<{ id: string }>, res: Response) => {
    const { max_sabores, ...dados } = editarSchema.parse(req.body ?? {});
    res.json(await tamanhoService.editar(req.auth!.pizzariaId!, req.params.id, { ...dados, maxSabores: max_sabores }));
  };
}

export const tamanhoController = new tamanhocontroller();
