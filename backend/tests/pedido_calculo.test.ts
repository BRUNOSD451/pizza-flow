import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app_error";
import {
  calcularItens,
  calcularTotais,
  precoPizzaCentavos,
  type CatalogoPedido,
  type ItemPizzaSolicitado,
  type ItemProdutoSolicitado,
} from "../services/pedido_calculo";
import { deCentavos, paraCentavos } from "../utils/preco";

const data = new Date(0);

function preco(tamanho_id: string, valor: string) {
  return { tamanho_id, tamanho_nome: tamanho_id, preco: valor };
}

function tamanho(id: string, nome: string, max_sabores: number, ativo = true) {
  return { id, pizzaria_id: "p", nome, fatias: 8, max_sabores, ordem: 0, ativo, atualizado_em: data };
}

function sabor(id: string, nome: string, precos: ReturnType<typeof preco>[], extra: { ativo?: boolean; categoria_id?: string | null } = {}) {
  return {
    id,
    pizzaria_id: "p",
    categoria_id: extra.categoria_id ?? null,
    nome,
    descricao: null,
    imagem_url: null,
    tipo: "salgada" as const,
    ativo: extra.ativo ?? true,
    atualizado_em: data,
    precos,
  };
}

function catalogo(): CatalogoPedido {
  return {
    tamanhos: [tamanho("g", "Grande", 3), tamanho("m", "Média", 2), tamanho("x", "Inativo", 2, false)],
    sabores: [
      sabor("cal", "Calabresa", [preco("g", "40.00"), preco("m", "30.00"), preco("x", "20.00")]),
      sabor("mus", "Mussarela", [preco("g", "50.00"), preco("m", "35.00")]),
      sabor("por", "Portuguesa", [preco("g", "45.01")]),
      sabor("ina", "Inativo", [preco("g", "10.00")], { ativo: false }),
      sabor("sec", "Sem seção", [preco("g", "10.00")], { categoria_id: "cat-inativa" }),
    ],
    bordas: [
      { id: "cat", pizzaria_id: "p", nome: "Catupiry", ativo: true, atualizado_em: data, precos: [preco("g", "8.00")] },
      { id: "off", pizzaria_id: "p", nome: "Antiga", ativo: false, atualizado_em: data, precos: [preco("g", "5.00")] },
    ],
    adicionais: [
      { id: "bac", pizzaria_id: "p", nome: "Bacon", preco: "4.00", ativo: true, atualizado_em: data, precos: [preco("g", "6.50")] },
      { id: "off", pizzaria_id: "p", nome: "Antigo", preco: "1.00", ativo: false, atualizado_em: data, precos: [] },
    ],
    produtos: [
      { id: "coca", pizzaria_id: "p", categoria_id: null, nome: "Coca 2L", descricao: null, imagem_url: null, preco: "12.90", ativo: true, atualizado_em: data },
      { id: "fora", pizzaria_id: "p", categoria_id: null, nome: "Fora", descricao: null, imagem_url: null, preco: "1.00", ativo: false, atualizado_em: data },
      { id: "ocul", pizzaria_id: "p", categoria_id: "cat-inativa", nome: "Oculto", descricao: null, imagem_url: null, preco: "1.00", ativo: true, atualizado_em: data },
    ],
    categorias: [
      { id: "cat-inativa", pizzaria_id: "p", nome: "Inativa", tipo: "pizza", ordem: 0, ativo: false, atualizado_em: data },
    ],
  };
}

function pizza(extra: Partial<ItemPizzaSolicitado> = {}): ItemPizzaSolicitado {
  return {
    tipo: "pizza",
    tamanhoId: "g",
    bordaId: null,
    sabores: [{ saborId: "cal", partes: 1 }, { saborId: "mus", partes: 1 }],
    adicionais: [],
    quantidade: 1,
    observacao: null,
    ...extra,
  };
}

function produto(extra: Partial<ItemProdutoSolicitado> = {}): ItemProdutoSolicitado {
  return { tipo: "produto", produtoId: "coca", adicionais: [], quantidade: 1, observacao: null, ...extra };
}

