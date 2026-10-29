import { Router } from "express";
import { authController } from "../controllers/auth_controller";
import { autenticarPermitindoSenhaProvisoria } from "../middlewares/autenticar";
import { cadastroRateLimit, loginRateLimit } from "../middlewares/rate_limit";

export const authRouter = Router();

authRouter.post("/cadastro", cadastroRateLimit, authController.cadastro);
authRouter.post("/login", loginRateLimit, authController.login);

// Liberadas para quem está com senha provisória: é por elas que o usuário sai desse estado.
// trocar-senha usa o mesmo limite do login porque também testa uma senha.
authRouter.get("/me", autenticarPermitindoSenhaProvisoria, authController.me);
authRouter.post("/trocar-senha", loginRateLimit, autenticarPermitindoSenhaProvisoria, authController.trocarSenha);
