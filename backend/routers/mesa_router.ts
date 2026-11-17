import { Router } from "express";
import { mesaController } from "../controllers/mesa_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Mesas do salão. A listagem traz a comanda aberta de cada mesa (mapa do garçom)
export const mesaRouter = Router();

mesaRouter.use(autenticar);

// Sem DELETE: comandas referenciam a mesa, então desliga com ativo = false
mesaRouter.get("/", exigirPapel("dono", "gerente", "atendente", "garcom"), mesaController.list);
mesaRouter.post("/", exigirPapel("dono", "gerente"), mesaController.create);
mesaRouter.patch("/:id", exigirPapel("dono", "gerente"), mesaController.edit);
