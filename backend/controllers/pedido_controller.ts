import type { Request, Response } from "express";
import { z } from "zod";
import type { ItemSolicitado } from "../services/pedido_calculo";
import { pedidoService } from "../services/pedido_service";
import { STATUS_PEDIDO, TIPOS_PEDIDO } from "../services/pedido_transicoes";
import { dinheiroSchema } from "../utils/preco";

const tipoSchema = z.enum(TIPOS_PEDIDO, `Tipo inválido. Use: ${TIPOS_PEDIDO.join(", ")}`);
const observacaoSchema = z.string("observacao deve ser texto").trim().max(500, "Observação muito longa").nullable().default(null);
const quantidadeSchema = z.int("quantidade deve ser um número inteiro").min(1, "quantidade mínima é 1").max(99, "quantidade máxima é 99").default(1);

const adicionaisSchema = z
  .array(
    z.object({
      adicional_id: z.uuid("adicional_id inválido"),
      quantidade: z.int("quantidade deve ser um número inteiro").min(1, "quantidade mínima é 1").max(20, "quantidade máxima é 20").default(1),
    }),
    "adicionais deve ser uma lista"
  )
  .max(20, "Adicionais demais no item")
  .default([]);

// Valores enviados pelo cliente são ignorados: o preço é sempre recalculado no backend
const itemPizzaSchema = z.object({
  tipo: z.literal("pizza"),
  tamanho_id: z.uuid("tamanho_id inválido"),
  borda_id: z.uuid("borda_id inválido").nullable().default(null),
  sabores: z
    .array(
      z.object({
        sabor_id: z.uuid("sabor_id inválido"),
        partes: z.int("partes deve ser um número inteiro").min(1, "partes mínima é 1").max(20, "partes máxima é 20").default(1),
      }),
      "Informe os sabores"
    )
    .min(1, "Informe ao menos um sabor")
    .max(20, "Sabores demais no item"),
  adicionais: adicionaisSchema,
  quantidade: quantidadeSchema,
  observacao: observacaoSchema,
});

const itemProdutoSchema = z.object({
  tipo: z.literal("produto"),
  produto_id: z.uuid("produto_id inválido"),
  adicionais: adicionaisSchema,
  quantidade: quantidadeSchema,
  observacao: observacaoSchema,
});

const itemSchema = z
  .discriminatedUnion("tipo", [itemPizzaSchema, itemProdutoSchema], "tipo do item deve ser 'pizza' ou 'produto'")
  .transform((item): ItemSolicitado => {
    const adicionais = item.adicionais.map((a) => ({ adicionalId: a.adicional_id, quantidade: a.quantidade }));
    const comum = { adicionais, quantidade: item.quantidade, observacao: item.observacao };
    if (item.tipo === "produto") return { ...comum, tipo: "produto", produtoId: item.produto_id };
    return {
      ...comum,
      tipo: "pizza",
      tamanhoId: item.tamanho_id,
      bordaId: item.borda_id,
      sabores: item.sabores.map((s) => ({ saborId: s.sabor_id, partes: s.partes })),
    };
  });

const criarSchema = z
  .object({
    chave_idempotencia: z.string("Informe chave_idempotencia").trim().min(8, "chave_idempotencia muito curta").max(64, "chave_idempotencia muito longa"),
    tipo: tipoSchema,
    origem: z.enum(["balcao", "whatsapp"], "origem deve ser 'balcao' ou 'whatsapp'").default("balcao"),
    cliente_id: z.uuid("cliente_id inválido").nullable().default(null),
    endereco_id: z.uuid("endereco_id inválido").nullable().default(null),
    desconto: dinheiroSchema("desconto").default("0.00"),
    observacao: observacaoSchema,
    itens: z.array(itemSchema, "Informe os itens").min(1, "Informe ao menos um item").max(50, "Itens demais no pedido"),
  })
  .refine((dados) => dados.tipo !== "delivery" || (dados.cliente_id && dados.endereco_id), {
    error: "Delivery exige cliente_id e endereco_id",
    path: ["endereco_id"],
  })
  .refine((dados) => dados.tipo === "delivery" || !dados.endereco_id, {
    error: "endereco_id só vale para delivery",
    path: ["endereco_id"],
  });

const listarSchema = z.object({
  // Um ou vários, separados por vírgula: ?status=recebido,preparando
  status: z
    .string()
    .transform((valor) => valor.split(",").map((s) => s.trim()))
    .pipe(z.array(z.enum(STATUS_PEDIDO, `Status inválido. Use: ${STATUS_PEDIDO.join(", ")}`)))
    .optional(),
  tipo: tipoSchema.optional(),
  de: z.coerce.date("de deve ser uma data").optional(),
  ate: z.coerce.date("ate deve ser uma data").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const mudarStatusSchema = z
  .object({
    status: z.enum(STATUS_PEDIDO, `Status inválido. Use: ${STATUS_PEDIDO.join(", ")}`),
    motivo_cancelamento: z.string("motivo_cancelamento deve ser texto").trim().min(3, "Motivo muito curto").max(500, "Motivo muito longo").optional(),
  })
  .refine((dados) => dados.status !== "cancelado" || dados.motivo_cancelamento, {
    error: "Informe o motivo do cancelamento",
    path: ["motivo_cancelamento"],
  });

const atribuirEntregadorSchema = z.object({
  entregador_id: z.uuid("entregador_id inválido").nullable(),
});

type ParamsPedido = { id: string };

class pedidocontroller {
  // POST /pedidos → 201 se criou; 200 se a chave de idempotência já existia
  create = async (req: Request, res: Response) => {
    const { chave_idempotencia, cliente_id, endereco_id, ...dados } = criarSchema.parse(req.body ?? {});
    const { pedido, criado } = await pedidoService.criar(req.auth!, {
      ...dados,
      chaveIdempotencia: chave_idempotencia,
      clienteId: cliente_id,
      enderecoId: endereco_id,
    });
    res.status(criado ? 201 : 200).json(pedido);
  };

  // GET /pedidos?status=&tipo=&de=&ate=&limit=&offset=
  list = async (req: Request, res: Response) => {
    res.json(await pedidoService.listar(req.auth!.pizzariaId!, listarSchema.parse(req.query)));
  };

  // GET /pedidos/cozinha
  cozinha = async (req: Request, res: Response) => {
    res.json(await pedidoService.filaCozinha(req.auth!.pizzariaId!));
  };

  // GET /pedidos/minhas-entregas
  minhasEntregas = async (req: Request, res: Response) => {
    res.json(await pedidoService.minhasEntregas(req.auth!));
  };

  // GET /pedidos/:id
  show = async (req: Request<ParamsPedido>, res: Response) => {
    res.json(await pedidoService.buscar(req.auth!, req.params.id));
  };

  // PATCH /pedidos/:id/status
  mudarStatus = async (req: Request<ParamsPedido>, res: Response) => {
    const { status, motivo_cancelamento } = mudarStatusSchema.parse(req.body ?? {});
    res.json(await pedidoService.mudarStatus(req.auth!, req.params.id, status, status === "cancelado" ? motivo_cancelamento! : null));
  };

  // PATCH /pedidos/:id/entregador
  atribuirEntregador = async (req: Request<ParamsPedido>, res: Response) => {
    const { entregador_id } = atribuirEntregadorSchema.parse(req.body ?? {});
    res.json(await pedidoService.atribuirEntregador(req.auth!, req.params.id, entregador_id));
  };
}

export const pedidoController = new pedidocontroller();
