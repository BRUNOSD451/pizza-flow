import { Router } from "express";
import { horarioController } from "../controllers/horario_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Horários de funcionamento da semana (no fuso da pizzaria)
export const horarioRouter = Router();

horarioRouter.use(autenticar);

// Quem atende o cliente consulta (informar se a loja está aberta); só o dono altera.
// PUT substitui a semana inteira, então não há POST/PATCH/DELETE por turno
horarioRouter.get("/", exigirPapel("dono", "gerente", "atendente"), horarioController.list);
horarioRouter.put("/", exigirPapel("dono"), horarioController.replace);