function assertItemInvalido(item: ItemPizzaSolicitado | ItemProdutoSolicitado) {
  assert.throws(
    () => calcularItens(catalogo(), [item], "maior"),
    (error) => error instanceof AppError && error.statusCode === 400 && error.code === "ITEM_INVALIDO"
  );
}

describe("centavos", () => {
  it("converte sem erro de float", () => {
    assert.equal(paraCentavos("45.90"), 4590);
    assert.equal(paraCentavos("0.07"), 7);
    assert.equal(paraCentavos("1.1"), 110);
    assert.equal(paraCentavos("19.99"), 1999);
    assert.equal(deCentavos(4590), "45.90");
    assert.equal(deCentavos(7), "0.07");
    assert.equal(deCentavos(0), "0.00");
  });
});

describe("precoPizzaCentavos", () => {
  it("maior: usa o sabor mais caro", () => {
    assert.equal(precoPizzaCentavos("maior", [{ precoCentavos: 4000, partes: 1 }, { precoCentavos: 5000, partes: 1 }]), 5000);
  });

  it("media: pondera pelas partes", () => {
    assert.equal(precoPizzaCentavos("media", [{ precoCentavos: 4000, partes: 2 }, { precoCentavos: 5000, partes: 1 }]), 4333);
  });

  it("media: dízima arredonda para o centavo mais próximo", () => {
    // 100.01 / 3 = 33.3366... → 33.34
    assert.equal(precoPizzaCentavos("media", [{ precoCentavos: 10001, partes: 1 }, { precoCentavos: 0, partes: 2 }]), 3334);
  });

  it("media: meio centavo arredonda para cima", () => {
    assert.equal(precoPizzaCentavos("media", [{ precoCentavos: 101, partes: 1 }, { precoCentavos: 100, partes: 1 }]), 101);
  });
});

