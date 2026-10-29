import { Router } from "express";
import { authController } from "../controllers/auth_controller";
import { autenticar } from "../middlewares/autenticar";
import { cadastroRateLimit, loginRateLimit } from "../middlewares/rate_limit";

export const authRouter = Router();

authRouter.post("/cadastro", cadastroRateLimit, authController.cadastro);
authRouter.post("/login", loginRateLimit, authController.login);
authRouter.get("/me", autenticar, authController.me);
