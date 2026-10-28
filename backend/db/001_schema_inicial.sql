-- Pizza Flow - schema inicial (MVP)
-- Requer MySQL 8.0.16+ (DEFAULT (UUID()) e CHECK constraints)
-- Datas são gravadas em UTC: a conexão da aplicação deve usar time_zone = '+00:00'

SET NAMES utf8mb4;

-- =====================================================================
-- Acesso / Tenant
-- =====================================================================

CREATE TABLE pizzarias (
    id                      CHAR(36)      NOT NULL DEFAULT (UUID()),
    nome                    VARCHAR(150)  NOT NULL,
    slug                    VARCHAR(100)  NOT NULL,
    telefone                VARCHAR(20)   NULL,
    fuso_horario            VARCHAR(50)   NOT NULL DEFAULT 'America/Sao_Paulo',
    regra_preco_pizza       VARCHAR(10)   NOT NULL DEFAULT 'maior',
    tempo_alvo_preparo_min  INT           NOT NULL DEFAULT 30,
    taxa_entrega_padrao     DECIMAL(10,2) NOT NULL DEFAULT 0,
    ultimo_numero_pedido    INT           NOT NULL DEFAULT 0,
    ativo                   BOOLEAN       NOT NULL DEFAULT TRUE,
    criado_em               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pizzarias_slug (slug),
    CONSTRAINT ck_pizzarias_regra_preco CHECK (regra_preco_pizza IN ('maior', 'media')),
    CONSTRAINT ck_pizzarias_tempo_alvo  CHECK (tempo_alvo_preparo_min > 0),
    CONSTRAINT ck_pizzarias_taxa        CHECK (taxa_entrega_padrao >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Collation _ci torna o email case-insensitive (equivalente ao citext)
CREATE TABLE usuarios (
    id          CHAR(36)     NOT NULL DEFAULT (UUID()),
    nome        VARCHAR(150) NOT NULL,
    email       VARCHAR(255) NOT NULL,
    senha_hash  VARCHAR(255) NOT NULL,
    criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE membros (
    id           CHAR(36)    NOT NULL DEFAULT (UUID()),
    pizzaria_id  CHAR(36)    NOT NULL,
    usuario_id   CHAR(36)    NOT NULL,
    papel        VARCHAR(20) NOT NULL,
    ativo        BOOLEAN     NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_membros_tenant (pizzaria_id, id),
    UNIQUE KEY uq_membros_pizzaria_usuario (pizzaria_id, usuario_id),
    CONSTRAINT fk_membros_pizzaria FOREIGN KEY (pizzaria_id) REFERENCES pizzarias (id),
    CONSTRAINT fk_membros_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios (id),
    CONSTRAINT ck_membros_papel CHECK (papel IN ('dono', 'gerente', 'atendente', 'cozinha', 'entregador'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- Cardápio
-- =====================================================================

CREATE TABLE tamanhos (
    id           CHAR(36)    NOT NULL DEFAULT (UUID()),
    pizzaria_id  CHAR(36)    NOT NULL,
    nome         VARCHAR(50) NOT NULL,
    fatias       INT         NOT NULL,
    max_sabores  INT         NOT NULL DEFAULT 1,
    ordem        INT         NOT NULL DEFAULT 0,
    ativo        BOOLEAN     NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tamanhos_tenant (pizzaria_id, id),
    CONSTRAINT fk_tamanhos_pizzaria FOREIGN KEY (pizzaria_id) REFERENCES pizzarias (id),
    CONSTRAINT ck_tamanhos_fatias      CHECK (fatias > 0),
    CONSTRAINT ck_tamanhos_max_sabores CHECK (max_sabores >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sabores (
    id           CHAR(36)     NOT NULL DEFAULT (UUID()),
    pizzaria_id  CHAR(36)     NOT NULL,
    nome         VARCHAR(100) NOT NULL,
    descricao    TEXT         NULL,
    tipo         VARCHAR(10)  NOT NULL DEFAULT 'salgada',
    ativo        BOOLEAN      NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sabores_tenant (pizzaria_id, id),
    CONSTRAINT fk_sabores_pizzaria FOREIGN KEY (pizzaria_id) REFERENCES pizzarias (id),
    CONSTRAINT ck_sabores_tipo CHECK (tipo IN ('salgada', 'doce'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sabor_precos (
    pizzaria_id  CHAR(36)      NOT NULL,
    sabor_id     CHAR(36)      NOT NULL,
    tamanho_id   CHAR(36)      NOT NULL,
    preco        DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (sabor_id, tamanho_id),
    CONSTRAINT fk_sabor_precos_sabor   FOREIGN KEY (pizzaria_id, sabor_id)   REFERENCES sabores (pizzaria_id, id),
    CONSTRAINT fk_sabor_precos_tamanho FOREIGN KEY (pizzaria_id, tamanho_id) REFERENCES tamanhos (pizzaria_id, id),
    CONSTRAINT ck_sabor_precos_preco CHECK (preco >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE bordas (
    id           CHAR(36)     NOT NULL DEFAULT (UUID()),
    pizzaria_id  CHAR(36)     NOT NULL,
    nome         VARCHAR(100) NOT NULL,
    ativo        BOOLEAN      NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bordas_tenant (pizzaria_id, id),
    CONSTRAINT fk_bordas_pizzaria FOREIGN KEY (pizzaria_id) REFERENCES pizzarias (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE borda_precos (
    pizzaria_id  CHAR(36)      NOT NULL,
    borda_id     CHAR(36)      NOT NULL,
    tamanho_id   CHAR(36)      NOT NULL,
    preco        DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (borda_id, tamanho_id),
    CONSTRAINT fk_borda_precos_borda   FOREIGN KEY (pizzaria_id, borda_id)   REFERENCES bordas (pizzaria_id, id),
    CONSTRAINT fk_borda_precos_tamanho FOREIGN KEY (pizzaria_id, tamanho_id) REFERENCES tamanhos (pizzaria_id, id),
    CONSTRAINT ck_borda_precos_preco CHECK (preco >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE adicionais (
    id           CHAR(36)      NOT NULL DEFAULT (UUID()),
    pizzaria_id  CHAR(36)      NOT NULL,
    nome         VARCHAR(100)  NOT NULL,
    preco        DECIMAL(10,2) NOT NULL,
    ativo        BOOLEAN       NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_adicionais_tenant (pizzaria_id, id),
    CONSTRAINT fk_adicionais_pizzaria FOREIGN KEY (pizzaria_id) REFERENCES pizzarias (id),
    CONSTRAINT ck_adicionais_preco CHECK (preco >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE produtos (
    id           CHAR(36)      NOT NULL DEFAULT (UUID()),
    pizzaria_id  CHAR(36)      NOT NULL,
    nome         VARCHAR(100)  NOT NULL,
    categoria    VARCHAR(20)   NOT NULL,
    preco        DECIMAL(10,2) NOT NULL,
    ativo        BOOLEAN       NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_produtos_tenant (pizzaria_id, id),
    CONSTRAINT fk_produtos_pizzaria FOREIGN KEY (pizzaria_id) REFERENCES pizzarias (id),
    CONSTRAINT ck_produtos_categoria CHECK (categoria IN ('bebida', 'sobremesa', 'outro')),
    CONSTRAINT ck_produtos_preco     CHECK (preco >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- Clientes
-- =====================================================================

-- telefone deve ser salvo só com dígitos e DDD (normalizado pela aplicação)
CREATE TABLE clientes (
    id           CHAR(36)     NOT NULL DEFAULT (UUID()),
    pizzaria_id  CHAR(36)     NOT NULL,
    nome         VARCHAR(150) NOT NULL,
    telefone     VARCHAR(20)  NOT NULL,
    email        VARCHAR(255) NULL,
    observacoes  TEXT         NULL,
    criado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_clientes_tenant (pizzaria_id, id),
    UNIQUE KEY uq_clientes_telefone (pizzaria_id, telefone),
    CONSTRAINT fk_clientes_pizzaria FOREIGN KEY (pizzaria_id) REFERENCES pizzarias (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- MySQL não tem índice único parcial: a coluna gerada fica NULL quando o
-- endereço não é principal, então o UNIQUE só vale para principal = TRUE
CREATE TABLE enderecos (
    id                    CHAR(36)     NOT NULL DEFAULT (UUID()),
    pizzaria_id           CHAR(36)     NOT NULL,
    cliente_id            CHAR(36)     NOT NULL,
    cep                   VARCHAR(9)   NULL,
    logradouro            VARCHAR(200) NOT NULL,
    numero                VARCHAR(20)  NOT NULL,
    complemento           VARCHAR(100) NULL,
    bairro                VARCHAR(100) NOT NULL,
    cidade                VARCHAR(100) NOT NULL,
    estado                CHAR(2)      NOT NULL,
    referencia            VARCHAR(200) NULL,
    principal             BOOLEAN      NOT NULL DEFAULT FALSE,
    principal_cliente_id  CHAR(36) GENERATED ALWAYS AS (IF(principal, cliente_id, NULL)) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_enderecos_principal (principal_cliente_id),
    CONSTRAINT fk_enderecos_cliente FOREIGN KEY (pizzaria_id, cliente_id) REFERENCES clientes (pizzaria_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- Pedidos
-- =====================================================================

-- numero: gerado incrementando pizzarias.ultimo_numero_pedido na mesma transação
CREATE TABLE pedidos (
    id                   CHAR(36)      NOT NULL DEFAULT (UUID()),
    pizzaria_id          CHAR(36)      NOT NULL,
    numero               INT           NOT NULL,
    tipo                 VARCHAR(10)   NOT NULL,
    status               VARCHAR(20)   NOT NULL DEFAULT 'recebido',
    cliente_id           CHAR(36)      NULL,
    criado_por           CHAR(36)      NOT NULL,
    entregador_id        CHAR(36)      NULL,
    mesa                 VARCHAR(20)   NULL,
    endereco_entrega     JSON          NULL,
    subtotal             DECIMAL(10,2) NOT NULL DEFAULT 0,
    desconto             DECIMAL(10,2) NOT NULL DEFAULT 0,
    taxa_entrega         DECIMAL(10,2) NOT NULL DEFAULT 0,
    total                DECIMAL(10,2) NOT NULL DEFAULT 0,
    observacao           TEXT          NULL,
    criado_em            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    preparo_em           DATETIME      NULL,
    pronto_em            DATETIME      NULL,
    saiu_em              DATETIME      NULL,
    finalizado_em        DATETIME      NULL,
    cancelado_em         DATETIME      NULL,
    motivo_cancelamento  TEXT          NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pedidos_tenant (pizzaria_id, id),
    UNIQUE KEY uq_pedidos_numero (pizzaria_id, numero),
    KEY ix_pedidos_painel (pizzaria_id, status, criado_em),
    CONSTRAINT fk_pedidos_pizzaria   FOREIGN KEY (pizzaria_id) REFERENCES pizzarias (id),
    CONSTRAINT fk_pedidos_cliente    FOREIGN KEY (pizzaria_id, cliente_id)    REFERENCES clientes (pizzaria_id, id),
    CONSTRAINT fk_pedidos_criado_por FOREIGN KEY (pizzaria_id, criado_por)    REFERENCES membros (pizzaria_id, id),
    CONSTRAINT fk_pedidos_entregador FOREIGN KEY (pizzaria_id, entregador_id) REFERENCES membros (pizzaria_id, id),
    CONSTRAINT ck_pedidos_tipo   CHECK (tipo IN ('delivery', 'retirada', 'local')),
    CONSTRAINT ck_pedidos_status CHECK (status IN ('recebido', 'preparando', 'pronto', 'saiu_para_entrega', 'finalizado', 'cancelado')),
    CONSTRAINT ck_pedidos_valores CHECK (subtotal >= 0 AND desconto >= 0 AND taxa_entrega >= 0 AND total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE pedido_itens (
    id              CHAR(36)      NOT NULL DEFAULT (UUID()),
    pizzaria_id     CHAR(36)      NOT NULL,
    pedido_id       CHAR(36)      NOT NULL,
    tipo            VARCHAR(10)   NOT NULL,
    tamanho_id      CHAR(36)      NULL,
    borda_id        CHAR(36)      NULL,
    produto_id      CHAR(36)      NULL,
    total_partes    SMALLINT      NULL,
    descricao       VARCHAR(255)  NOT NULL,
    quantidade      INT           NOT NULL DEFAULT 1,
    preco_unitario  DECIMAL(10,2) NOT NULL,
    preco_total     DECIMAL(10,2) NOT NULL,
    observacao      TEXT          NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pedido_itens_tenant (pizzaria_id, id),
    CONSTRAINT fk_pedido_itens_pedido  FOREIGN KEY (pizzaria_id, pedido_id)  REFERENCES pedidos (pizzaria_id, id),
    CONSTRAINT fk_pedido_itens_tamanho FOREIGN KEY (pizzaria_id, tamanho_id) REFERENCES tamanhos (pizzaria_id, id),
    CONSTRAINT fk_pedido_itens_borda   FOREIGN KEY (pizzaria_id, borda_id)   REFERENCES bordas (pizzaria_id, id),
    CONSTRAINT fk_pedido_itens_produto FOREIGN KEY (pizzaria_id, produto_id) REFERENCES produtos (pizzaria_id, id),
    CONSTRAINT ck_pedido_itens_tipo CHECK (
        (tipo = 'pizza'   AND tamanho_id IS NOT NULL AND total_partes IS NOT NULL AND produto_id IS NULL)
     OR (tipo = 'produto' AND produto_id IS NOT NULL AND tamanho_id IS NULL AND borda_id IS NULL AND total_partes IS NULL)
    ),
    CONSTRAINT ck_pedido_itens_partes     CHECK (total_partes IS NULL OR total_partes >= 1),
    CONSTRAINT ck_pedido_itens_quantidade CHECK (quantidade > 0),
    CONSTRAINT ck_pedido_itens_valores    CHECK (preco_unitario >= 0 AND preco_total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A soma de partes por item deve ser igual a pedido_itens.total_partes (validado na aplicação)
CREATE TABLE pedido_item_sabores (
    id                CHAR(36)      NOT NULL DEFAULT (UUID()),
    pizzaria_id       CHAR(36)      NOT NULL,
    pedido_item_id    CHAR(36)      NOT NULL,
    sabor_id          CHAR(36)      NOT NULL,
    nome_sabor        VARCHAR(100)  NOT NULL,
    partes            SMALLINT      NOT NULL DEFAULT 1,
    preco_referencia  DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_pedido_item_sabores_item  FOREIGN KEY (pizzaria_id, pedido_item_id) REFERENCES pedido_itens (pizzaria_id, id),
    CONSTRAINT fk_pedido_item_sabores_sabor FOREIGN KEY (pizzaria_id, sabor_id)       REFERENCES sabores (pizzaria_id, id),
    CONSTRAINT ck_pedido_item_sabores_partes CHECK (partes >= 1),
    CONSTRAINT ck_pedido_item_sabores_preco  CHECK (preco_referencia >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE pedido_item_adicionais (
    id              CHAR(36)      NOT NULL DEFAULT (UUID()),
    pizzaria_id     CHAR(36)      NOT NULL,
    pedido_item_id  CHAR(36)      NOT NULL,
    adicional_id    CHAR(36)      NOT NULL,
    nome            VARCHAR(100)  NOT NULL,
    quantidade      INT           NOT NULL DEFAULT 1,
    preco           DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_pedido_item_adicionais_item      FOREIGN KEY (pizzaria_id, pedido_item_id) REFERENCES pedido_itens (pizzaria_id, id),
    CONSTRAINT fk_pedido_item_adicionais_adicional FOREIGN KEY (pizzaria_id, adicional_id)   REFERENCES adicionais (pizzaria_id, id),
    CONSTRAINT ck_pedido_item_adicionais_quantidade CHECK (quantidade > 0),
    CONSTRAINT ck_pedido_item_adicionais_preco      CHECK (preco >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE pagamentos (
    id           CHAR(36)      NOT NULL DEFAULT (UUID()),
    pizzaria_id  CHAR(36)      NOT NULL,
    pedido_id    CHAR(36)      NOT NULL,
    forma        VARCHAR(10)   NOT NULL,
    valor        DECIMAL(10,2) NOT NULL,
    troco_para   DECIMAL(10,2) NULL,
    status       VARCHAR(10)   NOT NULL DEFAULT 'pendente',
    pago_em      DATETIME      NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_pagamentos_pedido FOREIGN KEY (pizzaria_id, pedido_id) REFERENCES pedidos (pizzaria_id, id),
    CONSTRAINT ck_pagamentos_forma  CHECK (forma IN ('dinheiro', 'pix', 'credito', 'debito', 'vale')),
    CONSTRAINT ck_pagamentos_status CHECK (status IN ('pendente', 'pago', 'estornado')),
    CONSTRAINT ck_pagamentos_valor  CHECK (valor > 0),
    CONSTRAINT ck_pagamentos_troco  CHECK (troco_para IS NULL OR (forma = 'dinheiro' AND troco_para >= valor))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE pedido_eventos (
    id               CHAR(36)    NOT NULL DEFAULT (UUID()),
    pizzaria_id      CHAR(36)    NOT NULL,
    pedido_id        CHAR(36)    NOT NULL,
    status_anterior  VARCHAR(20) NULL,
    status_novo      VARCHAR(20) NOT NULL,
    membro_id        CHAR(36)    NOT NULL,
    criado_em        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_pedido_eventos_pedido (pizzaria_id, pedido_id, criado_em),
    CONSTRAINT fk_pedido_eventos_pedido FOREIGN KEY (pizzaria_id, pedido_id) REFERENCES pedidos (pizzaria_id, id),
    CONSTRAINT fk_pedido_eventos_membro FOREIGN KEY (pizzaria_id, membro_id) REFERENCES membros (pizzaria_id, id),
    CONSTRAINT ck_pedido_eventos_status_anterior CHECK (status_anterior IS NULL OR status_anterior IN ('recebido', 'preparando', 'pronto', 'saiu_para_entrega', 'finalizado', 'cancelado')),
    CONSTRAINT ck_pedido_eventos_status_novo     CHECK (status_novo IN ('recebido', 'preparando', 'pronto', 'saiu_para_entrega', 'finalizado', 'cancelado'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
