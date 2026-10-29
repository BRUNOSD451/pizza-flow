import { z } from "zod";

// Fuso no formato IANA, ex.: America/Sao_Paulo
function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

// Usado no cadastro público (POST /auth/cadastro)
export const criarPizzariaComDonoSchema = z.object({
  pizzaria: z.object({
    nome: z.string("Informe o nome da pizzaria").trim().min(2, "Nome muito curto").max(150),
    slug: z
      .string("Informe o slug")
      .trim()
      .toLowerCase()
      .min(3, "O slug precisa ter pelo menos 3 caracteres")
      .max(60, "O slug pode ter no máximo 60 caracteres")
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífen (ex.: pizzaria-do-ze)"),
    // Salvo só com dígitos, com DDD
    telefone: z
      .string()
      .transform((t) => t.replace(/\D/g, ""))
      .refine((t) => t.length === 10 || t.length === 11, "Telefone deve ter DDD + número (10 ou 11 dígitos)")
      .optional(),
    fuso_horario: z.string().refine(fusoValido, "Fuso horário inválido (ex.: America/Sao_Paulo)").optional(),
  }),
  dono: z.object({
    nome: z.string("Informe o nome do dono").trim().min(2, "Nome muito curto").max(150),
    email: z.email("Informe um email válido"),
    senha: z.string("Informe a senha").min(8, "A senha precisa ter pelo menos 8 caracteres").max(72),
  }),
});
