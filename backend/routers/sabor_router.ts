import { Router } from "express";
import { saborController } from "../controllers/sabor_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Sabores de pizza e seus preços por tamanho, da pizzaria de quem está logado
export const saborRouter = Router();

saborRouter.use(autenticar);

// Consulta para quem lança pedido (a resposta tem preços: cozinha e entregador ficam de fora).
// Sem DELETE: pedidos referenciam o sabor, então desliga com ativo = false
saborRouter.get("/", exigirPapel("dono", "gerente", "atendente", "garcom"), saborController.list);
saborRouter.post("/", exigirPapel("dono", "gerente"), saborController.create);
saborRouter.patch("/:id", exigirPapel("dono", "gerente"), saborController.edit);
