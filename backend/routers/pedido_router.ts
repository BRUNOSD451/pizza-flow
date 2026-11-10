import { Router } from "express";
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

// A resposta depende do papel: a cozinha não recebe valores e o entregador só vê os pedidos dele
pedidoRouter.get("/:id", exigirPapel("dono", "gerente", "atendente", "cozinha", "entregador"), pedidoController.show);

// Quem pode fazer cada mudança é decidido em services/pedido_transicoes.ts
pedidoRouter.patch("/:id/status", exigirPapel("dono", "gerente", "atendente", "cozinha", "entregador"), pedidoController.mudarStatus);
pedidoRouter.patch("/:id/entregador", exigirPapel("dono", "gerente", "atendente"), pedidoController.atribuirEntregador);
