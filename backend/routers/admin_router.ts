import { Router } from "express";
import { adminController } from "../controllers/admin_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirAdminPlataforma } from "../middlewares/permissoes";

// Painel do admin da plataforma. A flag usuarios.admin_plataforma só é ligada pelo `npm run seed:admin`
export const adminRouter = Router();

adminRouter.use(autenticar, exigirAdminPlataforma);

adminRouter.get("/pizzarias", adminController.listarPizzarias);
adminRouter.get("/pizzarias/:id", adminController.buscarPizzaria);
adminRouter.patch("/pizzarias/:id", adminController.alterarPizzaria);
adminRouter.post("/pizzarias/:id/resetar-senha-dono", adminController.resetarSenhaDono);
