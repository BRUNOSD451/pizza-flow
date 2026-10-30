import type { Request, Response } from "express";
import { z } from "zod";
import { TIPOS_SABOR } from "../repositories/sabor_repository";
import { saborService } from "../services/sabor_service";
import { precosPorTamanhoSchema } from "../utils/preco";

const nomeSchema = z.string("Informe o nome").trim().min(1, "Informe o nome").max(100, "Nome muito longo");
const tipoSchema = z.enum(TIPOS_SABOR, `Tipo inválido. Use: ${TIPOS_SABOR.join(", ")}`);
const categoriaIdSchema = z.uuid("categoria_id inválido").nullable();
const descricaoSchema = z.string("descricao deve ser texto").trim().max(1000, "Descrição muito longa").nullable();
const imagemUrlSchema = z.url("imagem_url inválida").max(500, "imagem_url muito longa").nullable();

const criarSchema = z.object({
  nome: nomeSchema,
  tipo: tipoSchema.default("salgada"),
  categoria_id: categoriaIdSchema.default(null),
  descricao: descricaoSchema.default(null),
  imagem_url: imagemUrlSchema.default(null),
  precos: precosPorTamanhoSchema(),
});

const editarSchema = z
  .object({
    nome: nomeSchema.optional(),
    tipo: tipoSchema.optional(),
    categoria_id: categoriaIdSchema.optional(),
    descricao: descricaoSchema.optional(),
    imagem_url: imagemUrlSchema.optional(),
    ativo: z.boolean("ativo deve ser true ou false").optional(),
    precos: precosPorTamanhoSchema().optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), "Informe ao menos um campo");

class saborcontroller {
  // GET /sabores
  list = async (req: Request, res: Response) => {
    res.json(await saborService.listar(req.auth!.pizzariaId!));
  };

  // POST /sabores
  create = async (req: Request, res: Response) => {
    const { categoria_id, imagem_url, ...dados } = criarSchema.parse(req.body ?? {});
    res
      .status(201)
      .json(await saborService.criar(req.auth!.pizzariaId!, { ...dados, categoriaId: categoria_id, imagemUrl: imagem_url }));
  };

  // PATCH /sabores/:id
  edit = async (req: Request<{ id: string }>, res: Response) => {
    const { categoria_id, imagem_url, ...dados } = editarSchema.parse(req.body ?? {});
    res.json(
      await saborService.editar(req.auth!.pizzariaId!, req.params.id, {
        ...dados,
        categoriaId: categoria_id,
        imagemUrl: imagem_url,
      })
    );
  };
}

export const saborController = new saborcontroller();
