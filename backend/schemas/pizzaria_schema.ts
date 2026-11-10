import { z } from "zod";
import { dinheiroSchema } from "../utils/preco";

// Fuso no formato IANA, ex.: America/Sao_Paulo
function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

const nomePizzariaSchema = z.string("Informe o nome da pizzaria").trim().min(2, "Nome muito curto").max(150);

const slugSchema = z
  .string("Informe o slug")
  .trim()
  .toLowerCase()
  .min(3, "O slug precisa ter pelo menos 3 caracteres")
  .max(60, "O slug pode ter no máximo 60 caracteres")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífen (ex.: pizzaria-do-ze)");

// Salvo só com dígitos, com DDD
export const telefoneSchema = z
  .string()
  .transform((t) => t.replace(/\D/g, ""))
  .refine((t) => t.length === 10 || t.length === 11, "Telefone deve ter DDD + número (10 ou 11 dígitos)");

const fusoHorarioSchema = z.string().refine(fusoValido, "Fuso horário inválido (ex.: America/Sao_Paulo)");

// Usado no cadastro público (POST /auth/cadastro)
export const criarPizzariaComDonoSchema = z.object({
  pizzaria: z.object({
    nome: nomePizzariaSchema,
    slug: slugSchema,
    telefone: telefoneSchema.optional(),
    fuso_horario: fusoHorarioSchema.optional(),
  }),
  dono: z.object({
    nome: z.string("Informe o nome do dono").trim().min(2, "Nome muito curto").max(150),
    email: z.email("Informe um email válido"),
    senha: z.string("Informe a senha").min(8, "A senha precisa ter pelo menos 8 caracteres").max(72),
  }),
});

// PATCH /pizzaria (dono). `ativo` fica de fora: só o admin da plataforma ativa/desativa.
// Campos opcionais da loja aceitam null para limpar (telefone, logo, cor)
export const editarPizzariaSchema = z
  .object({
    nome: nomePizzariaSchema.optional(),
    slug: slugSchema.optional(),
    telefone: telefoneSchema.nullable().optional(),
    logo_url: z
      .url({ protocol: /^https?$/, error: "logo_url deve ser uma URL http(s)" })
      .max(500, "logo_url muito longa")
      .nullable()
      .optional(),
    cor_primaria: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "cor_primaria deve estar no formato #RRGGBB")
      .transform((cor) => cor.toUpperCase())
      .nullable()
      .optional(),
    fuso_horario: fusoHorarioSchema.optional(),
    regra_preco_pizza: z.enum(["maior", "media"], "regra_preco_pizza deve ser 'maior' ou 'media'").optional(),
    tempo_alvo_preparo_min: z
      .int("tempo_alvo_preparo_min deve ser um número inteiro")
      .min(1, "tempo_alvo_preparo_min deve ser maior que zero")
      .max(600, "tempo_alvo_preparo_min muito alto")
      .optional(),
    taxa_entrega_padrao: dinheiroSchema("taxa_entrega_padrao").optional(),
    pedido_minimo: dinheiroSchema("pedido_minimo").optional(),
    aceitando_pedidos: z.boolean("aceitando_pedidos deve ser true ou false").optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), "Informe ao menos um campo");
