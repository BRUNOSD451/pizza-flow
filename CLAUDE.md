# Pizza Flow

SaaS multi-tenant de gestão de pedidos para pizzarias. Cada pizzaria assinante é um **tenant** (`pizzarias`) e tem seus próprios usuários, cardápio, clientes e pedidos. O dono da plataforma (admin supremo) administra todos os tenants.

Idioma: converse e escreva commits, comentários de SQL e textos de interface em **português**. Nomes de tabelas e colunas são em português (`pedidos`, `criado_em`); nomes de arquivos do backend seguem o padrão existente (`user_controller.ts`).

## Produtos (frentes do sistema)

| Frente | Quem usa | O que faz |
|---|---|---|
| **App / Web de gestão** | dono, gerente, atendente | Lança pedidos de balcão/WhatsApp, aceita pedidos do site, gerencia cardápio, equipe, mesas, áreas de entrega, horários, relatórios |
| **App do garçom** | garçom | Abre comanda na mesa, lança pedidos (`origem = 'salao'`, `tipo = 'local'`), fecha a conta e divide pagamento |
| **Painel da cozinha (KDS)** | cozinha | Fila de pedidos em tempo real; move `recebido → preparando → pronto` |
| **App do entregador** | entregador | Vê pedidos `pronto` atribuídos a ele, marca `saiu_para_entrega` e `finalizado`, recebe pagamento na entrega |
| **Site do cliente** | cliente final (sem login de equipe) | Cardápio público da pizzaria (por `slug`), monta pizza, faz pedido `origem = 'site'` que entra como `aguardando_aceite` |
| **Cadastro de pizzaria** | dono (público) | `POST /auth/cadastro`: cria usuário + pizzaria + membro `dono` numa transação e já devolve o token. Pizzaria nasce ativa |
| **Painel admin da plataforma** | admin supremo | Ativa/desativa pizzarias, vê todos os tenants, suporte (pizzarias só nascem pelo cadastro público) |

## Tipos de usuário e permissões

Papéis ficam em `membros.papel`. **Cada usuário pertence a uma única pizzaria** (`UNIQUE (usuario_id)` em `membros`); quem trabalha em duas pizzarias precisa de dois emails. Uma pizzaria tem vários membros.

| Papel | Permissões principais |
|---|---|
| `dono` | Tudo dentro da sua pizzaria, inclusive equipe, configurações da loja e dados financeiros |
| `gerente` | Operação completa: cardápio, pedidos, cancelamentos, equipe (exceto mexer em `dono`), relatórios |
| `atendente` | Cria e acompanha pedidos de balcão/WhatsApp, aceita pedidos do site, cadastra clientes, registra pagamentos |
| `garcom` | Mesas, comandas e pedidos do salão; só vê as próprias comandas abertas e as da sua pizzaria |
| `cozinha` | Só lê pedidos e altera status de preparo (`preparando`, `pronto`); não vê valores financeiros |
| `entregador` | Só vê pedidos de delivery atribuídos a ele (`pedidos.entregador_id`); altera para `saiu_para_entrega` e `finalizado` |

**Admin supremo** (dono da plataforma): acesso global a todos os tenants, fora do sistema de `membros`.
É a coluna `usuarios.admin_plataforma` (migration 005). Só é ligada pelo script `npm run seed:admin`; **nenhuma rota da API pode alterar essa flag**. A checagem é sempre no backend.

Regras de autorização:
- Toda rota autenticada resolve `usuario_id` → seu único `membros` ativo → `pizzaria_id` e papel. Usuário sem membro ativo não acessa nenhuma pizzaria.
- A autorização é sempre no backend; o front só esconde botões.
- Clientes do site **não** são `usuarios`: ficam em `clientes`, identificados por telefone (só dígitos, com DDD) dentro da pizzaria.

## Stack

- **Backend**: Node + TypeScript + Express 5 + `mysql2/promise` (SQL puro, sem ORM). Roda com `tsx`.
- **Banco**: MySQL 8.4 hospedado na **Aiven** (SSL obrigatório).
- **Frontend**: Expo (SDK 58) / React Native, com saída mobile e web. Leia [frontend/AGENTS.md](frontend/AGENTS.md) antes de mexer no front; ele obriga consultar a doc versionada do Expo.

