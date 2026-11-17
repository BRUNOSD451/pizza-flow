import type { Request, Response } from "express";
import { z } from "zod";
import { STATUS_COMANDA } from "../repositories/comanda_repository";
import { comandaService } from "../services/comanda_service";
import { dinheiroSchema } from "../utils/preco";
import { chaveIdempotenciaSchema, itensSchema, observacaoSchema } from "./pedido_controller";

const listarSchema = z.object({
  status: z.enum(STATUS_COMANDA, `Status inválido. Use: ${STATUS_COMANDA.join(", ")}`).default("aberta"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const abrirSchema = z.object({
  mesa_id: z.uuid("mesa_id inválido"),
  pessoas: z.int("pessoas deve ser um número inteiro").min(1, "pessoas deve ser maior que zero").max(100).nullable().default(null),
});

// Valores enviados pelo cliente são ignorados: o preço é sempre recalculado no backend
const lancarPedidoSchema = z.object({
  chave_idempotencia: chaveIdempotenciaSchema,
  desconto: dinheiroSchema("desconto").default("0.00"),
  observacao: observacaoSchema,
  itens: itensSchema,
});

// 0 = sem taxa de serviço; o comum é 10
const fecharSchema = z.object({
  taxa_servico_percentual: z
    .int("taxa_servico_percentual deve ser um número inteiro")
    .min(0, "taxa_servico_percentual não pode ser negativa")
    .max(20, "taxa_servico_percentual máxima é 20"),
});

type ParamsComanda = { id: string };

class comandacontroller {
  // GET /comandas?status=aberta|fechada|cancelada&limit=&offset=
  list = async (req: Request, res: Response) => {
    res.json(await comandaService.listar(req.auth!.pizzariaId!, listarSchema.parse(req.query)));
  };

  // GET /comandas/:id → comanda com pedidos, pagamentos e resumo da conta
  show = async (req: Request<ParamsComanda>, res: Response) => {
    res.json(await comandaService.buscar(req.auth!.pizzariaId!, req.params.id));
  };

  // POST /comandas
  create = async (req: Request, res: Response) => {
    const { mesa_id, pessoas } = abrirSchema.parse(req.body ?? {});
    res.status(201).json(await comandaService.abrir(req.auth!, { mesaId: mesa_id, pessoas }));
  };

  // POST /comandas/:id/pedidos → 201 se criou; 200 se a chave de idempotência já existia
  lancarPedido = async (req: Request<ParamsComanda>, res: Response) => {
    const { chave_idempotencia, ...dados } = lancarPedidoSchema.parse(req.body ?? {});
    const { pedido, criado } = await comandaService.lancarPedido(req.auth!, req.params.id, {
      ...dados,
      chaveIdempotencia: chave_idempotencia,
    });
    res.status(criado ? 201 : 200).json(pedido);
  };

  // POST /comandas/:id/fechar
  fechar = async (req: Request<ParamsComanda>, res: Response) => {
    const { taxa_servico_percentual } = fecharSchema.parse(req.body ?? {});
    res.json(await comandaService.fechar(req.auth!, req.params.id, taxa_servico_percentual));
  };

  // POST /comandas/:id/cancelar
  cancelar = async (req: Request<ParamsComanda>, res: Response) => {
    res.json(await comandaService.cancelar(req.auth!, req.params.id));
  };
}

export const comandaController = new comandacontroller();
