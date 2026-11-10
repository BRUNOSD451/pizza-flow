import { AppError } from "../errors/app_error";
import type { AdicionalComPrecos } from "../repositories/adicional_repository";
import type { BordaComPrecos } from "../repositories/borda_repository";
import type { Categoria } from "../repositories/categoria_repository";
import type { RegraPrecoPizza } from "../repositories/pizzaria_repository";
import type { Produto } from "../repositories/produto_repository";
import type { SaborComPrecos } from "../repositories/sabor_repository";
import type { Tamanho } from "../repositories/tamanho_repository";
import { deCentavos, paraCentavos } from "../utils/preco";

// Sem acesso a banco: recebe o catálogo já carregado e devolve o que deve ser gravado.
// Toda a conta é em centavos inteiros; os valores saem como "45.90".

export interface AdicionalSolicitado {
  adicionalId: string;
  quantidade: number;
}

export interface ItemPizzaSolicitado {
  tipo: "pizza";
  tamanhoId: string;
  bordaId: string | null;
  sabores: { saborId: string; partes: number }[];
  adicionais: AdicionalSolicitado[];
  quantidade: number;
  observacao: string | null;
}

export interface ItemProdutoSolicitado {
  tipo: "produto";
  produtoId: string;
  adicionais: AdicionalSolicitado[];
  quantidade: number;
  observacao: string | null;
}

export type ItemSolicitado = ItemPizzaSolicitado | ItemProdutoSolicitado;

export interface CatalogoPedido {
  tamanhos: Tamanho[];
  sabores: SaborComPrecos[];
  bordas: BordaComPrecos[];
  adicionais: AdicionalComPrecos[];
  produtos: Produto[];
  categorias: Categoria[];
}

export interface SaborCalculado {
  saborId: string;
  nomeSabor: string;
  partes: number;
  precoReferencia: string;
}

export interface AdicionalCalculado {
  adicionalId: string;
  nome: string;
  quantidade: number;
  preco: string;
}

export interface ItemCalculado {
  tipo: "pizza" | "produto";
  tamanhoId: string | null;
  bordaId: string | null;
  produtoId: string | null;
  totalPartes: number | null;
  descricao: string;
  quantidade: number;
  precoUnitario: string;
  precoTotal: string;
  observacao: string | null;
  sabores: SaborCalculado[];
  adicionais: AdicionalCalculado[];
}

export interface TotaisPedido {
  subtotal: string;
  desconto: string;
  taxaEntrega: string;
  total: string;
}

// Maior valor que cabe em DECIMAL(10,2), em centavos
const VALOR_MAXIMO_CENTAVOS = 9_999_999_999;
const TAMANHO_MAXIMO_DESCRICAO = 255;

const itemInvalido = (mensagem: string) => new AppError(mensagem, 400, "ITEM_INVALIDO");

function porId<T extends { id: string }>(lista: T[]): Map<string, T> {
  return new Map(lista.map((item) => [item.id, item]));
}

function precoNoTamanho(precos: { tamanho_id: string; preco: string }[], tamanhoId: string): string | undefined {
  return precos.find((p) => p.tamanho_id === tamanhoId)?.preco;
}

// Arredonda meio centavo para cima, só com inteiros
function dividirArredondando(dividendo: number, divisor: number): number {
  return Math.floor((2 * dividendo + divisor) / (2 * divisor));
}

export function precoPizzaCentavos(
  regra: RegraPrecoPizza,
  sabores: { precoCentavos: number; partes: number }[]
): number {
  if (regra === "maior") return Math.max(...sabores.map((s) => s.precoCentavos));

  const totalPartes = sabores.reduce((soma, s) => soma + s.partes, 0);
  const somaPonderada = sabores.reduce((soma, s) => soma + s.precoCentavos * s.partes, 0);
  return dividirArredondando(somaPonderada, totalPartes);
}