## Estrutura

```
.env                      # na RAIZ (carregado por backend/config/load_env.ts)
certs/ca.pem              # certificado CA da Aiven (fora do git)
backend/
  server.ts               # bootstrap do Express (CORS, rotas, 404, erros)
  config/load_env.ts      # só carrega o .env (usado também por migrate/seed)
  config/env.ts           # variáveis da API validadas (JWT_SECRET obrigatório)
  errors/app_error.ts     # erro de negócio com status HTTP
  middlewares/            # autenticar (preenche req.auth), permissoes, error_handler, rate_limit
  utils/                  # jwt (gerar/verificar token), senha (hash bcrypt)
  db/config.ts            # opções de conexão (SSL)
  db/db.ts                # pool de conexões
  db/migrate.ts           # runner de migrations
  db/migrations/NNN_*.sql
  routers/ → controllers/ → services/ → repositories/
frontend/                 # app Expo
```

Camadas do backend:
- **routers**: só define rotas e middlewares (auth, papel).
- **controllers**: lê/valida request, chama service, monta response HTTP.
- **services**: regra de negócio e transações.
- **repositories**: único lugar com SQL. Sempre queries parametrizadas (`?`), nunca concatenar valores. Todo método aceita `conn: Executor = db` por último, para participar de transações.

Padrões:
- **Rotas protegidas**: `autenticar` → `exigirPapel("dono", "gerente")` ou `exigirAdminPlataforma`. O `pizzariaId` vem de `req.auth`, nunca do body.
- **Transações**: `withTransaction(async (conn) => { ... })` de `db/db.ts`; passe `conn` a todos os repositories envolvidos. Faça trabalho lento (bcrypt, chamadas externas) antes de abrir a transação.
- **Erros**: `throw new AppError(mensagem, status, CODIGO)` no service; o `error_handler` formata. `ER_DUP_ENTRY` vira 409 com mensagem amigável no service.
- **Rotas do admin** (quando existirem) ficam sob `/admin/*` com `autenticar` + `exigirAdminPlataforma` aplicados no router.

## Comandos

```bash
cd backend
npm run dev                      # servidor em watch (porta PORT, padrão 3333)
npm run migrate                  # aplica migrations pendentes
npm run migrate:create <nome>    # cria db/migrations/NNN_<nome>.sql
npm run seed:admin               # cria ou promove o admin da plataforma
npx tsc --noEmit                 # typecheck
```

## Banco de dados

### Regras obrigatórias
- **Nunca edite uma migration já aplicada** (001–005 já rodaram na Aiven). Toda mudança de schema é uma nova migration.
- Toda tabela precisa de `PRIMARY KEY` (a Aiven exige `sql_require_primary_key`).
- IDs são `CHAR(36)` com `DEFAULT (UUID())`.
- Datas em **UTC** (`timezone: "Z"` e `SET time_zone = '+00:00'` na conexão). Converta para `pizzarias.fuso_horario` só na exibição e em regras de horário.
- Dinheiro é `DECIMAL(10,2)`. No JS, não faça conta de dinheiro com float solto; arredonde para centavos.
- O banco da Aiven é compartilhado/real: não rode `DROP`, `TRUNCATE` ou `DELETE` em massa sem pedir confirmação.

### Multi-tenant
- Quase toda tabela tem `pizzaria_id`. **Toda query filtra por `pizzaria_id`** vindo do contexto autenticado (ou do `slug` no site), nunca do body.
- As FKs são compostas `(pizzaria_id, x_id) → tabela(pizzaria_id, id)` (cada tabela tem `UNIQUE (pizzaria_id, id)`), o que impede ligar registros de pizzarias diferentes. Novas tabelas devem seguir esse padrão.
- Exceções globais: `usuarios`, `webhook_eventos`.

