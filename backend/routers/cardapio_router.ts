import { Router } from "express";
import { cardapioController } from "../controllers/cardapio_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Cardápio completo e só com o que está à venda, para o app do atendente e do garçom
export const cardapioRouter = Router();

cardapioRouter.use(autenticar);

// A resposta tem preços: cozinha e entregador ficam de fora
cardapioRouter.get("/", exigirPapel("dono", "gerente", "atendente", "garcom"), cardapioController.get);
