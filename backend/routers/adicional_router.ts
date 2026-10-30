import { Router } from "express";
import { adicionalController } from "../controllers/adicional_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Adicionais (preço padrão + preço opcional por tamanho), da pizzaria de quem está logado
export const adicionalRouter = Router();

adicionalRouter.use(autenticar);

// Consulta para quem lança pedido (a resposta tem preços: cozinha e entregador ficam de fora).
// Sem DELETE: pedidos referenciam o adicional, então desliga com ativo = false
adicionalRouter.get("/", exigirPapel("dono", "gerente", "atendente", "garcom"), adicionalController.list);
adicionalRouter.post("/", exigirPapel("dono", "gerente"), adicionalController.create);
adicionalRouter.patch("/:id", exigirPapel("dono", "gerente"), adicionalController.edit);
