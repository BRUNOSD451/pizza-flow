import type { Request, Response } from "express";
import { z } from "zod";
import { adicionalService } from "../services/adicional_service";
import { precoSchema, precosPorTamanhoSchema } from "../utils/preco";

const nomeSchema = z.string("Informe o nome").trim().min(1, "Informe o nome").max(100, "Nome muito longo");

// preco é o padrão; precos são os preços próprios por tamanho (opcionais)
const criarSchema = z.object({
  nome: nomeSchema,
  preco: precoSchema,
  precos: precosPorTamanhoSchema(0).default([]),
});

const editarSchema = z
  .object({
    nome: nomeSchema.optional(),
    preco: precoSchema.optional(),
    ativo: z.boolean("ativo deve ser true ou false").optional(),
    precos: precosPorTamanhoSchema(0).optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), "Informe ao menos um campo");

class adicionalcontroller {
  // GET /adicionais
  list = async (req: Request, res: Response) => {
    res.json(await adicionalService.listar(req.auth!.pizzariaId!));
  };

  // POST /adicionais
  create = async (req: Request, res: Response) => {
    const dados = criarSchema.parse(req.body ?? {});
    res.status(201).json(await adicionalService.criar(req.auth!.pizzariaId!, dados));
  };

  // PATCH /adicionais/:id
  edit = async (req: Request<{ id: string }>, res: Response) => {
    const dados = editarSchema.parse(req.body ?? {});
    res.json(await adicionalService.editar(req.auth!.pizzariaId!, req.params.id, dados));
  };
}

export const adicionalController = new adicionalcontroller();
