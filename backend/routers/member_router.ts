import { Router } from "express";
import { memberController } from "../controllers/member_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Equipe da pizzaria de quem está logado (o pizzariaId vem do token, nunca da URL)
export const memberRouter = Router();

memberRouter.use(autenticar);

// Gerente consulta a equipe; só o dono cadastra e altera membros
memberRouter.get("/", exigirPapel("dono", "gerente"), memberController.list);
memberRouter.post("/", exigirPapel("dono"), memberController.create);
memberRouter.patch("/:id", exigirPapel("dono"), memberController.edit);
memberRouter.post("/:id/resetar-senha", exigirPapel("dono"), memberController.resetarSenha);
