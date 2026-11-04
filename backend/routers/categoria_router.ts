import { Router } from "express";
import { categoriaController } from "../controllers/categoria_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";
import { PAPEIS } from "../repositories/member_repository";

// Seções do cardápio (pizzas e produtos), da pizzaria de quem está logado
export const categoriaRouter = Router();

categoriaRouter.use(autenticar);

// Toda a equipe consulta (não há preços); só dono e gerente mexem no cardápio.
// Sem DELETE: sabores e produtos referenciam a categoria, então desliga com ativo = false
categoriaRouter.get("/", exigirPapel(...PAPEIS), categoriaController.list);
categoriaRouter.post("/", exigirPapel("dono", "gerente"), categoriaController.create);
categoriaRouter.patch("/:id", exigirPapel("dono", "gerente"), categoriaController.edit);
