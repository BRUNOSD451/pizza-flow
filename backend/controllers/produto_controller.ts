import type { Request, Response } from "express";
import { z } from "zod";
import { produtoService } from "../services/produto_service";
import { precoSchema } from "../utils/preco";

const nomeSchema = z.string("Informe o nome").trim().min(1, "Informe o nome").max(100, "Nome muito longo");
const categoriaIdSchema = z.uuid("categoria_id inválido").nullable();
const descricaoSchema = z.string("descricao deve ser texto").trim().max(1000, "Descrição muito longa").nullable();
const imagemUrlSchema = z.url("imagem_url inválida").max(500, "imagem_url muito longa").nullable();

const criarSchema = z.object({
  nome: nomeSchema,
  preco: precoSchema,
  categoria_id: categoriaIdSchema.default(null),
  descricao: descricaoSchema.default(null),
  imagem_url: imagemUrlSchema.default(null),
});

const editarSchema = z
  .object({
    nome: nomeSchema.optional(),
    preco: precoSchema.optional(),
    categoria_id: categoriaIdSchema.optional(),
    descricao: descricaoSchema.optional(),
    imagem_url: imagemUrlSchema.optional(),
    ativo: z.boolean("ativo deve ser true ou false").optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), "Informe ao menos um campo");

class produtocontroller {
  // GET /produtos
  list = async (req: Request, res: Response) => {
    res.json(await produtoService.listar(req.auth!.pizzariaId!));
  };

  // POST /produtos
  create = async (req: Request, res: Response) => {
    const { categoria_id, imagem_url, ...dados } = criarSchema.parse(req.body ?? {});
    res
      .status(201)
      .json(await produtoService.criar(req.auth!.pizzariaId!, { ...dados, categoriaId: categoria_id, imagemUrl: imagem_url }));
  };

  // PATCH /produtos/:id
  edit = async (req: Request<{ id: string }>, res: Response) => {
    const { categoria_id, imagem_url, ...dados } = editarSchema.parse(req.body ?? {});
    res.json(
      await produtoService.editar(req.auth!.pizzariaId!, req.params.id, {
        ...dados,
        categoriaId: categoria_id,
        imagemUrl: imagem_url,
      })
    );
  };
}

export const produtoController = new produtocontroller();
