-- Pizza Flow - robustez antes da implementação dos pedidos
-- 1. Idempotência: pedido duplicado e webhooks repetidos
-- 2. atualizado_em nas tabelas editáveis
-- 3. Bairro do endereço/pedido vindo de areas_entrega
-- 4. Preço de adicional por tamanho
-- 5. Delivery exige endereço
-- 6. Índice para relatórios por período

SET NAMES utf8mb4;

-- =====================================================================
-- 1. Idempotência
-- =====================================================================

-- Gerada pelo front a cada tentativa de finalizar; repetir o envio devolve o mesmo pedido
ALTER TABLE pedidos
    ADD COLUMN chave_idempotencia VARCHAR(64) NULL AFTER numero,
    ADD UNIQUE KEY uq_pedidos_idempotencia (pizzaria_id, chave_idempotencia);

-- Webhooks de gateways (Pix, cobrança do SaaS, iFood) chegam repetidos; cada evento é processado uma vez
CREATE TABLE webhook_eventos (
    id              CHAR(36)     NOT NULL DEFAULT (UUID()),
    provedor        VARCHAR(30)  NOT NULL,
    evento_id       VARCHAR(255) NOT NULL,
    tipo            VARCHAR(100) NULL,
    payload         JSON         NOT NULL,
    recebido_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processado_em   DATETIME     NULL,
    erro            TEXT         NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_webhook_eventos_evento (provedor, evento_id),
    KEY ix_webhook_eventos_pendentes (processado_em, recebido_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 2. atualizado_em (a conexão usa UTC, então o valor também fica em UTC)
-- =====================================================================

ALTER TABLE pizzarias              ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE usuarios               ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE membros                ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE horarios_funcionamento ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE areas_entrega          ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE categorias             ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE tamanhos               ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE sabores                ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE sabor_precos           ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE bordas                 ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE borda_precos           ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE adicionais             ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE produtos               ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE clientes               ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE enderecos              ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE mesas                  ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE comandas               ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE pedido_itens           ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE pagamentos             ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- =====================================================================
-- 3. Bairro vindo da lista de áreas de entrega
-- =====================================================================

ALTER TABLE areas_entrega
    ADD UNIQUE KEY uq_areas_entrega_tenant (pizzaria_id, id);

-- bairro/cidade continuam como texto para exibição; a taxa vem da área escolhida
ALTER TABLE enderecos
    ADD COLUMN area_entrega_id CHAR(36) NULL AFTER cliente_id,
    ADD CONSTRAINT fk_enderecos_area FOREIGN KEY (pizzaria_id, area_entrega_id) REFERENCES areas_entrega (pizzaria_id, id);

-- 5 e 6 entram no mesmo ALTER de pedidos
ALTER TABLE pedidos
    ADD COLUMN area_entrega_id CHAR(36) NULL AFTER comanda_id,
    ADD COLUMN atualizado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ADD CONSTRAINT fk_pedidos_area FOREIGN KEY (pizzaria_id, area_entrega_id) REFERENCES areas_entrega (pizzaria_id, id),
    ADD CONSTRAINT ck_pedidos_delivery_endereco CHECK (tipo <> 'delivery' OR endereco_entrega IS NOT NULL),
    ADD KEY ix_pedidos_periodo (pizzaria_id, criado_em);

-- =====================================================================
-- 4. Preço de adicional por tamanho
-- =====================================================================

-- adicionais.preco passa a ser o preço padrão (produtos ou tamanho sem preço próprio)
CREATE TABLE adicional_precos (
    pizzaria_id    CHAR(36)      NOT NULL,
    adicional_id   CHAR(36)      NOT NULL,
    tamanho_id     CHAR(36)      NOT NULL,
    preco          DECIMAL(10,2) NOT NULL,
    atualizado_em  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (adicional_id, tamanho_id),
    CONSTRAINT fk_adicional_precos_adicional FOREIGN KEY (pizzaria_id, adicional_id) REFERENCES adicionais (pizzaria_id, id),
    CONSTRAINT fk_adicional_precos_tamanho   FOREIGN KEY (pizzaria_id, tamanho_id)   REFERENCES tamanhos (pizzaria_id, id),
    CONSTRAINT ck_adicional_precos_preco CHECK (preco >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
