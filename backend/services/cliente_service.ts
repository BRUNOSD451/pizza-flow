import { withTransaction } from "../db/db";
import { AppError } from "../errors/app_error";
import { areaEntregaRepository, type AreaEntrega } from "../repositories/area_entrega_repository";
import {
  clienteRepository,
  type Cliente,
  type CriarClienteDados,
  type EditarClienteDados,
  type ListarClientesFiltros,
} from "../repositories/cliente_repository";
import {
  enderecoRepository,
  type CriarEnderecoDados,
  type EditarEnderecoDados,
  type Endereco,
} from "../repositories/endereco_repository";

export interface ClienteComEnderecos extends Cliente {
  enderecos: Endereco[];
}

// bairro e cidade podem faltar quando vier área de entrega: nesse caso são copiados dela
export type NovoEnderecoDados = Omit<CriarEnderecoDados, "bairro" | "cidade"> & { bairro?: string; cidade?: string };

const CLIENTE_NAO_ENCONTRADO = () => new AppError("Cliente não encontrado", 404, "CLIENTE_NAO_ENCONTRADO");
const ENDERECO_NAO_ENCONTRADO = () => new AppError("Endereço não encontrado", 404, "ENDERECO_NAO_ENCONTRADO");
const TELEFONE_EM_USO = () => new AppError("Já existe um cliente com este telefone", 409, "TELEFONE_EM_USO");
const PRINCIPAL_EM_CONFLITO = () =>
  new AppError("O endereço principal foi alterado ao mesmo tempo. Tente novamente.", 409, "ENDERECO_PRINCIPAL_EM_CONFLITO");

function codigoErro(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

class clienteservice {
  async listar(pizzariaId: string, filtros: ListarClientesFiltros): Promise<Cliente[]> {
    return clienteRepository.listByPizzaria(pizzariaId, filtros);
  }

  async buscar(pizzariaId: string, clienteId: string): Promise<ClienteComEnderecos> {
    const cliente = await clienteRepository.findById(pizzariaId, clienteId);
    if (!cliente) throw CLIENTE_NAO_ENCONTRADO();
    return { ...cliente, enderecos: await enderecoRepository.listByCliente(pizzariaId, clienteId) };
  }

  async criar(pizzariaId: string, dados: CriarClienteDados): Promise<Cliente> {
    try {
      return await clienteRepository.create(pizzariaId, dados);
    } catch (error) {
      if (codigoErro(error) === "ER_DUP_ENTRY") throw TELEFONE_EM_USO();
      throw error;
    }
  }

  async editar(pizzariaId: string, clienteId: string, dados: EditarClienteDados): Promise<Cliente> {
    try {
      const editado = await clienteRepository.edit(pizzariaId, clienteId, dados);
      if (!editado) throw CLIENTE_NAO_ENCONTRADO();
      return editado;
    } catch (error) {
      if (codigoErro(error) === "ER_DUP_ENTRY") throw TELEFONE_EM_USO();
      throw error;
    }
  }

  async criarEndereco(pizzariaId: string, clienteId: string, dados: NovoEnderecoDados): Promise<Endereco> {
    if (!(await clienteRepository.findById(pizzariaId, clienteId))) throw CLIENTE_NAO_ENCONTRADO();

    const area = dados.areaEntregaId ? await buscarAreaAtiva(pizzariaId, dados.areaEntregaId) : null;
    const bairro = area?.bairro ?? dados.bairro;
    const cidade = area?.cidade ?? dados.cidade;
    if (!bairro || !cidade) {
      throw new AppError("Informe bairro e cidade, ou uma área de entrega", 400, "ENDERECO_INVALIDO");
    }

    return salvandoPrincipal(() =>
      withTransaction(async (conn) => {
        if (dados.principal) await enderecoRepository.desmarcarPrincipal(pizzariaId, clienteId, conn);
        return enderecoRepository.create(pizzariaId, clienteId, { ...dados, bairro, cidade }, conn);
      })
    );
  }

  async editarEndereco(
    pizzariaId: string,
    clienteId: string,
    enderecoId: string,
    dados: EditarEnderecoDados
  ): Promise<Endereco> {
    const atual = await enderecoRepository.findById(pizzariaId, clienteId, enderecoId);
    if (!atual) throw ENDERECO_NAO_ENCONTRADO();

    // Enquanto o endereço estiver ligado a uma área, bairro e cidade seguem os dela.
    // Área já ligada que foi desativada não impede corrigir o complemento, por exemplo.
    let area: AreaEntrega | null = null;
    if (dados.areaEntregaId) {
      area = await buscarAreaAtiva(pizzariaId, dados.areaEntregaId);
    } else if (dados.areaEntregaId === undefined && atual.area_entrega_id && (dados.bairro || dados.cidade)) {
      area = await areaEntregaRepository.findById(pizzariaId, atual.area_entrega_id);
    }
    const campos = area ? { ...dados, bairro: area.bairro, cidade: area.cidade } : dados;

    return salvandoPrincipal(() =>
      withTransaction(async (conn) => {
        if (dados.principal) await enderecoRepository.desmarcarPrincipal(pizzariaId, clienteId, conn);
        const editado = await enderecoRepository.edit(pizzariaId, clienteId, enderecoId, campos, conn);
        if (!editado) throw ENDERECO_NAO_ENCONTRADO();
        return editado;
      })
    );
  }

  // Pedidos guardam cópia do endereço, então apagar não altera o histórico
  async removerEndereco(pizzariaId: string, clienteId: string, enderecoId: string): Promise<void> {
    if (!(await enderecoRepository.delete(pizzariaId, clienteId, enderecoId))) throw ENDERECO_NAO_ENCONTRADO();
  }
}

async function buscarAreaAtiva(pizzariaId: string, areaEntregaId: string): Promise<AreaEntrega> {
  const area = await areaEntregaRepository.findById(pizzariaId, areaEntregaId);
  if (!area || !area.ativo) {
    throw new AppError("Área de entrega não encontrada ou inativa", 400, "AREA_ENTREGA_INVALIDA");
  }
  return area;
}

// Dois pedidos ao mesmo tempo marcando endereços como principal esbarram no UNIQUE do banco
async function salvandoPrincipal(salvar: () => Promise<Endereco>): Promise<Endereco> {
  try {
    return await salvar();
  } catch (error) {
    if (codigoErro(error) === "ER_DUP_ENTRY") throw PRINCIPAL_EM_CONFLITO();
    throw error;
  }
}

export const clienteService = new clienteservice();