export function calcularItens(
  catalogo: CatalogoPedido,
  itens: ItemSolicitado[],
  regra: RegraPrecoPizza
): ItemCalculado[] {
  const tamanhos = porId(catalogo.tamanhos);
  const sabores = porId(catalogo.sabores);
  const bordas = porId(catalogo.bordas);
  const adicionais = porId(catalogo.adicionais);
  const produtos = porId(catalogo.produtos);
  const categoriasAtivas = new Set(catalogo.categorias.filter((c) => c.ativo).map((c) => c.id));

  // Mesma regra do cardápio: categoria inativa tira de venda tudo o que está nela
  const categoriaAVenda = (categoriaId: string | null) => !categoriaId || categoriasAtivas.has(categoriaId);

  function calcularAdicionais(solicitados: AdicionalSolicitado[], tamanhoId: string | null) {
    const ids = solicitados.map((a) => a.adicionalId);
    if (new Set(ids).size !== ids.length) throw itemInvalido("Adicional repetido no item: use a quantidade");

    return solicitados.map(({ adicionalId, quantidade }): AdicionalCalculado => {
      const adicional = adicionais.get(adicionalId);
      if (!adicional || !adicional.ativo) throw itemInvalido("Adicional não encontrado ou inativo");
      const preco = (tamanhoId && precoNoTamanho(adicional.precos, tamanhoId)) || adicional.preco;
      return { adicionalId, nome: adicional.nome, quantidade, preco };
    });
  }

  const centavosDosAdicionais = (lista: AdicionalCalculado[]) =>
    lista.reduce((soma, a) => soma + paraCentavos(a.preco) * a.quantidade, 0);

  function fecharItem(
    item: ItemSolicitado,
    precoUnitarioCentavos: number,
    dados: Omit<ItemCalculado, "quantidade" | "precoUnitario" | "precoTotal" | "observacao">
  ): ItemCalculado {
    const totalCentavos = precoUnitarioCentavos * item.quantidade;
    if (totalCentavos > VALOR_MAXIMO_CENTAVOS) throw itemInvalido("Valor do item alto demais");
    return {
      ...dados,
      descricao: dados.descricao.slice(0, TAMANHO_MAXIMO_DESCRICAO),
      quantidade: item.quantidade,
      precoUnitario: deCentavos(precoUnitarioCentavos),
      precoTotal: deCentavos(totalCentavos),
      observacao: item.observacao,
    };
  }

  function calcularPizza(item: ItemPizzaSolicitado): ItemCalculado {
    const tamanho = tamanhos.get(item.tamanhoId);
    if (!tamanho || !tamanho.ativo) throw itemInvalido("Tamanho não encontrado ou inativo");

    const ids = item.sabores.map((s) => s.saborId);
    if (ids.length === 0) throw itemInvalido("Informe ao menos um sabor");
    if (new Set(ids).size !== ids.length) throw itemInvalido("Sabor repetido no item: use as partes");

    const totalPartes = item.sabores.reduce((soma, s) => soma + s.partes, 0);
    if (totalPartes > tamanho.max_sabores) {
      throw itemInvalido(`O tamanho ${tamanho.nome} aceita no máximo ${tamanho.max_sabores} partes`);
    }

    const saboresCalculados = item.sabores.map(({ saborId, partes }): SaborCalculado => {
      const sabor = sabores.get(saborId);
      if (!sabor || !sabor.ativo || !categoriaAVenda(sabor.categoria_id)) {
        throw itemInvalido("Sabor não encontrado ou inativo");
      }
      const preco = precoNoTamanho(sabor.precos, tamanho.id);
      if (preco === undefined) throw itemInvalido(`O sabor ${sabor.nome} não é vendido no tamanho ${tamanho.nome}`);
      return { saborId, nomeSabor: sabor.nome, partes, precoReferencia: preco };
    });

    let bordaCentavos = 0;
    let nomeBorda: string | null = null;
    if (item.bordaId) {
      const borda = bordas.get(item.bordaId);
      if (!borda || !borda.ativo) throw itemInvalido("Borda não encontrada ou inativa");
      const preco = precoNoTamanho(borda.precos, tamanho.id);
      if (preco === undefined) throw itemInvalido(`A borda ${borda.nome} não é vendida no tamanho ${tamanho.nome}`);
      bordaCentavos = paraCentavos(preco);
      nomeBorda = borda.nome;
    }

    const adicionaisCalculados = calcularAdicionais(item.adicionais, tamanho.id);
    const pizzaCentavos = precoPizzaCentavos(
      regra,
      saboresCalculados.map((s) => ({ precoCentavos: paraCentavos(s.precoReferencia), partes: s.partes }))
    );

    const fracoes = saboresCalculados
      .map((s) => (totalPartes === 1 ? s.nomeSabor : `${s.partes}/${totalPartes} ${s.nomeSabor}`))
      .join(", ");

    return fecharItem(item, pizzaCentavos + bordaCentavos + centavosDosAdicionais(adicionaisCalculados), {
      tipo: "pizza",
      tamanhoId: tamanho.id,
      bordaId: item.bordaId,
      produtoId: null,
      totalPartes,
      descricao: `${tamanho.nome} (${fracoes})${nomeBorda ? ` + Borda ${nomeBorda}` : ""}`,
      sabores: saboresCalculados,
      adicionais: adicionaisCalculados,
    });
  }

  function calcularProduto(item: ItemProdutoSolicitado): ItemCalculado {
    const produto = produtos.get(item.produtoId);
    if (!produto || !produto.ativo || !categoriaAVenda(produto.categoria_id)) {
      throw itemInvalido("Produto não encontrado ou inativo");
    }

    const adicionaisCalculados = calcularAdicionais(item.adicionais, null);
    return fecharItem(item, paraCentavos(produto.preco) + centavosDosAdicionais(adicionaisCalculados), {
      tipo: "produto",
      tamanhoId: null,
      bordaId: null,
      produtoId: produto.id,
      totalPartes: null,
      descricao: produto.nome,
      sabores: [],
      adicionais: adicionaisCalculados,
    });
  }

  return itens.map((item) => (item.tipo === "pizza" ? calcularPizza(item) : calcularProduto(item)));
}

// total = subtotal - desconto + taxa_entrega
export function calcularTotais(itens: ItemCalculado[], desconto: string, taxaEntrega: string): TotaisPedido {
  const subtotalCentavos = itens.reduce((soma, item) => soma + paraCentavos(item.precoTotal), 0);
  const descontoCentavos = paraCentavos(desconto);
  const taxaCentavos = paraCentavos(taxaEntrega);

  if (descontoCentavos > subtotalCentavos) {
    throw new AppError("O desconto não pode ser maior que o subtotal", 400, "DESCONTO_INVALIDO");
  }

  const totalCentavos = subtotalCentavos - descontoCentavos + taxaCentavos;
  if (subtotalCentavos > VALOR_MAXIMO_CENTAVOS || totalCentavos > VALOR_MAXIMO_CENTAVOS) {
    throw new AppError("Valor do pedido alto demais", 400, "VALOR_INVALIDO");
  }

  return {
    subtotal: deCentavos(subtotalCentavos),
    desconto: deCentavos(descontoCentavos),
    taxaEntrega: deCentavos(taxaCentavos),
    total: deCentavos(totalCentavos),
  };
}