describe("calcularItens", () => {
  it("meio a meio pela regra maior, com snapshot", () => {
    const [item] = calcularItens(catalogo(), [pizza()], "maior");
    assert.equal(item.precoUnitario, "50.00");
    assert.equal(item.precoTotal, "50.00");
    assert.equal(item.totalPartes, 2);
    assert.equal(item.descricao, "Grande (1/2 Calabresa, 1/2 Mussarela)");
    assert.deepEqual(item.sabores, [
      { saborId: "cal", nomeSabor: "Calabresa", partes: 1, precoReferencia: "40.00" },
      { saborId: "mus", nomeSabor: "Mussarela", partes: 1, precoReferencia: "50.00" },
    ]);
  });

  it("meio a meio pela regra media", () => {
    const [item] = calcularItens(catalogo(), [pizza()], "media");
    assert.equal(item.precoUnitario, "45.00");
  });

  it("três sabores pela regra media gera dízima arredondada", () => {
    const sabores = [{ saborId: "cal", partes: 1 }, { saborId: "mus", partes: 1 }, { saborId: "por", partes: 1 }];
    const [item] = calcularItens(catalogo(), [pizza({ sabores })], "media");
    // (40.00 + 50.00 + 45.01) / 3 = 45.00333...
    assert.equal(item.precoUnitario, "45.00");
  });

  it("sabor único não mostra fração", () => {
    const [item] = calcularItens(catalogo(), [pizza({ sabores: [{ saborId: "cal", partes: 1 }] })], "maior");
    assert.equal(item.descricao, "Grande (Calabresa)");
  });

  it("soma borda do tamanho e multiplica pela quantidade", () => {
    const [item] = calcularItens(catalogo(), [pizza({ bordaId: "cat", quantidade: 2 })], "maior");
    assert.equal(item.precoUnitario, "58.00");
    assert.equal(item.precoTotal, "116.00");
    assert.equal(item.descricao, "Grande (1/2 Calabresa, 1/2 Mussarela) + Borda Catupiry");
  });

  it("adicional usa o preço do tamanho, com quantidade", () => {
    const [item] = calcularItens(catalogo(), [pizza({ adicionais: [{ adicionalId: "bac", quantidade: 2 }] })], "maior");
    assert.equal(item.precoUnitario, "63.00");
    assert.deepEqual(item.adicionais, [{ adicionalId: "bac", nome: "Bacon", quantidade: 2, preco: "6.50" }]);
  });

  it("adicional sem preço no tamanho usa o padrão", () => {
    const sabores = [{ saborId: "cal", partes: 1 }];
    const [item] = calcularItens(catalogo(), [pizza({ tamanhoId: "m", sabores, adicionais: [{ adicionalId: "bac", quantidade: 1 }] })], "maior");
    assert.equal(item.precoUnitario, "34.00");
  });

  it("produto usa o preço fixo e o adicional padrão", () => {
    const [item] = calcularItens(catalogo(), [produto({ quantidade: 3, adicionais: [{ adicionalId: "bac", quantidade: 1 }] })], "maior");
    assert.equal(item.precoUnitario, "16.90");
    assert.equal(item.precoTotal, "50.70");
    assert.equal(item.descricao, "Coca 2L");
    assert.equal(item.tamanhoId, null);
  });

  it("limita a descrição a 255 caracteres", () => {
    const base = catalogo();
    base.sabores[0].nome = "S".repeat(300);
    const [item] = calcularItens(base, [pizza()], "maior");
    assert.equal(item.descricao.length, 255);
  });

  it("recusa tamanho inexistente ou inativo", () => {
    assertItemInvalido(pizza({ tamanhoId: "nada" }));
    assertItemInvalido(pizza({ tamanhoId: "x", sabores: [{ saborId: "cal", partes: 1 }] }));
  });

  it("recusa sabor inexistente, inativo ou de categoria inativa", () => {
    assertItemInvalido(pizza({ sabores: [{ saborId: "nada", partes: 1 }] }));
    assertItemInvalido(pizza({ sabores: [{ saborId: "ina", partes: 1 }] }));
    assertItemInvalido(pizza({ sabores: [{ saborId: "sec", partes: 1 }] }));
  });

  it("recusa sabor sem preço no tamanho", () => {
    assertItemInvalido(pizza({ tamanhoId: "m", sabores: [{ saborId: "por", partes: 1 }] }));
  });

  it("recusa item sem sabor, sabor repetido e partes acima do máximo", () => {
    assertItemInvalido(pizza({ sabores: [] }));
    assertItemInvalido(pizza({ sabores: [{ saborId: "cal", partes: 1 }, { saborId: "cal", partes: 1 }] }));
    assertItemInvalido(pizza({ sabores: [{ saborId: "cal", partes: 3 }, { saborId: "mus", partes: 1 }] }));
  });

  it("recusa borda inexistente, inativa ou sem preço no tamanho", () => {
    assertItemInvalido(pizza({ bordaId: "nada" }));
    assertItemInvalido(pizza({ bordaId: "off" }));
    assertItemInvalido(pizza({ tamanhoId: "m", sabores: [{ saborId: "cal", partes: 1 }], bordaId: "cat" }));
  });

  it("recusa adicional inexistente, inativo ou repetido", () => {
    assertItemInvalido(pizza({ adicionais: [{ adicionalId: "nada", quantidade: 1 }] }));
    assertItemInvalido(pizza({ adicionais: [{ adicionalId: "off", quantidade: 1 }] }));
    assertItemInvalido(pizza({ adicionais: [{ adicionalId: "bac", quantidade: 1 }, { adicionalId: "bac", quantidade: 1 }] }));
  });

  it("recusa produto inexistente, inativo ou de categoria inativa", () => {
    assertItemInvalido(produto({ produtoId: "nada" }));
    assertItemInvalido(produto({ produtoId: "fora" }));
    assertItemInvalido(produto({ produtoId: "ocul" }));
  });
});

describe("calcularTotais", () => {
  const itens = calcularItens(catalogo(), [pizza(), produto()], "maior");

  it("total = subtotal - desconto + taxa", () => {
    assert.deepEqual(calcularTotais(itens, "2.90", "7.50"), {
      subtotal: "62.90",
      desconto: "2.90",
      taxaEntrega: "7.50",
      total: "67.50",
    });
  });

  it("aceita desconto igual ao subtotal", () => {
    assert.equal(calcularTotais(itens, "62.90", "0.00").total, "0.00");
  });

  it("recusa desconto maior que o subtotal", () => {
    assert.throws(
      () => calcularTotais(itens, "62.91", "0.00"),
      (error) => error instanceof AppError && error.code === "DESCONTO_INVALIDO"
    );
  });
});
