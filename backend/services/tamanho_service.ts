import { AppError } from "../errors/app_error";
import {
  tamanhoRepository,
  type CriarTamanhoDados,
  type EditarTamanhoDados,
  type PrecoPorTamanho,
  type Tamanho,
} from "../repositories/tamanho_repository";

const TAMANHO_NAO_ENCONTRADO = () => new AppError("Tamanho não encontrado", 404, "TAMANHO_NAO_ENCONTRADO");

class tamanhoservice {
  async listar(pizzariaId: string): Promise<Tamanho[]> {
    return tamanhoRepository.listByPizzaria(pizzariaId);
  }

  async criar(pizzariaId: string, dados: CriarTamanhoDados): Promise<Tamanho> {
    validarSabores(dados.fatias, dados.maxSabores);
    return tamanhoRepository.create(pizzariaId, dados);
  }

  // Valida a tabela de preços de um sabor/borda. Tamanho inativo é aceito:
  // o preço fica guardado para quando ele for reativado
  async validarPrecos(pizzariaId: string, precos: PrecoPorTamanho[]) {
    const ids = precos.map((p) => p.tamanhoId);
    const encontrados = await tamanhoRepository.findByIds(pizzariaId, ids);
    if (encontrados.length !== ids.length) {
      throw new AppError("Um ou mais tamanhos não foram encontrados", 400, "TAMANHO_INVALIDO");
    }
  }

  // Pedidos antigos guardam snapshot, então mudar o tamanho não altera o que já foi vendido
  async editar(pizzariaId: string, tamanhoId: string, dados: EditarTamanhoDados): Promise<Tamanho> {
    const atual = await tamanhoRepository.findById(pizzariaId, tamanhoId);
    if (!atual) throw TAMANHO_NAO_ENCONTRADO();

    validarSabores(dados.fatias ?? atual.fatias, dados.maxSabores ?? atual.max_sabores);

    const editado = await tamanhoRepository.edit(pizzariaId, tamanhoId, dados);
    if (!editado) throw TAMANHO_NAO_ENCONTRADO();
    return editado;
  }
}

// Cada sabor ocupa ao menos uma fatia
function validarSabores(fatias: number, maxSabores: number) {
  if (maxSabores > fatias) {
    throw new AppError("O máximo de sabores não pode passar do número de fatias", 400, "MAX_SABORES_INVALIDO");
  }
}

export const tamanhoService = new tamanhoservice();
