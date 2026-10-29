-- Pizza Flow - site do cliente, salão (garçom) e cardápio
-- 1. Pedidos sem membro (site/ifood) + origem do pedido
-- 2. Papel garçom, mesas e comandas
-- 3. Status aguardando_aceite
-- 4. Dados da loja para o site (horários, áreas de entrega, pedido mínimo, visual)
-- 5. Categorias do cardápio e imagens

SET NAMES utf8mb4;

-- =====================================================================
-- 4. Dados da loja
-- =====================================================================

ALTER TABLE pizzarias
    ADD COLUMN aceitando_pedidos  BOOLEAN       NOT NULL DEFAULT TRUE AFTER taxa_entrega_padrao,
    ADD COLUMN pedido_minimo      DECIMAL(10,2) NOT NULL DEFAULT 0    AFTER aceitando_pedidos,
    ADD COLUMN logo_url           VARCHAR(500)  NULL                  AFTER telefone,
    ADD COLUMN cor_primaria       CHAR(7)       NULL                  AFTER logo_url,
    ADD CONSTRAINT ck_pizzarias_pedido_minimo CHECK (pedido_minimo >= 0),
    ADD CONSTRAINT ck_pizzarias_cor CHECK (cor_primaria IS NULL OR cor_primaria REGEXP '^#[0-9A-Fa-f]{6}$');

