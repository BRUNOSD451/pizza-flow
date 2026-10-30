import { Router } from "express";
import { bordaController } from "../controllers/borda_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Bordas recheadas e seus preços por tamanho, da pizzaria de quem está logado
export const bordaRouter = Router();

bordaRouter.use(autenticar);

// Consulta para quem lança pedido (a resposta tem preços: cozinha e entregador ficam de fora).
// Sem DELETE: pedidos referenciam a borda, então desliga com ativo = false
bordaRouter.get("/", exigirPapel("dono", "gerente", "atendente", "garcom"), bordaController.list);
bordaRouter.post("/", exigirPapel("dono", "gerente"), bordaController.create);
bordaRouter.patch("/:id", exigirPapel("dono", "gerente"), bordaController.edit);
