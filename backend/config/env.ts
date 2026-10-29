import "./load_env";

// Variáveis da API, validadas na inicialização: falta de JWT_SECRET derruba o servidor ao subir

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente ${nome} não definida no .env`);
  return valor;
}

export const env = {
  port: Number(process.env.PORT) || 3333,

  jwtSecret: obrigatoria("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",

  // Lista separada por vírgula; "*" libera qualquer origem (só para desenvolvimento)
  corsOrigins: (process.env.CORS_ORIGINS || "*").split(",").map((o) => o.trim()),

  // Quantos proxies existem na frente da API (0 = acesso direto). Define de onde vem o IP do cliente.
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
};
