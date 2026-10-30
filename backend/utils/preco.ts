import { z } from "zod";

// Aceita 45.9, "45.9" ou "45.90" e devolve sempre "45.90", sem fazer conta com float
export const precoSchema = z
  .union([z.number(), z.string()], "preco deve ser um número")
  .transform((valor) => String(valor).trim())
  .refine((valor) => /^\d{1,8}(\.\d{1,2})?$/.test(valor), "preco inválido: use até 2 casas decimais, sem negativo")
  .transform((valor) => {
    const [inteiro, centavos = ""] = valor.split(".");
    return `${inteiro}.${centavos.padEnd(2, "0")}`;
  });

// Tabela de preços por tamanho: [{ tamanho_id, preco }] → [{ tamanhoId, preco }].
// Sabores e bordas exigem ao menos um tamanho; adicionais aceitam [] (usam só o preço padrão)
export function precosPorTamanhoSchema(minimo = 1) {
  return z
    .array(
      z.object({
        tamanho_id: z.uuid("tamanho_id inválido"),
        preco: precoSchema,
      }),
      "Informe os preços"
    )
    .min(minimo, "Informe o preço de ao menos um tamanho")
    .refine((precos) => new Set(precos.map((p) => p.tamanho_id)).size === precos.length, "Tamanho repetido em precos")
    .transform((precos) => precos.map((p) => ({ tamanhoId: p.tamanho_id, preco: p.preco })));
}
