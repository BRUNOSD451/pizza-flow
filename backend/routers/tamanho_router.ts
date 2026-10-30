import { Router } from "express";
import { tamanhoController } from "../controllers/tamanho_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";
import { PAPEIS } from "../repositories/member_repository";

// Tamanhos de pizza do cardápio da pizzaria de quem está logado
export const tamanhoRouter = Router();

tamanhoRouter.use(autenticar);

// Toda a equipe consulta (para lançar pedidos); só dono e gerente mexem no cardápio.
// Sem DELETE: tamanho é referenciado por preços e pedidos, então desliga com ativo = false
tamanhoRouter.get("/", exigirPapel(...PAPEIS), tamanhoController.list);
tamanhoRouter.post("/", exigirPapel("dono", "gerente"), tamanhoController.create);
tamanhoRouter.patch("/:id", exigirPapel("dono", "gerente"), tamanhoController.edit);
