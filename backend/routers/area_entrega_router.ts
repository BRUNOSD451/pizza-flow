import { Router } from "express";
import { areaEntregaController } from "../controllers/area_entrega_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Bairros atendidos pelo delivery, com taxa e tempo estimado
export const areaEntregaRouter = Router();

areaEntregaRouter.use(autenticar);

// Quem lança pedido de delivery consulta; só o dono altera (configuração da loja).
// Sem DELETE: endereços e pedidos referenciam a área, então desliga com ativo = false
areaEntregaRouter.get("/", exigirPapel("dono", "gerente", "atendente"), areaEntregaController.list);
areaEntregaRouter.post("/", exigirPapel("dono"), areaEntregaController.create);
areaEntregaRouter.patch("/:id", exigirPapel("dono"), areaEntregaController.edit);
