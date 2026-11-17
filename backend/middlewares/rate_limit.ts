import { rateLimit } from "express-rate-limit";

// Rota pública que cria dados: limita para ninguém encher o banco de pizzarias falsas.
// Aqui todas as tentativas contam, inclusive as que dão certo.
export const cadastroRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      erro: {
        mensagem: "Muitos cadastros feitos a partir desta rede. Tente novamente mais tarde.",
        codigo: "MUITAS_TENTATIVAS",
      },
    });
  },
});

// Contra quem tenta adivinhar senhas: só tentativas que falham contam
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      erro: {
        mensagem: "Muitas tentativas de login. Tente novamente em alguns minutos.",
        codigo: "MUITAS_TENTATIVAS",
      },
    });
  },
});

// Pedidos do site são públicos: limita para ninguém encher a fila da cozinha com pedidos falsos.
// Envios repetidos (mesma chave de idempotência) também contam
export const pedidoSiteRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      erro: {
        mensagem: "Muitos pedidos feitos a partir desta rede. Tente novamente em alguns minutos.",
        codigo: "MUITAS_TENTATIVAS",
      },
    });
  },
});
