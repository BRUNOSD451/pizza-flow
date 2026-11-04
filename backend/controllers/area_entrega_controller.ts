import type { Request, Response } from "express";
import { z } from "zod";
import { areaEntregaService } from "../services/area_entrega_service";
import { dinheiroSchema } from "../utils/preco";

const bairroSchema = z.string("Informe o bairro").trim().min(1, "Informe o bairro").max(100, "Bairro muito longo");
const cidadeSchema = z.string("Informe a cidade").trim().min(1, "Informe a cidade").max(100, "Cidade muito longa");
const taxaSchema = dinheiroSchema("taxa");
// null = sem estimativa para o bairro
const tempoSchema = z
  .int("tempo_estimado_min deve ser um número inteiro")
  .min(1, "tempo_estimado_min deve ser maior que zero")
  .max(600, "tempo_estimado_min muito alto")
  .nullable();

const criarSchema = z.object({
  bairro: bairroSchema,
  cidade: cidadeSchema,
  taxa: taxaSchema,
  tempo_estimado_min: tempoSchema.default(null),
});

const editarSchema = z
  .object({
    bairro: bairroSchema.optional(),
    cidade: cidadeSchema.optional(),
    taxa: taxaSchema.optional(),
    tempo_estimado_min: tempoSchema.optional(),
    ativo: z.boolean("ativo deve ser true ou false").optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), "Informe ao menos um campo");

class areaentregacontroller {
  // GET /areas-entrega
  list = async (req: Request, res: Response) => {
    res.json(await areaEntregaService.listar(req.auth!.pizzariaId!));
  };

  // POST /areas-entrega
  create = async (req: Request, res: Response) => {
    const { tempo_estimado_min, ...dados } = criarSchema.parse(req.body ?? {});
    res
      .status(201)
      .json(await areaEntregaService.criar(req.auth!.pizzariaId!, { ...dados, tempoEstimadoMin: tempo_estimado_min }));
  };

  // PATCH /areas-entrega/:id
  edit = async (req: Request<{ id: string }>, res: Response) => {
    const { tempo_estimado_min, ...dados } = editarSchema.parse(req.body ?? {});
    res.json(
      await areaEntregaService.editar(req.auth!.pizzariaId!, req.params.id, {
        ...dados,
        tempoEstimadoMin: tempo_estimado_min,
      })
    );
  };
}

export const areaEntregaController = new areaentregacontroller();
