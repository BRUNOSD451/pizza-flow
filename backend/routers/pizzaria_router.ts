import { Router } from "express";
import { pizzariaController } from "../controllers/pizzaria_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Configuração da loja da pizzaria de quem está logado
export const pizzariaRouter = Router();

pizzariaRouter.use(autenticar);

// Quem atende o cliente lê (taxa, pedido mínimo, se o site está aceitando pedidos); só o dono altera.
// Cozinha, garçom e entregador recebem só nome, logo, cor e fuso, na sessão (/auth/me)
pizzariaRouter.get("/", exigirPapel("dono", "gerente", "atendente"), pizzariaController.show);
pizzariaRouter.patch("/", exigirPapel("dono"), pizzariaController.edit);
