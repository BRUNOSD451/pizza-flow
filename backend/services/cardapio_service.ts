import {
  adicionalRepository,
  type Adicional,
  type AdicionalComPrecos,
  type AdicionalPreco,
} from "../repositories/adicional_repository";
import { bordaRepository, type BordaComPrecos, type BordaPreco } from "../repositories/borda_repository";
import { categoriaRepository, type Categoria } from "../repositories/categoria_repository";
import { produtoRepository, type Produto } from "../repositories/produto_repository";
import { saborRepository, type SaborComPrecos, type SaborPreco } from "../repositories/sabor_repository";
import { tamanhoRepository, type Tamanho } from "../repositories/tamanho_repository";

// Preço por tamanho no cardápio (mesmo formato em sabores, bordas e adicionais)
type PrecoCardapio = SaborPreco | BordaPreco | AdicionalPreco;

export interface CardapioSabor {
  id: string;
  nome: string;
  descricao: string | null;
  imagem_url: string | null;
  tipo: SaborComPrecos["tipo"];
  precos: PrecoCardapio[];
}

export interface CardapioProduto {
  id: string;
  nome: string;
  descricao: string | null;
  imagem_url: string | null;
  preco: string;
}

// id e ordem null = seção dos itens sem categoria ("Outras pizzas" / "Outros produtos"), sempre no fim do tipo
export type CardapioCategoria =
  | { id: string | null; nome: string; tipo: "pizza"; ordem: number | null; sabores: CardapioSabor[] }
  | { id: string | null; nome: string; tipo: "produto"; ordem: number | null; produtos: CardapioProduto[] };

export interface Cardapio {
  tamanhos: Pick<Tamanho, "id" | "nome" | "fatias" | "max_sabores" | "ordem">[];
  categorias: CardapioCategoria[];
  bordas: { id: string; nome: string; precos: PrecoCardapio[] }[];
  adicionais: (Pick<Adicional, "id" | "nome" | "preco"> & { precos: PrecoCardapio[] })[];
}

export interface DadosCardapio {
  tamanhos: Tamanho[];
  categorias: Categoria[];
  sabores: SaborComPrecos[];
  bordas: BordaComPrecos[];
  adicionais: AdicionalComPrecos[];
  produtos: Produto[];
}

class cardapioservice {
  // Cardápio para vender (app do atendente e do garçom). Só recebe pizzariaId,
  // então serve também para o site do cliente quando ele resolver a pizzaria pelo slug.
  async montar(pizzariaId: string): Promise<Cardapio> {
    const [tamanhos, categorias, sabores, bordas, adicionais, produtos] = await Promise.all([
      tamanhoRepository.listByPizzaria(pizzariaId),
      categoriaRepository.listByPizzaria(pizzariaId),
      saborRepository.listByPizzaria(pizzariaId),
      bordaRepository.listByPizzaria(pizzariaId),
      adicionalRepository.listByPizzaria(pizzariaId),
      produtoRepository.listByPizzaria(pizzariaId),
    ]);
    return montarCardapio({ tamanhos, categorias, sabores, bordas, adicionais, produtos });
  }
}

// Só entra o que está ativo e pode ser vendido. Categoria inativa esconde a seção inteira;
// preços de tamanho inativo somem; sabor/borda sem preço em tamanho ativo fica de fora.
export function montarCardapio(dados: DadosCardapio): Cardapio {
  const tamanhos = dados.tamanhos.filter((t) => t.ativo).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  const tamanhosAtivos = new Set(tamanhos.map((t) => t.id));
  const precosAtivos = (precos: PrecoCardapio[]) => precos.filter((p) => tamanhosAtivos.has(p.tamanho_id));

  const sabores = dados.sabores
    .filter((s) => s.ativo)
    .map((s) => ({ ...s, precos: precosAtivos(s.precos) }))
    .filter((s) => s.precos.length > 0);
  const produtos = dados.produtos.filter((p) => p.ativo);

  const paraSabor = (s: SaborComPrecos): CardapioSabor => ({
    id: s.id,
    nome: s.nome,
    descricao: s.descricao,
    imagem_url: s.imagem_url,
    tipo: s.tipo,
    precos: s.precos,
  });
  const paraProduto = (p: Produto): CardapioProduto => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    imagem_url: p.imagem_url,
    preco: p.preco,
  });

  // Itens que apontam para categoria inativa somem junto com ela
  const categoriasAtivas = dados.categorias.filter((c) => c.ativo);

  const secoes: CardapioCategoria[] = [];
  for (const tipo of ["pizza", "produto"] as const) {
    for (const c of categoriasAtivas.filter((c) => c.tipo === tipo)) {
      secoes.push(
        tipo === "pizza"
          ? { id: c.id, nome: c.nome, tipo, ordem: c.ordem, sabores: sabores.filter((s) => s.categoria_id === c.id).map(paraSabor) }
          : { id: c.id, nome: c.nome, tipo, ordem: c.ordem, produtos: produtos.filter((p) => p.categoria_id === c.id).map(paraProduto) }
      );
    }

    // Itens sem categoria vão para uma seção no fim do tipo
    if (tipo === "pizza") {
      const semCategoria = sabores.filter((s) => !s.categoria_id);
      if (semCategoria.length > 0) {
        secoes.push({ id: null, nome: "Outras pizzas", tipo, ordem: null, sabores: semCategoria.map(paraSabor) });
      }
    } else {
      const semCategoria = produtos.filter((p) => !p.categoria_id);
      if (semCategoria.length > 0) {
        secoes.push({ id: null, nome: "Outros produtos", tipo, ordem: null, produtos: semCategoria.map(paraProduto) });
      }
    }
  }

  return {
    tamanhos: tamanhos.map(({ id, nome, fatias, max_sabores, ordem }) => ({ id, nome, fatias, max_sabores, ordem })),
    // Seção de categoria sem nenhum item vendável não aparece
    categorias: secoes.filter((c) => (c.tipo === "pizza" ? c.sabores.length > 0 : c.produtos.length > 0)),
    bordas: dados.bordas
      .filter((b) => b.ativo)
      .map((b) => ({ id: b.id, nome: b.nome, precos: precosAtivos(b.precos) }))
      .filter((b) => b.precos.length > 0),
    adicionais: dados.adicionais
      .filter((a) => a.ativo)
      .map((a) => ({ id: a.id, nome: a.nome, preco: a.preco, precos: precosAtivos(a.precos) })),
  };
}

export const cardapioService = new cardapioservice();