### Modelo (resumo)
- **Acesso**: `pizzarias` (tenant, config da loja: `slug`, `regra_preco_pizza`, `taxa_entrega_padrao`, `pedido_minimo`, `aceitando_pedidos`, `logo_url`, `cor_primaria`), `usuarios` (login), `membros` (liga o usuário à sua única pizzaria, com o papel).
- **Loja**: `horarios_funcionamento` (`dia_semana` 0=domingo; `fecha <= abre` = fecha no dia seguinte), `areas_entrega` (taxa e tempo por bairro).
- **Cardápio**: `categorias` (`tipo` pizza|produto), `tamanhos` (`fatias`, `max_sabores`), `sabores` + `sabor_precos` (preço por tamanho), `bordas` + `borda_precos`, `adicionais` (`preco` padrão) + `adicional_precos` (por tamanho), `produtos` (bebidas, sobremesas…).
- **Clientes**: `clientes` (único por telefone na pizzaria), `enderecos` (no máximo um `principal` por cliente, via coluna gerada).
- **Salão**: `mesas`, `comandas` (no máximo uma `aberta` por mesa; agrupa vários pedidos; tem `taxa_servico`).
- **Pedidos**: `pedidos`, `pedido_itens` (`tipo` pizza|produto), `pedido_item_sabores` (frações), `pedido_item_adicionais`, `pagamentos` (de um pedido **ou** de uma comanda), `pedido_eventos` (histórico de status).
- **Integrações**: `webhook_eventos` (idempotência de webhooks: Pix, iFood, cobrança do SaaS).

### Regras de negócio dos pedidos
- **Número do pedido**: na mesma transação, `SELECT ultimo_numero_pedido ... FOR UPDATE` em `pizzarias`, incrementa e grava em `pedidos.numero`.
- **Idempotência**: o front gera `chave_idempotencia` por tentativa de finalizar; se já existir para a pizzaria, devolva o pedido existente em vez de criar outro.
- **Origem × criador**: `criado_por` (membro) só pode ser NULL quando `origem IN ('site','ifood')`. Pedido com `comanda_id` é sempre `tipo='local'` e `origem='salao'`.
- **Delivery** exige `endereco_entrega` (JSON, cópia do endereço no momento do pedido) e usa a taxa de `areas_entrega`.
- **Snapshot de preços/nomes**: itens guardam `descricao`, `preco_unitario`, `nome_sabor`, `preco_referencia`, `nome` do adicional. Mudanças no cardápio não alteram pedidos antigos. O preço é **sempre recalculado no backend**; nunca confie no valor enviado pelo front.
- **Pizza meio a meio**: soma de `pedido_item_sabores.partes` = `pedido_itens.total_partes` ≤ `tamanhos.max_sabores` (validado na aplicação). Preço segue `pizzarias.regra_preco_pizza`: `maior` (sabor mais caro) ou `media` (média proporcional às partes). Somar borda e adicionais do tamanho.
- **Total**: `total = subtotal - desconto + taxa_entrega`; respeitar `pedido_minimo` no site.
- **Pedidos do site** só são aceitos se `aceitando_pedidos = TRUE` e dentro de `horarios_funcionamento`.

### Fluxo de status
```
aguardando_aceite → recebido → preparando → pronto ─┬→ saiu_para_entrega → finalizado   (delivery)
                                                     └→ finalizado                        (retirada / local)
qualquer status não final → cancelado (exige motivo_cancelamento)
```
- Pedidos internos (balcão, salão) já nascem em `recebido`; os do site/iFood nascem em `aguardando_aceite`.
- Cada transição: atualiza o timestamp correspondente (`aceito_em`, `preparo_em`, `pronto_em`, `saiu_em`, `finalizado_em`, `cancelado_em`) **e** insere em `pedido_eventos` (com `membro_id`, NULL quando automático/site), tudo na mesma transação.
- Valide a transição no service e também se o papel pode fazê-la (ex.: cozinha não finaliza delivery).

## Pendências conhecidas no modelo
- Assinatura do SaaS (planos, cobrança por pizzaria): ainda não há tabelas.
- Login do cliente do site: hoje o cliente é identificado só pelo telefone.
- Rastreio do entregador (localização) e tempo real (WebSocket/SSE) para o KDS e o app do entregador: ainda não definidos.

Antes de implementar qualquer um desses pontos, proponha a migration e confirme com o usuário.
