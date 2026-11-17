import { Router } from "express";
import { siteController } from "../controllers/site_controller";
import { pedidoSiteRateLimit } from "../middlewares/rate_limit";

// Site do cliente: público (sem login), a pizzaria vem do slug
export const siteRouter = Router();

siteRouter.get("/:slug", siteController.loja);
siteRouter.get("/:slug/cardapio", siteController.cardapio);
siteRouter.post("/:slug/pedidos", pedidoSiteRateLimit, siteController.criarPedido);
siteRouter.get("/:slug/pedidos/:id", siteController.pedido);
