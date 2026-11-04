import type { Request, Response } from "express";
import { z } from "zod";
import { horarioService } from "../services/horario_service";

const horaSchema = (campo: string) =>
  z.string(`Informe ${campo}`).regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${campo} deve estar no formato HH:MM (ex.: 18:30)`);

// fecha <= abre = fecha no dia seguinte (ex.: abre 18:00, fecha 02:00)
const substituirSchema = z.object({
  horarios: z
    .array(
      z.object({
        dia_semana: z.int("dia_semana deve ser um número inteiro").min(0).max(6, "dia_semana vai de 0 (domingo) a 6 (sábado)"),
        abre: horaSchema("abre"),
        fecha: horaSchema("fecha"),
      }),
      "Informe a lista de horários"
    )
    .max(28, "Horários demais para uma semana"),
});

class horariocontroller {
  // GET /horarios
  list = async (req: Request, res: Response) => {
    res.json(await horarioService.listar(req.auth!.pizzariaId!));
  };

  // PUT /horarios
  replace = async (req: Request, res: Response) => {
    const { horarios } = substituirSchema.parse(req.body ?? {});
    res.json(
      await horarioService.substituir(
        req.auth!.pizzariaId!,
        horarios.map((h) => ({ diaSemana: h.dia_semana, abre: h.abre, fecha: h.fecha }))
      )
    );
  };
}

export const horarioController = new horariocontroller();
