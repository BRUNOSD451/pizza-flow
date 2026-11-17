import { Router } from "express";
import { pagamentoController } from "../controllers/pagamento_controller";
import { pedidoController } from "../controllers/pedido_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Pedidos internos (balcão e WhatsApp), fila da cozinha e entregas
export const pedidoRouter = Router();

pedidoRouter.use(autenticar);

pedidoRouter.post("/", exigirPapel("dono", "gerente", "atendente"), pedidoController.create);
pedidoRouter.get("/", exigirPapel("dono", "gerente", "atendente"), pedidoController.list);

// Antes de /:id, senão "cozinha" e "minhas-entregas" seriam lidos como id
pedidoRouter.get("/cozinha", exigirPapel("dono", "gerente", "cozinha"), pedidoController.cozinha);
pedidoRouter.get("/minhas-entregas", exigirPapel("entregador"), pedidoController.minhasEntregas);

// A resposta depende do papel: a cozinha não recebe valores, o entregador só vê os pedidos dele
// e o garçom só os do salão (services/pedido_transicoes.ts → podeVerPedido)
const VEEM_PEDIDO = ["dono", "gerente", "atendente", "cozinha", "entregador", "garcom"] as const;
pedidoRouter.get("/:id", exigirPapel(...VEEM_PEDIDO), pedidoController.show);

// Quem pode fazer cada mudança é decidido em services/pedido_transicoes.ts
pedidoRouter.patch("/:id/status", exigirPapel(...VEEM_PEDIDO), pedidoController.mudarStatus);
pedidoRouter.patch("/:id/entregador", exigirPapel("dono", "gerente", "atendente"), pedidoController.atribuirEntregador);

// Pagamentos de pedidos de balcão, WhatsApp, site e delivery (o de comanda é pago na comanda).
// O entregador registra e confirma o que recebe na entrega; estornar algo pago é só da gestão
const PAGAM_PEDIDO = ["dono", "gerente", "atendente", "entregador"] as const;
pedidoRouter.get("/:id/pagamentos", exigirPapel(...PAGAM_PEDIDO), pagamentoController.listarDoPedido);
pedidoRouter.post("/:id/pagamentos", exigirPapel(...PAGAM_PEDIDO), pagamentoController.registrarNoPedido);
pedidoRouter.patch("/:id/pagamentos/:pagamentoId", exigirPapel(...PAGAM_PEDIDO), pagamentoController.alterarNoPedido);
