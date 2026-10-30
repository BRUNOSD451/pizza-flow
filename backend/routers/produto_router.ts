import { Router } from "express";
import { produtoController } from "../controllers/produto_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Produtos de preço fixo (bebidas, sobremesas, porções), da pizzaria de quem está logado
export const produtoRouter = Router();

produtoRouter.use(autenticar);

// Consulta para quem lança pedido (a resposta tem preços: cozinha e entregador ficam de fora).
// Sem DELETE: pedidos referenciam o produto, então desliga com ativo = false
produtoRouter.get("/", exigirPapel("dono", "gerente", "atendente", "garcom"), produtoController.list);
produtoRouter.post("/", exigirPapel("dono", "gerente"), produtoController.create);
produtoRouter.patch("/:id", exigirPapel("dono", "gerente"), produtoController.edit);
