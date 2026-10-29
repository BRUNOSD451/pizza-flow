import readline from "node:readline";
import { z } from "zod";
import { db } from "./db";
import { userRepository } from "../repositories/user_repository";
import { hashSenha } from "../utils/senha";

// Cria (ou promove) o admin da plataforma.
// Interativo: npm run seed:admin
// Sem perguntas: ADMIN_NOME=... ADMIN_EMAIL=... ADMIN_SENHA=... npm run seed:admin

const schema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto"),
  email: z.email("Email inválido"),
  senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres"),
});

function perguntar(texto: string, esconder = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (esconder) {
    // Mostra a pergunta, mas não ecoa o que é digitado
    const output = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    output._writeToOutput = (s) => {
      if (s.includes(texto)) output.output.write(s);
    };
  }
  return new Promise((resolve) =>
    rl.question(texto, (resposta) => {
      rl.close();
      if (esconder) process.stdout.write("\n");
      resolve(resposta);
    })
  );
}

async function main() {
  const email = process.env.ADMIN_EMAIL ?? (await perguntar("Email do admin: "));

  const existente = await userRepository.findByEmail(email);
  if (existente) {
    if (existente.admin_plataforma) {
      console.log(`${existente.email} já é admin da plataforma.`);
      return;
    }
    await userRepository.edit(existente.id, { adminPlataforma: true });
    console.log(`Usuário existente ${existente.email} promovido a admin da plataforma (senha mantida).`);
    return;
  }

  const dados = schema.parse({
    email,
    nome: process.env.ADMIN_NOME ?? (await perguntar("Nome: ")),
    senha: process.env.ADMIN_SENHA ?? (await perguntar("Senha (mín. 8 caracteres): ", true)),
  });

  if (!process.env.ADMIN_SENHA) {
    const confirmacao = await perguntar("Confirme a senha: ", true);
    if (confirmacao !== dados.senha) throw new Error("As senhas não conferem");
  }

  const usuario = await userRepository.create({
    nome: dados.nome,
    email: dados.email,
    senhaHash: await hashSenha(dados.senha),
    adminPlataforma: true,
  });
  console.log(`Admin da plataforma criado: ${usuario.nome} <${usuario.email}>`);
}

main()
  .catch((error) => {
    if (error instanceof z.ZodError) {
      console.error("Dados inválidos:\n" + error.issues.map((i) => `- ${i.message}`).join("\n"));
    } else {
      console.error("Falha ao criar admin:", error.message);
    }
    process.exitCode = 1;
  })
  .finally(() => db.end());
