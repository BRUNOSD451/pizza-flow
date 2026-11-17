import type { Request, Response } from "express";
import { z } from "zod";
import { FORMAS_PAGAMENTO, STATUS_PAGAMENTO } from "../repositories/pagamento_repository";
import { pagamentoService } from "../services/pagamento_service";
import { dinheiroSchema } from "../utils/preco";

export const formaPagamentoSchema = z.enum(FORMAS_PAGAMENTO, `Forma inválida. Use: ${FORMAS_PAGAMENTO.join(", ")}`);
// Para quanto levar troco (só dinheiro); null = sem troco
export const trocoParaSchema = dinheiroSchema("troco_para").nullable();

// status pendente = combinado para depois (ex.: paga na entrega)
const registrarSchema = z.object({
  forma: formaPagamentoSchema,
  valor: dinheiroSchema("valor"),
  troco_para: trocoParaSchema.default(null),
  status: z.enum(["pendente", "pago"], "status deve ser 'pendente' ou 'pago'").default("pago"),
});

const alterarSchema = z.object({
  status: z.enum(STATUS_PAGAMENTO, `Status inválido. Use: ${STATUS_PAGAMENTO.join(", ")}`),
  forma: formaPagamentoSchema.optional(),
  troco_para: trocoParaSchema.optional(),
});

function lerRegistro(body: unknown) {
  const { troco_para, ...dados } = registrarSchema.parse(body ?? {});
  return { ...dados, trocoPara: troco_para };
}

function lerAlteracao(body: unknown) {
  const { troco_para, ...dados } = alterarSchema.parse(body ?? {});
  return { ...dados, trocoPara: troco_para };
}

type ParamsAlvo = { id: string };
type ParamsPagamento = { id: string; pagamentoId: string };

class pagamentocontroller {
  // GET /pedidos/:id/pagamentos
  listarDoPedido = async (req: Request<ParamsAlvo>, res: Response) => {
    res.json(await pagamentoService.listarDoPedido(req.auth!, req.params.id));
  };

  // POST /pedidos/:id/pagamentos
  registrarNoPedido = async (req: Request<ParamsAlvo>, res: Response) => {
    res.status(201).json(await pagamentoService.registrarNoPedido(req.auth!, req.params.id, lerRegistro(req.body)));
  };

  // PATCH /pedidos/:id/pagamentos/:pagamentoId
  alterarNoPedido = async (req: Request<ParamsPagamento>, res: Response) => {
    res.json(
      await pagamentoService.alterarNoPedido(req.auth!, req.params.id, req.params.pagamentoId, lerAlteracao(req.body))
    );
  };

  // GET /comandas/:id/pagamentos
  listarDaComanda = async (req: Request<ParamsAlvo>, res: Response) => {
    res.json(await pagamentoService.listarDaComanda(req.auth!, req.params.id));
  };

  // POST /comandas/:id/pagamentos
  registrarNaComanda = async (req: Request<ParamsAlvo>, res: Response) => {
    res.status(201).json(await pagamentoService.registrarNaComanda(req.auth!, req.params.id, lerRegistro(req.body)));
  };

  // PATCH /comandas/:id/pagamentos/:pagamentoId
  alterarNaComanda = async (req: Request<ParamsPagamento>, res: Response) => {
    res.json(
      await pagamentoService.alterarNaComanda(req.auth!, req.params.id, req.params.pagamentoId, lerAlteracao(req.body))
    );
  };
}

export const pagamentoController = new pagamentocontroller();
