import type { Request, Response } from "express";
import { z } from "zod";
import { telefoneSchema } from "../schemas/pizzaria_schema";
import { siteService } from "../services/site_service";
import {
  bairroSchema,
  cepSchema,
  cidadeSchema,
  complementoSchema,
  emailSchema,
  estadoSchema,
  logradouroSchema,
  nomeSchema,
  numeroSchema,
  referenciaSchema,
} from "./cliente_controller";
import { formaPagamentoSchema, trocoParaSchema } from "./pagamento_controller";
import { chaveIdempotenciaSchema, itensSchema, observacaoSchema } from "./pedido_controller";

// Com áreas de entrega cadastradas, area_entrega_id é obrigatório (o service confere); sem, bairro e cidade
const enderecoSchema = z.object({
  area_entrega_id: z.uuid("area_entrega_id inválido").nullable().default(null),
  cep: cepSchema.default(null),
  logradouro: logradouroSchema,
  numero: numeroSchema,
  complemento: complementoSchema.default(null),
  bairro: bairroSchema.nullable().default(null),
  cidade: cidadeSchema.nullable().default(null),
  estado: estadoSchema,
  referencia: referenciaSchema.default(null),
});

// Valores enviados pelo cliente são ignorados: o preço é sempre recalculado no backend
const criarPedidoSchema = z
  .object({
    chave_idempotencia: chaveIdempotenciaSchema,
    tipo: z.enum(["delivery", "retirada"], "tipo deve ser 'delivery' ou 'retirada'"),
    cliente: z.object({
      nome: nomeSchema,
      telefone: telefoneSchema,
      email: emailSchema.default(null),
    }),
    endereco: enderecoSchema.nullable().default(null),
    pagamento: z.object({
      forma: formaPagamentoSchema,
      troco_para: trocoParaSchema.default(null),
    }),
    observacao: observacaoSchema,
    itens: itensSchema,
  })
  .refine((dados) => dados.tipo !== "delivery" || dados.endereco, {
    error: "Delivery exige o endereço",
    path: ["endereco"],
  });

const paramsPedidoSchema = z.object({ id: z.uuid("Código do pedido inválido") });

type ParamsSite = { slug: string };
type ParamsPedidoSite = { slug: string; id: string };

class sitecontroller {
  // GET /site/:slug → dados da loja, horários, se está aberta e áreas de entrega
  loja = async (req: Request<ParamsSite>, res: Response) => {
    res.json(await siteService.loja(req.params.slug));
  };

  // GET /site/:slug/cardapio
  cardapio = async (req: Request<ParamsSite>, res: Response) => {
    res.json(await siteService.cardapio(req.params.slug));
  };

  // POST /site/:slug/pedidos → 201 se criou; 200 se a chave de idempotência já existia
  criarPedido = async (req: Request<ParamsSite>, res: Response) => {
    const { chave_idempotencia, endereco, pagamento, ...dados } = criarPedidoSchema.parse(req.body ?? {});
    const { pedido, criado } = await siteService.criarPedido(req.params.slug, {
      ...dados,
      chaveIdempotencia: chave_idempotencia,
      endereco:
        dados.tipo === "delivery" && endereco
          ? {
              areaEntregaId: endereco.area_entrega_id,
              cep: endereco.cep,
              logradouro: endereco.logradouro,
              numero: endereco.numero,
              complemento: endereco.complemento,
              bairro: endereco.bairro,
              cidade: endereco.cidade,
              estado: endereco.estado,
              referencia: endereco.referencia,
            }
          : null,
      pagamento: { forma: pagamento.forma, trocoPara: pagamento.troco_para },
    });
    res.status(criado ? 201 : 200).json(pedido);
  };

  // GET /site/:slug/pedidos/:id → acompanhamento do pedido
  pedido = async (req: Request<ParamsPedidoSite>, res: Response) => {
    const { id } = paramsPedidoSchema.parse(req.params);
    res.json(await siteService.buscarPedido(req.params.slug, id));
  };
}

export const siteController = new sitecontroller();
