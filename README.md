# OASIS SOLAR

Sistema web de gestão de usinas solares fotovoltaicas. Especificação funcional completa em
`docs/` (fonte: `Especificacao_Sistema_Gestao_Usinas_Solares.pdf`, v1.4).

## Stack

- **Backend:** Node.js + Express + TypeScript, Prisma ORM.
- **Banco de dados:** SQLite em desenvolvimento local (sem Postgres/Docker instalados na máquina
  de desenvolvimento); PostgreSQL em produção (VPS Hostinger). Ver `docs/DECISOES_PLACEHOLDER.md`.
- **Frontend:** React + Vite + TypeScript + Tailwind CSS, identidade visual OASIS SOLAR (paleta e
  tipografia Poppins conforme a especificação).
- **Autenticação:** JWT + bcrypt, permissões por usuário × usina × módulo × ação, validadas
  sempre no servidor.

## Estrutura

```
apps/
  api/   # backend Express + Prisma
  web/   # frontend React + Vite
docs/
  DECISOES_PLACEHOLDER.md   # decisões tomadas para pontos "a definir" da especificação
```

## Deploy

Passo a passo para publicar num VPS da Hostinger (nginx + PM2 + HTTPS): `docs/DEPLOY_HOSTINGER.md`.

## Como rodar em desenvolvimento

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run seed
npm run dev:api    # http://localhost:3333
npm run dev:web    # http://localhost:5173
```

O seed cria um usuário administrador (`admin@oasissolar.local` / `OasisSolar@2026` por padrão,
configurável via `SEED_ADMIN_EMAIL`/`SEED_ADMIN_SENHA`). Troque a senha após o primeiro acesso.

### Nota (Windows): antivírus e o binário nativo do Rollup

Em algumas máquinas Windows, o Windows Defender (ou outro antivírus) trata o binário nativo do
Rollup (`@rollup/rollup-win32-x64-msvc`) como falso positivo e o bloqueia/apaga silenciosamente,
quebrando `vite`/`npm run dev:web`. A raiz do projeto já contém um `overrides` no `package.json`
que troca o Rollup nativo pela build WASM (`@rollup/wasm-node`), evitando o binário nativo sem
mexer em configurações de antivírus. Se precisar reinstalar do zero, basta `npm install` de novo —
o override é aplicado automaticamente.

## Plano de fases

1. **Fundação** (concluída): autenticação, permissões, auditoria, layout base com identidade
   visual, cadastro básico de usinas, painel com listagem de usinas autorizadas.
2. **Cadastro de Usinas completo** (concluída): "Configurações da usina" com as 5 seções
   expansíveis — Identificação (com upload de foto), Dados nominais (quantidades + tabela de
   inversores + conferência de potência), Degradação esperada (curva linear versionada), SKIDs e
   Inversores (vínculo com histórico de vigência) e Metas mensais (matriz de 12 indicadores por
   ano, versionada, com FC calculado automaticamente, exportação/importação em Excel e prévia
   antes de confirmar).
3. **Lançamento de Dados + indicadores do Painel Principal** (concluída): lançamento manual de
   geração/irradiação por usina/SKID/competência, fechamento de competência (parcial/fechado),
   Painel Principal com geração realizada/prevista, PR, IPE e rendimento específico calculados a
   partir de dados reais (agregação sempre por soma de numeradores/denominadores, nunca média de
   percentuais; PR pareado dia a dia entre geração e irradiação). 14 usinas reais e ~28 mil
   lançamentos diários importados de planilhas do cliente — ver `docs/DECISOES_PLACEHOLDER.md`.
4. **Abas do Dashboard individual** (concluída): Geração de Energia Bruta (KPIs P50/P90,
   indicadores circulares de aderência, gráfico combinado energia+irradiação, tabela diária por
   SKID), Irradiação, Performance Ratio (PR simples, pareado dia a dia entre geração e irradiação,
   PR esperado ponderado por energia teórica, faixas de cor por SKID), Fator de Capacidade (base
   AC/DC explícita, meta e aderência), Disponibilidade (geração/comunicação, MTTR, MTBF — calculada
   a partir de eventos operacionais desde a Fase 6). Filtro de intervalo de datas e "Reprocessar"
   compartilhados entre as abas da mesma usina.
5. **Comparativo e Ranking de Ativos** (concluída): Comparativo com seleção de usinas e gráficos
   lado a lado (geração realizada/prevista, PR, IPE, rendimento específico) e Ranking de Ativos
   ordenável por indicador, com usinas sem dado no período destacadas à parte (nunca como pior
   colocação). Ambas reaproveitam os indicadores já calculados no Painel Principal, sob o mesmo
   filtro de período global — ver `docs/DECISOES_PLACEHOLDER.md`.
6. **Manutenção e Estoque** (concluída): eventos operacionais (paradas de geração/comunicação) que
   alimentam Disponibilidade/MTTR/MTBF na aba correspondente do Dashboard individual (antes um
   stub); Ordens de Serviço com quadro Kanban (por status) e Calendário (por data prevista);
   Planos preventivos com geração de OS e avanço automático da recorrência; Estoque com catálogo
   global de itens, saldo e custo médio ponderado por usina, movimentações de entrada/saída
   (reconhecimento de custo no consumo) e ajuste de inventário (permissão própria, motivo
   obrigatório) — ver `docs/DECISOES_PLACEHOLDER.md`.
7. **Financeiro** (concluída): custo de O&M por usina somando consumo de estoque (custo reconhecido
   no consumo, nunca na compra) e lançamentos manuais por categoria (mão de obra, serviço
   terceirizado, peças avulsas, outros); KPIs de custo total e custo por kWp instalado (sempre
   potência DC), tendência mensal e detalhamento por categoria — tela dirigida pelo filtro "Usina
   ativa" e pelo período global, mesmo padrão de Lançamento de Dados e Manutenção. Ajuste no mesmo
   período: o Painel Principal (item 3) passou a mostrar as 5 abas do Dashboard individual (item 4)
   da usina selecionada no filtro "Usina ativa", em vez de uma tabela consolidada de todas as
   usinas — essa visão consolidada continua disponível em Comparativo (item 5) — ver
   `docs/DECISOES_PLACEHOLDER.md`.
8. **Relatórios** (concluída): Relatório de Desempenho (Geração, PR, FC, Disponibilidade,
   Financeiro) em PDF, Excel ou CSV, gerado a partir de uma "fotografia" dos dados no momento da
   emissão — reabrir ou rebaixar (inclusive noutro formato) um relatório antigo sempre reproduz o
   mesmo conteúdo, mesmo que lançamentos tenham mudado depois. Histórico de emissões nunca é
   apagado automaticamente. Identidade só com a escrita "OASIS SOLAR" (sem logotipo aprovado ainda)
   — ver `docs/DECISOES_PLACEHOLDER.md`.
9. **Notificações, Histórico e Usuários — evolução** (concluída): painel de alertas calculados ao
   vivo (estoque abaixo do mínimo, OS vencida, preventiva vencida, parada prolongada há mais de
   24h); histórico de auditoria com filtros (usina, módulo, ação, período) e paginação; correção de
   um bug de segurança real (`?modulo=usuarios` contornava a restrição administrativa do histórico
   para usuários comuns); em Usuários e Acessos, edição de dados do usuário, reativação e exibição
   de "Último acesso" — ver `docs/DECISOES_PLACEHOLDER.md`.
10. Deploy no VPS Hostinger com HTTPS, backups e checagem dos cenários de aceite funcional.
10. Deploy no VPS Hostinger com HTTPS, backups e checagem dos cenários de aceite funcional.

Decisões tomadas como placeholder para destravar o desenvolvimento (metodologia de PR, critério
de custo de estoque, reconhecimento de O&M, etc.) estão documentadas e justificadas em
`docs/DECISOES_PLACEHOLDER.md` — revisar com o cliente antes de qualquer declaração de
conformidade metodológica.
