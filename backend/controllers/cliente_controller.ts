import type { Request, Response } from "express";
import { z } from "zod";
import { telefoneSchema } from "../schemas/pizzaria_schema";
import { clienteService } from "../services/cliente_service";

const nomeSchema = z.string("Informe o nome").trim().min(2, "Nome muito curto").max(150, "Nome muito longo");
const emailSchema = z.email("Informe um email válido").max(255, "Email muito longo").nullable();
const observacoesSchema = z.string("observacoes deve ser texto").trim().max(1000, "Observações muito longas").nullable();

const listarSchema = z.object({
  busca: z.string().trim().max(100, "Busca muito longa").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const criarClienteSchema = z.object({
  nome: nomeSchema,
  telefone: telefoneSchema,
  email: emailSchema.default(null),
  observacoes: observacoesSchema.default(null),
});

const editarClienteSchema = z
  .object({
    nome: nomeSchema.optional(),
    telefone: telefoneSchema.optional(),
    email: emailSchema.optional(),
    observacoes: observacoesSchema.optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), "Informe ao menos um campo");

function textoEndereco(campo: string, maximo: number) {
  return z.string(`Informe ${campo}`).trim().min(1, `Informe ${campo}`).max(maximo, `${campo} muito longo`);
}

const areaEntregaIdSchema = z.uuid("area_entrega_id inválido").nullable();
// Salvo só com dígitos
const cepSchema = z
  .string("cep deve ser texto")
  .transform((cep) => cep.replace(/\D/g, ""))
  .refine((cep) => cep.length === 8, "CEP deve ter 8 dígitos")
  .nullable();
const logradouroSchema = textoEndereco("logradouro", 200);
const numeroSchema = textoEndereco("numero", 20);
const complementoSchema = z.string("complemento deve ser texto").trim().max(100, "complemento muito longo").nullable();
const bairroSchema = textoEndereco("bairro", 100);
const cidadeSchema = textoEndereco("cidade", 100);
const estadoSchema = z
  .string("Informe o estado")
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use a sigla do estado (ex.: SP)");
const referenciaSchema = z.string("referencia deve ser texto").trim().max(200, "referencia muito longa").nullable();
const principalSchema = z.boolean("principal deve ser true ou false");

const criarEnderecoSchema = z
  .object({
    area_entrega_id: areaEntregaIdSchema.default(null),
    cep: cepSchema.default(null),
    logradouro: logradouroSchema,
    numero: numeroSchema,
    complemento: complementoSchema.default(null),
    bairro: bairroSchema.optional(),
    cidade: cidadeSchema.optional(),
    estado: estadoSchema,
    referencia: referenciaSchema.default(null),
    principal: principalSchema.default(false),
  })
  .refine((dados) => dados.area_entrega_id || (dados.bairro && dados.cidade), "Informe bairro e cidade, ou area_entrega_id");

const editarEnderecoSchema = z
  .object({
    area_entrega_id: areaEntregaIdSchema.optional(),
    cep: cepSchema.optional(),
    logradouro: logradouroSchema.optional(),
    numero: numeroSchema.optional(),
    complemento: complementoSchema.optional(),
    bairro: bairroSchema.optional(),
    cidade: cidadeSchema.optional(),
    estado: estadoSchema.optional(),
    referencia: referenciaSchema.optional(),
    principal: principalSchema.optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), "Informe ao menos um campo");

type ParamsCliente = { id: string };
type ParamsEndereco = { id: string; enderecoId: string };

class clientecontroller {
  // GET /clientes?busca=&limit=&offset=
  list = async (req: Request, res: Response) => {
    res.json(await clienteService.listar(req.auth!.pizzariaId!, listarSchema.parse(req.query)));
  };

  // GET /clientes/:id
  show = async (req: Request<ParamsCliente>, res: Response) => {
    res.json(await clienteService.buscar(req.auth!.pizzariaId!, req.params.id));
  };

  // POST /clientes
  create = async (req: Request, res: Response) => {
    res.status(201).json(await clienteService.criar(req.auth!.pizzariaId!, criarClienteSchema.parse(req.body ?? {})));
  };

  // PATCH /clientes/:id
  edit = async (req: Request<ParamsCliente>, res: Response) => {
    const dados = editarClienteSchema.parse(req.body ?? {});
    res.json(await clienteService.editar(req.auth!.pizzariaId!, req.params.id, dados));
  };

  // POST /clientes/:id/enderecos
  createEndereco = async (req: Request<ParamsCliente>, res: Response) => {
    const { area_entrega_id, ...dados } = criarEnderecoSchema.parse(req.body ?? {});
    res
      .status(201)
      .json(await clienteService.criarEndereco(req.auth!.pizzariaId!, req.params.id, { ...dados, areaEntregaId: area_entrega_id }));
  };

  // PATCH /clientes/:id/enderecos/:enderecoId
  editEndereco = async (req: Request<ParamsEndereco>, res: Response) => {
    const { area_entrega_id, ...dados } = editarEnderecoSchema.parse(req.body ?? {});
    res.json(
      await clienteService.editarEndereco(req.auth!.pizzariaId!, req.params.id, req.params.enderecoId, {
        ...dados,
        areaEntregaId: area_entrega_id,
      })
    );
  };

  // DELETE /clientes/:id/enderecos/:enderecoId
  removeEndereco = async (req: Request<ParamsEndereco>, res: Response) => {
    await clienteService.removerEndereco(req.auth!.pizzariaId!, req.params.id, req.params.enderecoId);
    res.status(204).send();
  };
}

export const clienteController = new clientecontroller();