-- dia_semana: 0 = domingo ... 6 = sábado
-- fecha <= abre significa que fecha no dia seguinte (ex.: 18:00 -> 00:30)
CREATE TABLE horarios_funcionamento (
    id           CHAR(36) NOT NULL DEFAULT (UUID()),
    pizzaria_id  CHAR(36) NOT NULL,
    dia_semana   TINYINT  NOT NULL,
    abre         TIME     NOT NULL,
    fecha        TIME     NOT NULL,
    PRIMARY KEY (id),
    KEY ix_horarios_pizzaria_dia (pizzaria_id, dia_semana),
    CONSTRAINT fk_horarios_pizzaria FOREIGN KEY (pizzaria_id) REFERENCES pizzarias (id),
    CONSTRAINT ck_horarios_dia CHECK (dia_semana BETWEEN 0 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE areas_entrega (
    id                   CHAR(36)      NOT NULL DEFAULT (UUID()),
    pizzaria_id          CHAR(36)      NOT NULL,
    bairro               VARCHAR(100)  NOT NULL,
    cidade               VARCHAR(100)  NOT NULL,
    taxa                 DECIMAL(10,2) NOT NULL,
    tempo_estimado_min   INT           NULL,
    ativo                BOOLEAN       NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_areas_entrega_bairro (pizzaria_id, cidade, bairro),
    CONSTRAINT fk_areas_entrega_pizzaria FOREIGN KEY (pizzaria_id) REFERENCES pizzarias (id),
    CONSTRAINT ck_areas_entrega_taxa  CHECK (taxa >= 0),
    CONSTRAINT ck_areas_entrega_tempo CHECK (tempo_estimado_min IS NULL OR tempo_estimado_min > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 5. Categorias do cardápio e imagens
-- =====================================================================

CREATE TABLE categorias (
    id           CHAR(36)     NOT NULL DEFAULT (UUID()),
    pizzaria_id  CHAR(36)     NOT NULL,
    nome         VARCHAR(100) NOT NULL,
    tipo         VARCHAR(10)  NOT NULL,
    ordem        INT          NOT NULL DEFAULT 0,
    ativo        BOOLEAN      NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_categorias_tenant (pizzaria_id, id),
    UNIQUE KEY uq_categorias_nome (pizzaria_id, tipo, nome),
    CONSTRAINT fk_categorias_pizzaria FOREIGN KEY (pizzaria_id) REFERENCES pizzarias (id),
    CONSTRAINT ck_categorias_tipo CHECK (tipo IN ('pizza', 'produto'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE sabores
    ADD COLUMN categoria_id  CHAR(36)     NULL AFTER pizzaria_id,
    ADD COLUMN imagem_url    VARCHAR(500) NULL AFTER descricao,
    ADD CONSTRAINT fk_sabores_categoria FOREIGN KEY (pizzaria_id, categoria_id) REFERENCES categorias (pizzaria_id, id);

ALTER TABLE produtos
    ADD COLUMN categoria_id  CHAR(36)     NULL AFTER pizzaria_id,
    ADD COLUMN descricao     TEXT         NULL AFTER nome,
    ADD COLUMN imagem_url    VARCHAR(500) NULL AFTER descricao,
    ADD CONSTRAINT fk_produtos_categoria FOREIGN KEY (pizzaria_id, categoria_id) REFERENCES categorias (pizzaria_id, id);

-- Converte a categoria fixa antiga (bebida/sobremesa/outro) em registros de categorias
INSERT INTO categorias (pizzaria_id, nome, tipo)
SELECT DISTINCT pizzaria_id,
       CASE categoria WHEN 'bebida' THEN 'Bebidas' WHEN 'sobremesa' THEN 'Sobremesas' ELSE 'Outros' END,
       'produto'
FROM produtos;

UPDATE produtos p
JOIN categorias c
  ON c.pizzaria_id = p.pizzaria_id
 AND c.tipo = 'produto'
 AND c.nome = CASE p.categoria WHEN 'bebida' THEN 'Bebidas' WHEN 'sobremesa' THEN 'Sobremesas' ELSE 'Outros' END
SET p.categoria_id = c.id;

ALTER TABLE produtos
    DROP CHECK ck_produtos_categoria,
    DROP COLUMN categoria;

-- =====================================================================
-- 2. Garçom, mesas e comandas
-- =====================================================================

ALTER TABLE membros
    DROP CHECK ck_membros_papel,
    ADD CONSTRAINT ck_membros_papel CHECK (papel IN ('dono', 'gerente', 'atendente', 'garcom', 'cozinha', 'entregador'));

CREATE TABLE mesas (
    id           CHAR(36)    NOT NULL DEFAULT (UUID()),
    pizzaria_id  CHAR(36)    NOT NULL,
    nome         VARCHAR(20) NOT NULL,
    lugares      INT         NULL,
    ativo        BOOLEAN     NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_mesas_tenant (pizzaria_id, id),
    UNIQUE KEY uq_mesas_nome (pizzaria_id, nome),
    CONSTRAINT fk_mesas_pizzaria FOREIGN KEY (pizzaria_id) REFERENCES pizzarias (id),
    CONSTRAINT ck_mesas_lugares CHECK (lugares IS NULL OR lugares > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Uma comanda agrupa vários pedidos da mesma mesa até a conta ser fechada
CREATE TABLE comandas (
    id               CHAR(36)      NOT NULL DEFAULT (UUID()),
    pizzaria_id      CHAR(36)      NOT NULL,
    mesa_id          CHAR(36)      NOT NULL,
    garcom_id        CHAR(36)      NOT NULL,
    status           VARCHAR(10)   NOT NULL DEFAULT 'aberta',
    pessoas          INT           NULL,
    taxa_servico     DECIMAL(10,2) NOT NULL DEFAULT 0,
    aberta_em        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fechada_em       DATETIME      NULL,
    mesa_aberta_id   CHAR(36) GENERATED ALWAYS AS (IF(status = 'aberta', mesa_id, NULL)) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_comandas_tenant (pizzaria_id, id),
    UNIQUE KEY uq_comandas_mesa_aberta (mesa_aberta_id),
    CONSTRAINT fk_comandas_mesa   FOREIGN KEY (pizzaria_id, mesa_id)   REFERENCES mesas (pizzaria_id, id),
    CONSTRAINT fk_comandas_garcom FOREIGN KEY (pizzaria_id, garcom_id) REFERENCES membros (pizzaria_id, id),
    CONSTRAINT ck_comandas_status  CHECK (status IN ('aberta', 'fechada', 'cancelada')),
    CONSTRAINT ck_comandas_pessoas CHECK (pessoas IS NULL OR pessoas > 0),
    CONSTRAINT ck_comandas_taxa    CHECK (taxa_servico >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 1 e 3. Pedidos: origem, criado_por opcional, comanda, aguardando_aceite
-- =====================================================================

ALTER TABLE pedidos
    DROP CHECK ck_pedidos_status,
    DROP COLUMN mesa,
    MODIFY COLUMN criado_por CHAR(36) NULL,
    MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'recebido',
    ADD COLUMN origem      VARCHAR(10) NOT NULL DEFAULT 'balcao' AFTER tipo,
    ADD COLUMN comanda_id  CHAR(36)    NULL AFTER entregador_id,
    ADD COLUMN aceito_em   DATETIME    NULL AFTER criado_em,
    ADD CONSTRAINT fk_pedidos_comanda FOREIGN KEY (pizzaria_id, comanda_id) REFERENCES comandas (pizzaria_id, id),
    ADD CONSTRAINT ck_pedidos_status CHECK (status IN ('aguardando_aceite', 'recebido', 'preparando', 'pronto', 'saiu_para_entrega', 'finalizado', 'cancelado')),
    ADD CONSTRAINT ck_pedidos_origem CHECK (origem IN ('balcao', 'salao', 'site', 'whatsapp', 'ifood')),
    -- Só pedidos que chegam sozinhos (site/ifood) podem não ter membro que criou
    ADD CONSTRAINT ck_pedidos_criado_por CHECK (criado_por IS NOT NULL OR origem IN ('site', 'ifood')),
    -- Pedido de comanda é sempre consumo no local
    ADD CONSTRAINT ck_pedidos_comanda CHECK (comanda_id IS NULL OR (tipo = 'local' AND origem = 'salao'));

-- Eventos do pedido do site (ex.: criação) não têm membro
ALTER TABLE pedido_eventos
    DROP CHECK ck_pedido_eventos_status_anterior,
    DROP CHECK ck_pedido_eventos_status_novo,
    MODIFY COLUMN membro_id CHAR(36) NULL,
    ADD CONSTRAINT ck_pedido_eventos_status_anterior CHECK (status_anterior IS NULL OR status_anterior IN ('aguardando_aceite', 'recebido', 'preparando', 'pronto', 'saiu_para_entrega', 'finalizado', 'cancelado')),
    ADD CONSTRAINT ck_pedido_eventos_status_novo     CHECK (status_novo IN ('aguardando_aceite', 'recebido', 'preparando', 'pronto', 'saiu_para_entrega', 'finalizado', 'cancelado'));

-- Conta da mesa pode ser paga na comanda (e dividida em vários pagamentos)
ALTER TABLE pagamentos
    MODIFY COLUMN pedido_id CHAR(36) NULL,
    ADD COLUMN comanda_id CHAR(36) NULL AFTER pedido_id,
    ADD CONSTRAINT fk_pagamentos_comanda FOREIGN KEY (pizzaria_id, comanda_id) REFERENCES comandas (pizzaria_id, id),
    ADD CONSTRAINT ck_pagamentos_alvo CHECK ((pedido_id IS NULL) <> (comanda_id IS NULL));
