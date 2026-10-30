import type { Request, Response } from "express";
import { cardapioService } from "../services/cardapio_service";

class cardapiocontroller {
  // GET /cardapio
  get = async (req: Request, res: Response) => {
    res.json(await cardapioService.montar(req.auth!.pizzariaId!));
  };
}

export const cardapioController = new cardapiocontroller();
