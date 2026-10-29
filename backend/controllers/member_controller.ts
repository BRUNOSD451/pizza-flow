import type { Request, Response } from "express";
import { z } from "zod";
import { PAPEIS } from "../repositories/member_repository";
import { memberService } from "../services/member_service";

// "dono" fica de fora: só existe um por pizzaria, criado no cadastro
const PAPEIS_EQUIPE = PAPEIS.filter((papel) => papel !== "dono") as [
  Exclude<(typeof PAPEIS)[number], "dono">,
  ...Exclude<(typeof PAPEIS)[number], "dono">[],
];

const papelSchema = z.enum(PAPEIS_EQUIPE, `Papel inválido. Use: ${PAPEIS_EQUIPE.join(", ")}`);

const criarSchema = z.object({
  nome: z.string("Informe o nome").trim().min(2, "Nome muito curto").max(150),
  email: z.email("Informe um email válido"),
  papel: papelSchema,
});

const editarSchema = z
  .object({
    papel: papelSchema.optional(),
    ativo: z.boolean("ativo deve ser true ou false").optional(),
  })
  .refine((dados) => dados.papel !== undefined || dados.ativo !== undefined, "Informe papel e/ou ativo");

class membercontroller {
  // GET /membros
  list = async (req: Request, res: Response) => {
    res.json(await memberService.listar(req.auth!.pizzariaId!));
  };

  // POST /membros → devolve a senha provisória UMA vez, para o dono repassar ao funcionário
  create = async (req: Request, res: Response) => {
    const dados = criarSchema.parse(req.body ?? {});
    res.status(201).json(await memberService.criar(req.auth!.pizzariaId!, dados));
  };

  // PATCH /membros/:id
  edit = async (req: Request<{ id: string }>, res: Response) => {
    const dados = editarSchema.parse(req.body ?? {});
    res.json(await memberService.editar(req.auth!, req.params.id, dados));
  };

  // POST /membros/:id/resetar-senha
  resetarSenha = async (req: Request<{ id: string }>, res: Response) => {
    res.json(await memberService.resetarSenha(req.auth!, req.params.id));
  };
}

export const memberController = new membercontroller();
