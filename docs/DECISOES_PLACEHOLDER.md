# Decisões tomadas como placeholder

A especificação (`Especificacao_Sistema_Gestao_Usinas_Solares.pdf`, v1.4, seção final "Decisões
pendentes e validação") deixa vários pontos como "a definir" para não travar o desenvolvimento.
Este documento registra a decisão simples e configurável adotada em cada ponto, para revisão
posterior com o cliente. Nenhuma dessas decisões deve ser lida como requisito definitivo.

## Hospedagem
- **Decisão:** VPS Hostinger, confirmado pelo usuário em 2026-09-17.
- **Stack:** Node.js/Express + TypeScript no backend, PostgreSQL, React + Vite no frontend.
- **Banco local de desenvolvimento:** SQLite via Prisma (sem Docker/Postgres instalados nesta
  máquina). O schema evita recursos exclusivos do Postgres (ex.: enums nativos são modelados como
  `String` com validação na aplicação) para que a troca do `provider` no `schema.prisma` para
  `postgresql` antes do deploy exija o mínimo de ajuste.
- **Histórico de migrações do SQLite:** por causa de correções feitas em modo não interativo
  (`prisma db push`, já que `migrate dev` exige confirmação interativa indisponível neste ambiente),
  o histórico em `prisma/migrations/` tem uma pequena inconsistência que impede o replay limpo em
  shadow database a partir da migração `fase3_inversor_unico_por_skid`. Sem impacto no
  desenvolvimento atual (schema e dados em `dev.db` estão corretos). **Antes do deploy em
  produção**, gerar uma migração inicial limpa (`prisma migrate diff` a partir do schema atual)
  contra o Postgres do zero, em vez de tentar reaproveitar este histórico do SQLite.

## Atualização dos dados mensais por SKID a partir de 3 planilhas novas (2026-09-18)
- **Decisão:** script único `apps/api/prisma/importar_geracao_irradiacao_pr_mensal.ts`
  (idempotente — pode ser reexecutado, sempre cria uma nova versão), executado em 2026-09-18,
  atualizou as 14 usinas a partir de 3 planilhas fornecidas pelo cliente (`Dados de
  Geração_Mensal.xlsx`, `Irradiação Mensal.xlsx`, `PR Peformace Ratio.xlsx`) — mesma estrutura nas
  três: usina + SKID (ou "-" para usinas sem subdivisão) + 12 meses.
- Nomes de usina e de SKID bateram exatamente com o cadastro já existente, sem precisar de mapa de
  alias (diferente da importação inicial, Fase 3, que precisou de `ALIAS_GERACAO_PARA_CANONICO`).
- Para usinas com SKID: gravou uma nova versão de `PrevisaoMensalSkid` por SKID (primeira vez que
  essa tabela recebe dados reais — antes só tinha registros de teste da sessão de desenvolvimento,
  já removidos) e recalculou `PrevisaoMensal` da usina a partir delas, mesma fórmula ponderada por
  potência já usada na tela "Dados mensais por SKID" (Cadastro de Usinas). Para usinas sem SKID
  ("-"): gravou direto em `PrevisaoMensal`, usando o PR da planilha diretamente (sem recalcular a
  partir de potência×irradiação, já que não há múltiplos valores para ponderar/combinar).
- **Confirmado por conferência cruzada:** os totais anuais de geração prevista resultantes bateram
  exatamente com os já existentes no sistema (vindos da importação da Fase 3, a partir de "Cadastro
  Usinas.xlsx") para as 14 usinas — evidência de que as 3 planilhas novas são a mesma fonte PVsyst,
  só reorganizada em arquivos separados por indicador, não um recálculo com premissas diferentes.

## Previsão do tempo diária no Painel Principal (fora do plano de fases original)
- **Decisão:** API gratuita **Open-Meteo** (open-meteo.com), sem necessidade de chave/assinatura —
  combina o endpoint de previsão (`api.open-meteo.com`, cobre passado recente + futuro) com o de
  arquivo histórico (`archive-api.open-meteo.com`, reanálise ERA5, cobre períodos mais antigos);
  cada dia do período usa o que estiver disponível, sem inventar quando nenhum dos dois cobre a
  data (ex.: datas futuras muito distantes).
- **Depende da latitude/longitude cadastradas na usina** (seção Identificação → "dados
  complementares", campo que já existia desde a Fase 2 mas não tinha nenhum consumidor até agora).
  Sem essas coordenadas, o painel mostra um aviso explicando como habilitar — nunca aproxima a
  localização a partir do município/UF, que poderia ficar a dezenas de km do ponto real da usina.
- Exibido na aba "Geração de Energia Bruta" do Painel Principal — código de tempo (WMO) da Open-
  Meteo simplificado em 5 categorias: Sol, Nublado, Neblina, Chuva, Tempestade. **Ajuste pós-
  entrega:** por pedido explícito do usuário, saiu de uma faixa própria acima do gráfico e passou a
  ser uma coluna dentro da própria tabela "Energia Ativa Gerada" (um ícone por dia, ao lado da
  data), para comparar geração e clima na mesma linha sem trocar de bloco visual. Ícones desenhados
  em SVG (não emoji, para não depender de fonte/renderização inconsistente entre sistemas) nas
  cores já estabelecidas da paleta OASIS SOLAR; passar o mouse mostra categoria, faixa de
  temperatura e precipitação.
- **Bug real corrigido durante a validação:** a rota de edição de usina só permitia sobrescrever
  latitude/longitude com outro valor numérico, nunca limpar (enviar `null`) — o schema de validação
  usava só `.optional()`, que aceita o campo ausente mas rejeita `null` explícito
  ("Expected number, received null"). Corrigido adicionando `.nullable()` também, permitindo
  desfazer um cadastro de coordenada incorreto pela interface.

## Rodada de melhorias 2026-09-20 (cadastro, lançamentos, OS/estoque, relatório, acessos, layout)
- **UC por SKID:** cada SKID passou a ter sua própria UC editável no card do SKID (Configurações da
  usina → SKIDs e Inversores). A "UC principal" da usina foi removida (formulário, lista e
  schema — a coluna não tinha nenhum dado). O relatório lê a UC de cada SKID.
- **Painel Principal → tabela "Produtividade":** nova tabela na aba Geração de Energia Bruta,
  geração diária por inversor, um SKID por vez. Cor de cada célula = valor ÷ máximo do dia **entre
  os inversores do mesmo SKID**: verde 95–100%, amarelo 90–95%, vermelho < 90%. Alternância entre
  "Dados reais (kWh)" e "% do máx. do dia". Só aparecem dias com lançamento; dia sem dado não vira
  zero. (O "máximo do dia" ser por SKID — e não da usina inteira — foi uma leitura do exemplo
  enviado, que mostra "Produtividade — SKID 1".)
- **Lançamento de Dados:** lista de lançamentos ganhou filtros (período, SKID, inversor) e ações de
  editar/excluir (permissões `lancamentos.editar` e `lancamentos.cancelar`). Toda edição/exclusão
  grava valor anterior/novo na auditoria.
- **Manutenção e Estoque:** OS podem ser editadas e **excluídas de verdade** (antes só canceladas —
  regra antiga removida a pedido). Movimentações de estoque ligadas à OS apenas perdem o vínculo.
  Itens do catálogo podem ser editados e excluídos; se o item já tem movimentação, a exclusão é
  recusada e a interface oferece **desativar** (preserva o histórico de estoque).
- **Comparativo:** botão "Exportar PNG" em cada gráfico (título + gráfico + legenda, fundo branco,
  resolução 2x), gerado no navegador.
- **Relatório de Geração Solar:** reestruturado para o modelo "Relatório UFV Sítio do Pescoço":
  1 Dados da instalação · 2 Resumo operacional (geração/irradiação/PR previstos × realizados,
  variação, chuva acumulada no mês via Open-Meteo) · 3 Geração por SKID (com UC e total) ·
  4 Histórico de manutenção/ocorrências (OS não canceladas + paradas/falhas de comunicação do
  período). Previsto = soma dos meses inteiramente cobertos (mesma regra do Painel); geração
  prevista usa `geracaoPrevistaKwh` (soma dos SKIDs, como no modelo) e o realizado por SKID vem dos
  lançamentos por inversor. Relatórios já emitidos no formato antigo continuam baixáveis como foram
  emitidos (`relatorioLegado.ts`). Ficaram **fora** do relatório novo FC, Disponibilidade e
  Financeiro (não fazem parte da estrutura pedida).
- **Notificações e Histórico:** restrito ao administrador (menu, rota e API, inclusive os alertas)
  e com filtro por usuário.
- **Usuários e Acessos:** cadastro/edição em janela (modal) com nome, e-mail, perfil e uma matriz
  de caixas de seleção (módulo × ação) mais escolha de usinas ("todas", com opção "incluir
  futuras", ou seleção). Marcar uma ação marca "Ver" automaticamente; desmarcar "Ver" limpa o
  módulo. Administrador não usa matriz (acesso total). Limitação: a matriz aplica **o mesmo
  conjunto de usinas a todos os módulos** do usuário; permissões antigas com usinas diferentes por
  módulo são lidas como a união das usinas.
- **Administração (nova, só ADMIN):** backup completo em .zip = cópia íntegra do banco
  (`VACUUM INTO`, seguro com o sistema em uso) + pasta de arquivos enviados + LEIA-ME de
  restauração; registra "último backup" na auditoria. Em produção com PostgreSQL a interface
  informa que o backup do banco deve ser feito com `pg_dump` no servidor. Dependência nova:
  `archiver`.
- **Layout/design:** menu lateral retrátil (recolhe para ícones; preferência guardada), ícones por
  página (lucide-react), modo claro/escuro (guardado, respeita a preferência do sistema na
  primeira visita), menu em gaveta e tabelas com rolagem horizontal em celular/tablet, cartões com
  cantos arredondados e sombra suave. O modo escuro foi feito remapeando as classes claras em
  `index.css` (uma paleta escura na mesma família azul-marinho), não duplicando `dark:` em cada
  tela. **Ressalva:** o arquivo do Figma citado (Analytics Dashboard, comunidade) não pôde ser
  aberto neste ambiente; o layout segue o padrão desse tipo de dashboard (barra lateral, cabeçalho
  com filtros/usuário, cartões arredondados) mantendo as cores da marca — vale comparar lado a lado
  e pedir ajustes pontuais.

## Lançamento de Dados e linhas de previsão nos gráficos (2026-09-18)
- **Lançamento de Dados:** adicionado seletor de "Usina" no próprio formulário (sincronizado com o
  filtro global "Usina ativa" da barra superior — mesmo padrão já usado em Configurações da usina,
  não um estado paralelo). Adicionado campo "Inversor" (opcional), populado pelos inversores do
  SKID selecionado (ou pelos inversores ainda não atribuídos a nenhum SKID, quando "Usina inteira"
  está selecionado) — enviado junto com `skidId` no lançamento de geração. Removido o campo
  "Origem" do formulário (segue existindo no schema/backend, usado pelos scripts de importação em
  massa para marcar proveniência; só deixou de ser pedido no lançamento manual).
- **Irradiação do dia mantida automaticamente:** ao trocar a data no formulário, o campo
  "Irradiação realizada" é pré-preenchido com o valor já lançado para aquele dia (nível "geral" da
  usina), se existir — evita que lançar a geração de vários inversores no mesmo dia sobrescreva a
  irradiação do dia com valores diferentes a cada envio.
- **Linhas de previsão nos gráficos diários do Painel Principal:** os 3 gráficos (Geração de
  Energia Bruta e irradiação / Irradiação Diária Realizada / Performance Ratio Diário) ganharam uma
  linha tracejada de referência com a previsão do mês — geração e irradiação são a meta mensal
  dividida pelos dias do mês (`geracaoP50Kwh`/`irradiacaoPrevistaKwhM2` ÷ dias do mês), PR é o
  mesmo `prPrevistoPct` do mês repetido em cada dia (já é uma razão, não soma-se). Só para meses
  inteiramente cobertos pelo período consultado — mês parcial fica sem linha, nunca extrapolado.
  Para viabilizar uma linha contínua mesmo em dias sem lançamento ainda, os 3 endpoints passaram a
  percorrer todos os dias do intervalo (antes só listavam dias com lançamento existente); os
  valores realizados desses dias sem lançamento vêm `null`, nunca 0.
- **Disponibilidade "não atualiza" — investigado, sem bug de cálculo confirmado:** testado ao vivo
  (registrar um evento operacional de teste em Painel Principal → Disponibilidade → "+ Registrar
  evento") e a % de disponibilidade, MTTR e MTBF atualizaram corretamente. Não havia nenhum
  `EventoOperacional` cadastrado em nenhuma usina antes desse teste. Hipótese mais provável do
  relato do usuário: Disponibilidade só é calculada a partir de "Eventos operacionais" (o formulário
  dentro da própria aba Disponibilidade) — uma parada registrada via Ordens de Serviço (Manutenção
  e Estoque) não alimenta esse cálculo, são dois modelos de dados hoje desconectados
  (`OrdemServico` × `EventoOperacional`). Perguntado ao usuário onde os dados foram lançados; sem
  resposta conclusiva ainda — fica como ponto em aberto para confirmar antes de qualquer mudança
  (ex.: linkar OS a um evento operacional automaticamente).

## Correções de escala e agregação — Geração/Irradiação/PR previstos (2026-09-18)
- **Bug 1 — perda de dado ao salvar "Metas mensais":** `salvarNovaVersao` (previsoes.routes.ts)
  gravava a grade inteira usando só o que a tela de Metas mensais envia, sem preservar
  `geracaoPrevistaKwh`/`irradiacaoPrevistaKwhM2`/`prPrevistoPct` — campos alimentados por "Dados
  mensais por SKID", não por essa tela. Qualquer "Salvar" em Metas mensais zerava os 3 campos.
  Só a UFV Central foi afetada (única usina com Metas mensais preenchida). Corrigido preservando-os
  da versão ativa anterior quando a grade não os envia; dados recuperados recalculando a partir de
  "Dados mensais por SKID" (nova versão, nada sobrescrito).
- **Bug 2 — PR esperado dissociado do PR Mensal informado:** o Painel Principal (aba PR) calculava
  "PR esperado" numa fórmula própria (`geracaoPrevistaKwh` ÷ energia teórica) dentro de
  `pr.routes.ts`, ignorando por completo o `prPrevistoPct` já calculado a partir do PR Mensal por
  SKID — duas contas paralelas para o mesmo conceito, que podiam divergir. Corrigido para usar
  `prPrevistoPct` diretamente (ponderado pela geração prevista de cada mês quando o período cobre
  mais de um mês) — agora "PR esperado" bate exatamente com "Performance Ratio Mensal (PR)" de
  "Dados mensais por SKID" quando há um único mês/SKID uniforme.
- **Bug 3 (achado antes, mesma causa raiz) — P50/P90 mensal em escala errada:** ver decisão
  "Configuração da usina" mais abaixo — os únicos valores de Geração prevista P50/P90 cadastrados
  (UFV Central) estavam em MWh gravados como se fossem kWh; corrigido ×1000, gravado como nova
  versão.

## Ajustes de escopo — estoque, cadastro de usinas e Painel Principal (2026-09-18)
- **Imagem do material em estoque:** `ItemCatalogo` ganhou `imagemUrl`, com upload/substituição/
  remoção por item (mesmo padrão de `lib/upload.ts` já usado na foto da usina — valida assinatura
  binária real do arquivo, não só o `Content-Type`). Exibida como miniatura na tabela de estoque
  (Manutenção e Estoque → aba Estoque).
- **Campos removidos de "Configurações da usina"** (pedido explícito do usuário, por não serem
  usados em nenhum cálculo/indicador do sistema — confirmado antes de remover): em Identificação,
  "Data de instalação", "Origem da geração", "Ponto de medição" e "Origem da irradiação"; em Metas
  mensais, GHI P50/P90, POA P50/P90, PR P50/P90 e FC P50/P90 (ficam apenas Geração bruta P50/P90 e
  as metas de disponibilidade). `inicioOperacao` (já existente) passa a ser a única referência de
  início de operação — antes havia fallback para `dataInstalacao`, removido junto. Colunas
  correspondentes eliminadas do schema (`prisma db push`); os 28/14 valores de GHI/POA/PR P50-P90
  já cadastrados na previsão anual (Fase 3, não usados em nenhuma tela) e o texto de origem de
  geração foram descartados como consequência direta — não havia leitor desses campos em nenhuma
  rota além da própria grade de metas.
- **Padronização de unidade — Geração Mensal por SKID:** o campo estava em MWh
  (`geracaoEGridMwh`, rótulo "(MWh, total do SKID)") enquanto todo o resto do sistema usa kWh —
  única inconsistência de unidade encontrada na revisão. Renomeado para `geracaoEGridKwh`; os 336
  valores já importados (Fase 3 + atualização de 2026-09-18) foram migrados via SQL
  (`ALTER TABLE ... RENAME COLUMN` + `UPDATE ... *1000`) antes do `prisma db push`, para não perder
  o histórico real no rename — só depois disso o push rodou (as remoções acima, essas sim
  intencionais, usaram `--accept-data-loss`).
- **Painel Principal — "Geração de Energia Bruta e irradiação":** passou a exibir, dentro do
  próprio card do gráfico (antes só apareciam separados/parciais), os três indicadores pedidos:
  Irradiação realizada, Geração prevista (P50 e P90) e Geração realizada — todos em kWh (ou
  kWh/m² para irradiação, que é uma grandeza por área e não é convertível para kWh).

## Notificações, Histórico e Usuários — evolução (Fase 9)
- **Decisão:** "Notificações" ganhou um painel de alertas calculados ao vivo a partir do estado
  atual do sistema — nunca persistidos, sem estado de lida/não lida nesta fase (isso ficaria para
  uma evolução futura com preferências por usuário). Quatro condições: estoque abaixo do mínimo
  cadastrado, Ordem de Serviço aberta/em andamento com data prevista vencida, plano preventivo
  ativo com próxima geração vencida, e evento operacional em andamento (sem "fim") há mais de 24h.
  Escopo de usinas segue a mesma permissão `notificacoes`/`visualizar` já usada pelo histórico.
- **Histórico de auditoria** ganhou filtros (usina, módulo, ação, período) e paginação por cursor
  (`antesDe`) — antes só listava os 200 eventos mais recentes sem nenhum controle na tela, o que já
  não escalava depois de 8 fases de atividade real no sistema.
- **Bug de segurança real corrigido durante a validação (não específico desta fase):**
  `GET /api/auditoria` restringia eventos do módulo `usuarios` (administrativo) a administradores,
  mas um usuário comum podia contornar essa restrição simplesmente passando `?modulo=usuarios` na
  query — o filtro explícito da query sobrescrevia por completo a restrição em vez de se combinar
  com ela. Confirmado o bug e a correção com um usuário de teste sem permissão administrativa
  (retornava os eventos antes da correção; retorna 0 depois). Corrigido combinando os dois filtros
  em vez de um sobrescrever o outro.
- **Usuários e Acessos:** exposta a edição de nome/e-mail/perfil (rota já existia no backend desde
  a Fase 1, sem UI para chamá-la), adicionada reativação de usuário desativado (só existia
  desativar) e exibição de "Último acesso" (campo já vinha da API, só não era mostrado na tabela).

## Relatórios (Fase 8)
- **Decisão:** um único tipo de relatório nesta fase — "Relatório de Desempenho", combinando
  Geração (realizada/P50/P90/aderência), Performance Ratio (realizado/esperado/aderência), Fator de
  Capacidade aferido (base AC/DC explícita), Disponibilidade (geração/comunicação/MTTR/MTBF) e
  Financeiro (custo total, custo por kWp, por categoria) — as mesmas fórmulas já usadas nas abas do
  Dashboard individual e em Financeiro, não recalculadas com regra própria. Formatos: PDF, Excel e
  CSV.
- **"Preservados com sua fotografia de dados e filtros":** ao gerar, o backend grava uma
  `RelatorioEmitido.dadosSnapshot` (JSON) com os valores já calculados — o arquivo (PDF/Excel/CSV) é
  sempre regerado a partir desse snapshot, nunca recalculado com dados atuais. Reabrir/baixar de
  novo um relatório antigo (inclusive num formato diferente do original — testado: emitido em PDF,
  rebaixado em CSV) sempre reproduz o mesmo conteúdo, mesmo que lançamentos tenham sido alterados ou
  corrigidos depois. Relatórios nunca são apagados automaticamente (sem rota de exclusão nesta
  fase).
- **Identidade sem logotipo aprovado:** o cabeçalho do PDF usa apenas a escrita "OASIS SOLAR" em
  negrito (nenhum arquivo de logo foi fornecido ainda). A fonte Poppins (identidade tipográfica do
  sistema) não está disponível como fonte embutida no gerador de PDF nesta fase (exigiria um
  arquivo `.ttf` no projeto, que não existe) — usa-se Helvetica-Bold (fonte nativa do PDF) como
  substituto até a fonte oficial ser fornecida. "Responsável" é um campo de texto livre preenchido
  na emissão, gravado no snapshot.
- Tela `/relatorios` segue o mesmo padrão de Lançamento de Dados/Manutenção/Financeiro: dirigida
  pelo filtro "Usina ativa" e pelo período global da barra superior, não um seletor próprio.

## Financeiro (Fase 7)
- **Decisão:** custo de O&M por usina, somado de duas origens nunca duplicadas: (1) peças
  consumidas do estoque — `MovimentacaoEstoque` tipo `SAIDA`, custo já reconhecido no consumo, não
  na compra (ver "Reconhecimento de custo de O&M" acima); (2) lançamentos manuais de custo (mão de
  obra, serviço terceirizado, peças avulsas fora do estoque controlado, outros), tela própria em
  `/financeiro`, dirigida pelo filtro "Usina ativa" e pelo período global (ano/mês/intervalo) da
  barra superior — mesmo padrão de Lançamento de Dados e Manutenção e Estoque.
- **"Custo por kWp" usa sempre a potência DC instalada**, nunca a potência CA configurável — kWp é,
  por definição, potência de pico DC, diferente da convenção AC/DC do Fator de Capacidade
  (`baseFcPadrao`), que é uma escolha de referência, não uma definição de unidade.
- **Consumo de estoque sem custo apurado não é presumido como R$0:** uma saída de estoque cujo item
  nunca teve entrada com custo informado (custo médio ainda nulo) fica fora da soma do custo total
  e é sinalizada à parte na tela ("consumo sem custo apurado") — nunca subestimando o custo real
  silenciosamente.
- **Bug real corrigido durante a validação (não específico desta fase):** vários lugares do
  frontend formatavam datas "apenas dia" (sem hora — início de operação da usina, data de
  lançamento financeiro, data prevista de OS, próxima geração de plano preventivo) com
  `new Date(iso).toLocaleDateString()`, que desloca a data um dia para trás em qualquer fuso atrás
  de UTC (ex.: América/São Paulo, UTC-3) — confirmado no navegador: "31/10/2024" cadastrado
  aparecia como "30/10/2024". As abas do Dashboard (Fase 4) já evitavam esse problema fatiando a
  string ISO manualmente; os demais pontos (alguns de fases anteriores, ex. Lançamento de Dados)
  não. Corrigido com um utilitário único (`apps/web/src/lib/formatarData.ts`) que formata com
  `timeZone: "UTC"`, aplicado em todos os pontos afetados — campos que são de fato um instante
  (ex.: início/fim de um evento operacional, com hora relevante) continuam formatados no fuso local
  do navegador, propositalmente.

## Painel Principal — dirigido pelo filtro "Usina ativa" (correção pós-Fase 6)
- **Decisão:** por instrução explícita do usuário, o Painel Principal (`/painel`, primeiro item do
  menu) deixou de mostrar uma tabela consolidada de todas as usinas e passou a mostrar as mesmas 5
  abas técnicas do Dashboard individual (Geração de Energia Bruta, Irradiação, PR, FC,
  Disponibilidade) para a usina selecionada no filtro "Usina ativa" da barra superior — o mesmo
  mecanismo já usado por Lançamento de Dados e Manutenção e Estoque. Trocar a usina no filtro
  atualiza o painel na hora, sem navegação; nenhuma tabela de outra tela decide mais o que aparece
  aqui — links que antes abriam `/usinas/:id/dashboard` (Cadastro de Usinas, Ranking de Ativos)
  agora apenas definem o filtro e levam para `/painel`.
- **Identidade visual mantida:** a descrição de referência enviada pelo usuário para este ajuste
  citava paleta verde-limão, tipografia Inter e sidebar escura de uma ferramenta de terceiros («pv
  operation»). Perguntado, o usuário confirmou manter a identidade OASIS SOLAR (navy/laranja,
  Poppins, sidebar clara) já definida desde a Fase 1 — só o comportamento (filtro dirige o painel)
  foi adotado da referência, não o visual.
- **`/usinas/:usinaId/dashboard` viraram permalink, não mais o caminho principal:** a rota
  continua existindo e funcionando (útil para link direto a uma usina específica,
  independentemente do filtro atual), mas não é mais alimentada por links de tabelas — o corpo das
  5 abas foi extraído para `components/dashboard/PainelUsina.tsx`, reaproveitado tanto por
  `/painel` (via filtro) quanto por esse permalink (via parâmetro de URL).
- **Visão consolidada da carteira (antigo conteúdo do Painel Principal):** a tabela com todas as
  usinas lado a lado e os KPIs somados da carteira não foram descartados — essa necessidade já é
  atendida pela tela Comparativo (Fase 5), que mostra a mesma lista de usinas com os mesmos
  indicadores. Nenhum dado ou cálculo foi perdido, só a tela em que aparece.

## Manutenção e Estoque (Fase 6)
- **Granularidade de equipamento:** Ordens de Serviço, planos preventivos e eventos operacionais
  referenciam no máximo um SKID (nunca um inversor específico) — mesma simplificação já adotada em
  PR/FC por SKID no Dashboard (Fase 4). `escopo` (`USINA`/`EQUIPAMENTO`) existe no modelo de dados
  para permitir MTTR/MTBF por equipamento no futuro, mas a aba Disponibilidade do Dashboard nesta
  fase só calcula e exibe os indicadores agregados no nível da usina inteira.
- **Disponibilidade "sem histórico" ≠ "100% disponível":** só calculamos um percentual de
  disponibilidade (geração/comunicação) quando já existe pelo menos um evento operacional histórico
  daquele tipo cadastrado para a usina — nunca assumido 100% (nem 0%) só porque nenhuma parada foi
  registrada ainda. MTTR e MTBF exigem pelo menos um evento **encerrado** no período; sem isso,
  "Não calculável" (nunca 0h nem infinito).
- **Janela elegível de disponibilidade:** interseção entre o período consultado e o início de
  operação da usina (`inicioOperacao` ou, na ausência, `dataInstalacao`) — uma parada não pode
  contar como indisponibilidade antes de a usina existir operacionalmente.
- **Bug real corrigido durante a validação:** a data de "fim" do período (ex.: `2026-08-31`, sem
  hora) estava sendo usada como limite exato da janela contínua de duração, descontando quase um
  dia inteiro do mês (disponibilidade calculada sobre 720h em vez de 744h para agosto). Corrigido
  tratando "fim" como dia inteiro (`fim + 1 dia`), mesma convenção já usada por
  `horasDoIntervalo` (`lib/calculos.ts`, Fator de Capacidade) — não foi replicada automaticamente
  porque o novo cálculo de disponibilidade usa duração em milissegundos, não contagem de dias.
- **Estoque — catálogo global, saldo por usina:** um item do catálogo (ex.: um modelo de peça) é
  compartilhado entre usinas, mas o saldo físico e o custo médio ponderado (`EstoqueUsinaItem`) são
  por usina — a mesma peça pode ter saldo e custo diferentes em cada usina.
- **Ajuste de inventário define o saldo absoluto, não uma variação:** o campo `quantidade` da
  movimentação tipo `AJUSTE` registra o **saldo resultante** da contagem física (não um delta como
  em `ENTRADA`/`SAIDA`) — mais próximo de como uma contagem de inventário é conduzida na prática, e
  a diferença fica explícita comparando com a movimentação anterior no histórico.
- **Ordens de Serviço nunca são excluídas:** um engano é corrigido movendo o status para
  `CANCELADA`, preservando a trilha — mesmo princípio do log de auditoria imutável.
- **Preventivas — recorrência simples:** um plano tem uma frequência fixa em dias; "Gerar OS" avança
  `proximaGeracao` a partir da data anterior (nunca a partir de "hoje"), para não perder o compasso
  da recorrência mesmo que a geração seja feita com atraso.
- **Simplificações de interface:** o quadro Kanban muda de coluna por botões (sem
  arrastar-e-soltar, para não introduzir uma biblioteca extra só para isso); o "Calendário" é uma
  lista agrupada por dia dentro do mês selecionado, não um grid de calendário completo.

## Comparativo e Ranking de Ativos (Fase 5)
- **Decisão:** as duas telas reaproveitam o mesmo `GET /painel/resumo` do Painel Principal (mesma
  permissão `painel`/`visualizar`, mesmo filtro de período global da barra superior) em vez de uma
  rota própria — os indicadores (geração realizada/prevista, PR pareado dia a dia, IPE, rendimento
  específico) já são calculados ali com as regras corretas (soma de numeradores/denominadores,
  nunca média de percentuais); duplicar o cálculo em outra rota arriscaria divergência entre telas.
- **Comparativo:** seleção de usinas (todas por padrão) com 4 gráficos de barras (geração
  realizada vs. prevista, PR, IPE, RE) mais uma tabela. Usina sem o indicador calculável no
  período simplesmente não desenha a barra naquele gráfico (não é tratada como zero).
- **Ranking de Ativos:** ordenação por um indicador à escolha (PR, IPE, RE, geração realizada),
  1º/2º/3º destacados. Usinas sem o indicador calculável no período ficam fora da numeração, numa
  seção separada "Sem dados" — nunca listadas como último colocado, que seria interpretar ausência
  de dado como pior desempenho.
- Este desenho foi definido sem acesso ao texto literal da especificação para estes dois módulos
  nesta sessão (retomada após corte de contexto); revisar com o cliente critérios adicionais que a
  especificação porventura detalhe (ex.: outros indicadores no ranking, exportação, benchmarks).

## Cadastro de Usinas — dados mensais por SKID (PVsyst) e filtro "Usina ativa"
- **Decisão:** nova seção "Dados mensais por SKID (PVsyst)" em Configurações da usina, com os
  mesmos 3 indicadores das tabelas PVsyst empilhadas usadas na importação inicial dos dados reais
  (Performance Ratio Mensal %, Geração Mensal E_Grid em MWh — total do SKID —, Irradiação Mensal
  Efetiva GlobEff em kWh/m²), editáveis por SKID/ano/mês e versionados (nunca sobrescreve, mesmo
  esquema de `PrevisaoMensal`/`Degradacao`).
- Ao salvar uma nova versão para um SKID, o backend recalcula e grava automaticamente uma nova
  versão de `PrevisaoMensal` (nível da usina) somando a energia de todos os SKIDs com dado
  disponível no mês e ponderando irradiação/PR por potência FV cadastrada — a mesma fórmula usada
  em `prisma/importar_dados_reais.ts` (nunca média simples). Os campos alimentados pela seção
  "Metas mensais" (P50/P90, GHI/POA, disponibilidade) são preservados da versão anterior, nunca
  apagados por esta rota.
- **"Divisão automática para cada inversor":** a Geração Mensal é digitada como total do SKID; a
  divisão por inversor (soma igual entre os inversores ativos vinculados ao SKID) é sempre
  calculada em tempo de leitura, nunca persistida por inversor — a fonte PVsyst não tem essa
  grandeza no nível de inversor. Sem inversor vinculado, aparece como "não calculável" (nunca
  dividido por zero).
- SKID sem potência FV cadastrada (`potenciaFvKwp`) é excluído da ponderação da usina (nunca
  presumido como zero), com aviso explícito na tela.
- **Bug real corrigido durante a validação:** a primeira versão do recálculo sobrescrevia
  `geracaoPrevistaKwh`/`irradiacaoPrevistaKwhM2`/`prPrevistoPct` de TODOS os 12 meses da usina a
  cada salvamento, mesmo quando só um SKID/mês tinha dado novo — isso apagava (virava `null`) os
  meses ainda não preenchidos nesta seção, incluindo os já corretos vindos da importação inicial
  (reproduzido e confirmado em "UFV Sitio Pescoço": um teste com apenas Setembro/SKID 1 preenchido
  reduziu a geração prevista anual da usina de 5.917.563 kWh para 700.000 kWh). Corrigido para só
  recalcular o agregado de um mês quando TODOS os SKIDs ativos com potência cadastrada têm dado
  nele nesta seção; caso contrário, preserva o valor anterior (importado ou de versão prévia) sem
  alterá-lo — "dado ausente ≠ zero" vale também entre SKIDs, não só entre meses.

- **Decisão:** o filtro "Usina ativa" da barra superior (Topbar), até então usado apenas por
  Lançamento de Dados, passou a também dirigir o Dashboard individual (`/usinas/:usinaId/dashboard`):
  trocar a usina ali navega para o dashboard da nova usina, e o dashboard sincroniza o filtro de
  volta ao ser aberto por um link direto (ex.: tabela do Painel Principal). O seletor local de
  Configurações da usina foi mantido separado (não é dirigido pelo filtro da barra superior) porque
  tem sua própria proteção contra perda de alterações não salvas ao trocar de usina — a barra
  superior apenas sincroniza esse filtro a partir da URL quando Configurações é aberta, sem navegar
  automaticamente. O Painel Principal (visão consolidada de todas as usinas) não é afetado pela
  troca do filtro, propositalmente — continua mostrando a carteira inteira.
- **Bug real corrigido durante a validação:** o efeito que define a usina padrão no primeiro
  carregamento (`Topbar.tsx`) fechava sobre um valor desatualizado (stale closure) de
  `usinaAtivaId` dentro do `.then()` assíncrono da chamada `GET /usinas`, sobrescrevendo qualquer
  sincronização feita por outra página (ex.: Dashboard/Configurações) mesmo depois de já definida.
  Corrigido usando a forma funcional do setter (`setUsinaAtivaId((atual) => atual ?? ...)`), que lê
  o estado atual no momento da atualização em vez do capturado na criação do efeito.

## Dashboard individual — abas de indicadores (Fase 4)
- **"Reprocessar" e "Último processamento":** os indicadores são sempre calculados em tempo real a
  partir dos lançamentos (não há cache a invalidar). "Reprocessar" apenas atualiza um carimbo de
  data/hora (`ProcessamentoIndicador`) para satisfazer o requisito da especificação, sem risco de
  mostrar um valor desatualizado.
- **Meta diária de energia/PR/FC não existe** — o estudo só fornece metas mensais (e, para
  P50/P90, apenas anuais). Os gráficos diários das abas Geração Bruta/PR/FC mostram apenas a série
  realizada; o "Gráfico 2" da especificação (aderência diária com metas P50/P90 por dia) não foi
  implementado nesta fase por exigir um perfil diário de rateio que a especificação explicitamente
  proíbe inventar sem aprovação.
- **P50/P90 e meta de FC no recorte "ano completo":** como o estudo só fornece esses cenários no
  nível anual (nunca mensal), as abas usam `PrevisaoAnual` diretamente quando o intervalo
  selecionado é exatamente um ano civil inteiro (1/jan a 31/dez). Para qualquer outro recorte,
  aparecem como "Não calculável" — não são rateados.
- **PR/FC por SKID no relatório vs. por inversor:** a especificação pede tabela por SKID **e
  inversor**; implementei apenas por SKID nesta fase, porque os inversores importados não têm
  potência DC própria cadastrada (só quantidade de módulos e Wp, que o usuário pode preencher em
  Dados Nominais — Fase 2 — para habilitar o cálculo por inversor no futuro).
- **Bug real corrigido durante a validação:** o filtro de intervalo de datas estava sendo mantido
  em estado local de cada aba (Geração Bruta, Irradiação, PR, FC) em vez de compartilhado — trocar
  de aba resetava as datas, violando "preservar os filtros ao alternar abas da mesma usina"
  (especificação). Corrigido elevando o estado para o componente pai `DashboardUsina`.

## Importação dos dados reais (Cadastro Usinas.xlsx + Consolidado_Geracao_UFVs_2026)
- **Decisão:** script único `apps/api/prisma/importar_dados_reais.ts` (idempotente), executado em
  2026-09-17, importou 14 usinas reais, seus SKIDs/inversores e ~28 mil lançamentos diários de
  geração/irradiação (jan–set/2026).
- Mapeamento de nomes confirmado com o usuário: "UFV Cerado Pedra I/II/III" ==
  "Usina Cercado da Pedra 01/02/03"; "UFV Efizi" == "Usina Efize". "UFV Serra LOG" e "UFV Malhada"
  foram cadastradas mesmo sem geração diária disponível (ficam "Sem dados" até serem lançados).
- A usina de teste da Fase 2 ("UFV Sítio do Pescoço", SP-001) foi removida e recriada com os dados
  reais ("UFV Sitio Pescoço").
- PR previsto (anual e mensal) é calculado ponderado por potência a partir do PR Mensal (PVsyst)
  informado por SKID em "Dados mensais por SKID" — nunca a média simples. **Ajuste 2026-09-18:**
  antes era derivado de energia/energia teórica (potência × irradiação); mudou para ponderar
  diretamente o PR Mensal de cada SKID porque divergia do valor realmente informado na planilha
  PVsyst (ver seção "Correções de escala e agregação — 2026-09-18" abaixo).
- **Bug de cobertura corrigido durante a validação:** o PR realizado (Painel Principal) somava a
  geração do período inteiro contra a irradiação apenas dos dias com leitura disponível — quando
  a série de irradiação tinha cobertura bem menor que a de geração (ex.: UFV Paratinga), o PR saía
  inflado (chegou a 169%). Corrigido para parear energia e irradiação dia a dia, somando só os dias
  com as duas séries presentes (`calcularPrPeriodoPareado` em `painel.routes.ts`).
- Duas usinas (UFV Efizi, UFV Cerado Pedra II) têm leituras de irradiância "geral" zeradas na
  planilha de origem (só setembro/2026, todas com valor 0 — provável sensor não instalado/sem
  comunicação). O sistema corretamente mostra PR "Sem dados" para elas, sem inventar um valor —
  mas vale confirmar com o time de campo se o sensor está mesmo instalado.

## Cadastro de Usinas — Metas mensais e "geração prevista" do IPE
- **Decisão:** a matriz de Metas mensais (Fase 2) implementa exatamente as 12 linhas da
  especificação (2 energia, 4 irradiação, 2 PR, 2 FC calculado, 2 disponibilidade), versionadas por
  usina/ano — cada "Salvar" ou importação de Excel cria uma nova versão, nunca sobrescreve.
- Os campos `geracaoPrevistaKwh`, `prPrevistoPct` e `irradiacaoPrevistaKwhM2` da seção "Previsões e
  filtro por ano" (página 24 do PDF) existem no modelo de dados como campos opcionais de
  sobreposição manual, mas não têm UI própria nesta fase — quando vazios, o IPE (Fase 3+) deve
  considerar o cenário P50 como referência padrão. Seleção explícita de cenário (P50/P90/
  personalizado) para o IPE fica para evolução futura.
- Múltiplas curvas de degradação por grupo de módulos (quando módulos diferentes têm garantias
  distintas) não são suportadas nesta fase — apenas uma curva linear por usina/versão.
- Vínculo inversor↔SKID tem histórico de vigência (tabela dedicada) desde a Fase 2, mesmo antes do
  Lançamento de Dados (Fase 3) consumir esse histórico para reclassificação retroativa.

## Metodologia de PR
- **Decisão:** implementar apenas "PR Simples" (convencional), conforme fórmula da seção 12/13 do
  PDF. Métodos bifaciais ficam como `TODO` explícito em código — não implementados nesta fase.

## Base de potência do Fator de Capacidade
- **Decisão:** campo `baseFcPadrao` por usina (`'AC' | 'DC'`), configurável no cadastro. Default
  `'DC'` (kWp), pois a potência DC é sempre cadastrada; a potência AC nominal é opcional. A base
  usada deve sempre ser exibida junto ao indicador (nunca alternada implicitamente).

## Critério de custo/valorização do estoque
- **Decisão:** custo médio ponderado (weighted average cost) por item/usina, recalculado a cada
  entrada. Consumo em OS debita pelo custo médio vigente no momento da baixa.

## Reconhecimento de custo de O&M
- **Decisão:** o custo de O&M por peça é reconhecido no **consumo** (baixa vinculada à OS), não na
  compra/entrada em estoque. A compra apenas movimenta o estoque; evita contar o mesmo custo duas
  vezes, conforme exigido pelo documento.

## Disponibilidade — janela elegível e exclusões
- **Decisão:** por padrão, toda parada registrada como evento operacional conta como
  indisponibilidade, dentro da janela entre o início de operação da usina e o fim do período
  consultado. Exclusões (ex.: manutenção programada não contar) ficam como parametrização futura
  por usina — não implementadas nesta fase.

## MTTR / MTBF — conjunto de eventos
- **Decisão:** eventos operacionais têm um campo `escopo` (`'USINA' | 'EQUIPAMENTO'`) definido no
  cadastro do evento. MTTR/MTBF são calculados separadamente por escopo, nunca misturados.

## Frequência e fechamento dos lançamentos
- **Decisão:** granularidade diária é a unidade primária de lançamento. O fechamento de uma
  competência (mês) é uma ação explícita do usuário (`situacao: 'PARCIAL' | 'FECHADO'`); o sistema
  nunca fecha automaticamente nem reabre sozinho.

## Medição e previsão — ponto de medição
- **Decisão:** o total padrão da usina é a soma da energia AC dos inversores (`Σ Inversores`).
  Energia exportada é um campo complementar opcional, nunca somada ao total de geração bruta.

## Relatórios — identidade e retenção
- **Decisão:** enquanto não existir um arquivo de logotipo aprovado, os relatórios usam apenas a
  escrita tipográfica "OASIS SOLAR" (Poppins SemiBold). Assinatura/responsável é um campo de texto
  livre preenchido manualmente na emissão. Retenção: relatórios emitidos nunca são apagados
  automaticamente; ficam preservados com sua "fotografia" de dados e filtros.

## Estoque — permissão de ajuste de inventário
- **Decisão:** ação `estoque.ajustar` exige permissão específica, distinta de `estoque.movimentar`,
  associada à combinação usina + módulo + ação do usuário.

## Sessões e desativação de usuário
- **Decisão:** autenticação via JWT stateless com um campo `tokenVersion` no usuário. Desativar o
  usuário ou redefinir a senha incrementa `tokenVersion`, invalidando qualquer token emitido antes
  — sem precisar de tabela de sessões ativas.

---
Este arquivo deve ser atualizado a cada nova decisão de placeholder tomada durante o
desenvolvimento, e revisado com o cliente antes de qualquer declaração de conformidade metodológica
(ex.: referência PVsyst citada no PDF).

## Lançamento de Dados em formato de tabela (2026-09-20)

- A tela deixou de ser formulário + duas listas: agora é uma única tabela (Data, SKID, Inversor, Geração realizada kWh, Irradiação realizada kWh/m²). A primeira linha, destacada, é a de novo lançamento (Enter ou "Adicionar"); as demais são os lançamentos já feitos, com editar/excluir na própria linha. Sem mudança na API.
- Cada linha é um lançamento de geração; a irradiação do dia aparece ao lado (compartilhada entre as linhas do mesmo dia). Dias que só têm irradiação aparecem como linha sem geração. Editar a irradiação numa linha vale para o dia inteiro (aviso no tooltip).
- Excluir uma linha remove o lançamento de geração; a irradiação do dia só é excluída em linhas sem geração (é compartilhada pelas demais).
- Data, SKID e inversor não são editáveis na linha (identificam o lançamento): para mudar, exclui-se e lança-se de novo. Só os valores são editáveis, preservando o anterior na auditoria.
- A irradiação passou a ser sempre gravada no nível "geral" da usina (uma por dia), inclusive quando um SKID está selecionado na linha de novo lançamento — antes, escolher SKID criava uma irradiação por SKID, contrariando a regra "manter a mesma irradiação para o dia". Só é gravada se for nova ou diferente da já lançada (evita registros de edição sem mudança).
- Após adicionar, o inversor avança para o próximo do SKID para facilitar o preenchimento em sequência.

## Atualização das metas mensais — Dados_de_Geração_Mensal_2.xlsx (2026-09-20)

- Script: `apps/api/prisma/importar_dados_geracao_mensal_2.ts` (simula por padrão; `--aplicar` grava). Cada usina/SKID que muda ganha nova versão (nunca sobrescreve); reexecutar sem mudança não cria versões. Backup do banco feito antes de aplicar.
- Fontes: `Planilha1` (E_Grid por SKID, MWh → kWh), `Geração Bruta P50/P90` (kWh/mês por SKID) e `Disponibilidade Meta` (fração → %). P50/P90 e disponibilidade são gravados no nível da usina (soma dos SKIDs / valor único), pois o modelo não guarda P50/P90 por SKID.
- Resultado: a geração E_Grid já estava igual ao arquivo; o que mudou foram P50/P90 (estavam ausentes ou incompletos — ex.: Serra LOG 12 mil kWh/ano, Sitio Pescoço 2,06 mi) e a disponibilidade de geração meta (vazia ou 100% → 97%/98%). Irradiação, PR e a meta de disponibilidade de **comunicação** (em branco no arquivo) foram preservados, não inventados.
- A previsão anual (PrevisaoAnual) ativa foi desativada (histórico mantido) nas usinas com P50/P90 mensais completos — mesma regra de `salvarNovaVersao`. Passa a valer o mensal.
- Premissas do arquivo (aba "Premissas"), aceitas como fornecidas: P50/P90 = geração da Planilha1 × fator anual do PVsyst; Bom Futuro, Cerado Pedra I/II/III, Efizi, Nacional I/II e Sitio Pescoço SKID 4 usam as razões e a disponibilidade de Sitio Pescoço (sem simulação própria); Paratinga foi simulada para o ano 10 (P50/P90 subestimam os primeiros anos); disponibilidade meta = 1 − indisponibilidade da simulação (substituir por meta contratual, se diferente).
- Atenção: o P50/P90 do PVsyst parte do E_Grid, que já desconta a indisponibilidade (2–3%). Se algum cálculo aplicar a disponibilidade de novo sobre a geração bruta, haverá desconto em duplicidade.

## Fundo da aplicação com a foto da usina (2026-09-21)

- O fundo do sistema acompanha o filtro global de usina: usa a "Foto da usina" enviada em Cadastro de Usinas > Identificação. A foto aparece em degradê (opaca no canto superior, esmaecendo na diagonal até sumir) e com transparência, sobre a cor de fundo do tema; um véu em degradê garante o contraste do texto. Funciona nos modos claro e escuro. Usina sem foto fica com o fundo padrão (sem imagem-padrão inventada).
- Componente `FundoUsina` (montado em `AppLayout`), estilos `.fundo-usina*` em `index.css`. As imagens baixadas ficam em cache por caminho (cada upload gera um nome novo). Ao enviar/substituir/remover a foto no cadastro, o fundo atualiza na hora (evento `oasis:foto-usina-alterada`).
- Os cartões (`.bg-white.border.rounded-lg`) passaram a 90% de opacidade para a foto transparecer de leve por baixo, sem prejudicar a leitura. Sem `backdrop-filter` de propósito (ele quebraria janelas modais posicionadas dentro de cartões).
- Correção de bug existente: `FotoAutenticada` pedia `/api/api/uploads/...` (o cliente já prefixa `/api`) e falhava com 404 — as miniaturas da foto da usina no cadastro e as imagens de itens do estoque nunca carregavam. Agora usa `/uploads/...`.

## Painel Principal — nome do clima ao lado do ícone (2026-09-21)

- Na tabela "Energia Ativa Gerada (kWh/dia)", a coluna Clima passou a mostrar o nome ao lado do ícone: Sol, Nublado, Chuva (e Neblina / Tempestade quando ocorrem). O nome vem da categoria já usada para o ícone; o detalhe ("Parcialmente nublado", "Garoa", temperaturas e mm de chuva) continua no tooltip. Assim, "Parcialmente nublado" aparece como "Sol", conforme a categoria do ícone.

## Lançamento de Dados — editar irradiação em linhas sem irradiação (2026-09-21)

- Na tabela de lançamentos, a edição da linha agora sempre mostra o campo de Irradiação realizada. Antes ele só aparecia se o dia já tivesse irradiação lançada, então linhas de geração de dias sem irradiação ("—") não podiam receber esse valor. Regras: dia com irradiação → altera o lançamento existente; dia sem irradiação → preencher cria o lançamento do dia (nível usina, plano POA); campo vazio em dia sem irradiação não grava nada. Para remover uma irradiação já lançada, exclui-se a linha só de irradiação.

## Painel Principal — cards de Geração de Energia Bruta e irradiação (2026-09-21)

- Os cards do gráfico "Geração de Energia Bruta e irradiação" agora são 3: Irradiação realizada, **Geração prevista (PVsyst)** e Geração realizada. Os cards P50 e P90 foram removidos (as rosquinhas "Aderência à meta P50/P90" acima do gráfico não foram alteradas).
- Geração prevista (PVsyst) = geração mensal prevista (E_Grid, campo `geracaoPrevistaKwh`) ÷ dias do mês, somada nos dias do período. Vale também para mês parcial (proporcional aos dias do período) — sem isso o card ficaria "Sem dados" no período padrão (mês corrente até hoje). Se algum dia do período estiver em mês sem previsão cadastrada, o card mostra "Sem dados" (não soma parcialmente). A linha tracejada do gráfico passou a usar a mesma série (antes usava P50 ÷ dias) para o card e o gráfico baterem.
- Cada card tem um ícone "i" (passar o mouse, focar ou tocar) com a explicação do indicador. `KpiCard` ganhou a propriedade opcional `info`; os cards das outras abas não foram alterados.

## Painel Principal — ícone "i" de informação nos cards (2026-09-21)

- O ícone "i" (passar o mouse, focar com o teclado ou tocar) com a explicação do indicador agora existe em todos os cards das abas: Geração de Energia Bruta (Aderência à meta P50, Aderência à meta P90, Irradiação realizada, Geração prevista, Geração realizada), Irradiação (realizada, prevista, aderência), PR (realizado, esperado, aderência) e FC (aferido, meta, aderência). A aba Disponibilidade ainda não tem o "i".
- Implementação: componente `InfoTooltip` reutilizado por `KpiCard` e `AderenciaGauge` (nova propriedade opcional `info`). Os textos descrevem as fórmulas realmente usadas (aderência = realizado ÷ meta × 100, PR pareado por dia, meta de FC = Σ P50 ÷ Σ potência×horas, PR esperado ponderado pela geração prevista, etc.).

## Irradiação diária das usinas sem medição própria — Geracao_M.xlsx (2026-09-21)

- Pedido: para Cerado Pedra I/II/III, Bom Futuro, Efizi (grafado "Efize"), Nacional I e Nacional II, usar a tabela de irradiação em anexo (uma série única: Data, Irradiação kWh/m², 01/01 a 31/08/2026, 243 dias, sem lacunas).
- Script `apps/api/prisma/importar_irradiacao_diaria_geracao_m.ts` (simula por padrão; `--aplicar` grava; idempotente). Grava lançamentos diários de irradiação no nível da usina (plano POA, origem "Importação — Geracao_M.xlsx"), como o lançamento manual. Dia novo cria; dia já lançado com valor diferente atualiza e registra o valor anterior na auditoria; nada é apagado. Backup do banco feito antes.
- Resultado: 243 dias por usina. Em 4 usinas (Cerado Pedra II, Efizi, Nacional I e II) o dia 31/08 estava com 0 kWh/m² (placeholder da importação do Consolidado) e passou a 5,752.
- Não alterado (fora do período do arquivo): as usinas Cerado Pedra II, Efizi, Nacional I e II ainda têm 0 kWh/m² em 01/09–29/09 (mesma importação antiga) e Bom Futuro tem 2 lançamentos em setembro (14/09 = 1 e 21/09 = 100 kWh/m², valores implausíveis, provavelmente teste). Ficam para o cliente confirmar/substituir.

## Versão do sistema no rodapé (2026-09-21)

- Rodapé em todas as telas internas (`AppLayout`): "OASIS SOLAR — Gestão de usinas solares" à esquerda e "Versão X.Y.Z" à direita. A versão vem do campo `version` do `package.json` da raiz (fonte única, injetada pelo Vite como `__APP_VERSION__` em `vite.config.ts`); hoje é 0.1.0. Para publicar uma nova versão, basta alterar esse campo e reiniciar o servidor do front-end.

## Degradação aplicada às previsões de energia (2026-09-21)

- Premissas confirmadas pelo cliente (corrigidas em 2026-09-21: as simulações PVsyst importadas são do **ano 0**, módulos novos, sem degradação — a primeira informação, "ano 1", foi corrigida pelo cliente); a degradação reduz **somente as previsões de energia** (geração prevista/E_Grid, P50, P90 e, por derivação, a meta de FC). Irradiação prevista, PR previsto e disponibilidade não são degradados.
- Fórmula: `fator(n) = Retenção(n) / 100`, com `Retenção(n) = 100 − perda1ºAno − (n−1) × perdaAnual` (curva cadastrada em Degradação esperada). `n` é o ano de operação do mês (pelo dia 15), contado a partir da **data-base** da curva; antes da data-base é o ano 0 (fator 1, sem degradação). Ex.: curva 2% + 0,5%/ano, ano 3 → fator 0,97. Implementação em `apps/api/src/lib/degradacao.ts`.
- Onde é aplicado (na leitura, sem reescrever dados): Painel do dashboard individual — Geração de Energia Bruta (P50, P90, geração prevista/linha diária) e FC (meta), Painel Principal (previsto do portfólio) e o snapshot de novos Relatórios (previsto da usina e por SKID). Relatórios já emitidos não mudam (snapshot). Os valores em Cadastro > Metas mensais continuam sendo os do PVsyst ("não alterar automaticamente previsões já salvas"). As telas mostram uma nota com o ano de operação e a redução média aplicada.
- Usina sem curva cadastrada: sem ajuste (fator 1) e a tela avisa — nada é presumido. Hoje sem curva: Camaçari, Malhada, Paratinga, Pedro Canário e Serra LOG (as três últimas também com ressalvas: Paratinga foi simulada para o ano 10 — aplicar a curva por cima contaria a perda duas vezes; Malhada sem data de início de operação).
- Atenção — UFV Central: a curva cadastrada tem data-base 18/09/2026 (parece a data do cadastro, não o início da operação em 31/12/2023) e perda de 1% no 1º ano (as demais usam 2%). Com essa data-base, Central só começa a ser degradada a partir de out/2026 (ano 1, fator 0,99); antes disso fica no ano 0. Corrigindo a data-base no cadastro, o ajuste passa a valer sozinho.


## Fotos na Ordem de Serviço (2026-09-22)

- Manutenção e Estoque > Ordens de Serviço: cada OS pode ter várias fotos (evidência do reparo, antes/depois), anexadas e removidas no próprio formulário de edição — "Salve a OS para anexar fotos" quando ainda não existe (precisa de um id). Até 8 arquivos por envio, mesma validação das demais fotos do sistema (assinatura binária real JPG/PNG/WebP, 10 MB, permissão "manutencao"."editar"). O cartão do Kanban mostra um ícone de câmera com a contagem quando há fotos.
- Modelo novo `FotoOrdemServico` (lista, não uma foto só como usina/item de estoque), `onDelete: Cascade` a partir de `OrdemServico`; excluir a OS apaga os arquivos em disco (o cascade só apaga as linhas do banco). Exclusão de foto é definitiva (sem versionamento — não é um dado calculado, é só anexo).
- Correção de bug encontrado ao testar: `apps/api/src/modules/uploads/uploads.routes.ts` só reconhecia arquivos que fossem a foto de uma usina (`Usina.fotoUrl`) — a imagem de item de estoque (`ItemCatalogo.imagemUrl`) também caía sempre em 404, apesar do bug de rota dupla `/api/api/uploads` já ter sido corrigido antes. Agora a rota reconhece as três origens (usina, item de estoque, foto de OS), cada uma com sua própria checagem de permissão.

## Design system — referência Velzon (2026-09-22)

- Arquivo de referência (`design.md`, anexado pelo cliente) salvo em `docs/design_referencia_velzon.md`: análise de paleta, tipografia, espaçamento, componentes e sombras do template admin Velzon.
- **Decisão:** adotar a estrutura/linguagem visual do Velzon (raio de cartão discreto, sombra "flat/enterprise" em vez de difusa, sidebar em gradiente), mas **manter a paleta institucional OASIS SOLAR** (`os-azul-marinho` #00386D, `os-laranja` #EE7528, `os-azul-claro` #45A3DB, `os-amarelo` #FBBB21) em vez do índigo/azul do Velzon — mesma diretriz já usada para a referência de layout Figma anterior ("manter proporção de cores"). A tipografia (Poppins) e a hierarquia de peso (números de KPI em semibold, rótulos secundários mais claros) já estavam alinhadas ao Velzon; nenhuma mudança necessária ali. O tamanho de fonte base do Velzon (13px, nāo padrão) não foi adotado — mantido o padrão do navegador (16px raiz) por acessibilidade; como o espaçamento do Tailwind é em rem, adotar 13px encolheria todo o espaçamento do sistema, risco desproporcional ao ganho visual.
- Mudanças aplicadas (efeito em todo o sistema, via estilos centralizados já usados pelo projeto):
  - Cartões (`.bg-white.border.rounded-lg` em `index.css`): raio reduzido de `rounded-2xl` (16px) para 8px (equivalente a `rounded-lg` do Tailwind — não literalmente 4px do Velzon, para não destoar dos botões/inputs que já usam rounded-md/rounded-lg); sombra trocada da difusa anterior para uma sombra rasa em duas camadas, inspirada na do Velzon (`shadow-card` em `tailwind.config.js`, mais `shadow-card-lg` para elementos elevados, ainda não usado).
  - Sidebar (`Sidebar.tsx`): fundo sólido navy → gradiente vertical navy (`os-azul-marinho`) até quase preto (`#001220`), inspirado no "gradient-4" do Velzon, mas com a cor da marca.
  - Topbar (`Topbar.tsx`): ganhou `shadow-card` (linha sutil de elevação), mantendo o fundo branco — decisão deliberada de não escurecer a topbar como no Velzon, para não conflitar com o alternador de tema claro/escuro já existente.
  - Badges "soft" (fundo claro + texto colorido) e cores de estado (verde/amarelo/vermelho) já seguiam esse padrão antes desta atualização (ex.: chips de fechamento de competência, limiares de Produtividade) — nenhuma mudança necessária.
- Não alterado nesta rodada (fora do escopo desta passada, pode ser pedido à parte): raio de botões/inputs individuais, um "page-title-box" com sombra própria por página (o Velzon tem uma faixa de título dedicada; aqui os títulos ficam soltos no topo do conteúdo), paleta de gráficos/mapas.

## Design Velzon aplicado aos gráficos e cardes (2026-09-22)

- Continuação da rodada anterior ("Design system — referência Velzon"), agora nos gráficos (Recharts) e no acabamento dos cardes.
- **Cardes:** título de cartão/seção (padrão `text-os-azul-marinho font-medium text-sm`, ~16 telas) passou de peso 500 para 600, como o `.card-title` do Velzon — mudança central em `index.css`, sem editar cada tela.
- **Gráficos** (Geração Bruta, Irradiação, PR, FC, Comparativo, Financeiro): grade cartesiana sólida e só horizontal (sem linhas verticais, sem traço pontilhado) — grade mais discreta, ao estilo Velzon; eixos com o cinza institucional (`#878787`) em vez do cinza padrão do Recharts; barras com cantos arredondados de 4px (`radius={[4,4,0,0]}`, antes só em Comparativo/Financeiro, com 3px); linhas com espessura explícita de 2px; tooltip com o mesmo raio (8px) e sombra rasa dos cardes (`.recharts-default-tooltip` em `index.css`, com `!important` — mesma necessidade já usada no bloco de modo escuro, pois o componente aplica raio/padding inline por padrão).
- **Bug real corrigido (achado ao validar a paleta dos gráficos com o script do skill de dataviz — `validate_palette.js`):** no modo escuro, a barra/linha/anel "realizado" (azul-marinho `#00386D`) tinha contraste de 1,35:1 contra o fundo dos cardes (`#12233A`) — praticamente invisível. Corrigido com uma regra de CSS (`.dark path[fill="#00386D"]` etc.) trocando para `#3B6EA8`, o mesmo azul mais claro já usado para bordas no modo escuro — sem alterar a cor no modo claro. Cobre a barra de Geração Bruta e PR, a linha de FC e o anel do medidor de aderência (P50/PR/FC), nos 4 lugares de uma vez, via CSS (sem precisar editar cada componente).
- **Decisão deliberada, não corrigida:** as linhas de referência em amarelo (`#FBBB21`, "previsto") e azul-claro (`#45A3DB`, "irradiação") têm contraste abaixo de 3:1 contra fundo branco no modo claro (1,67:1 e 2,72:1) — mantidas assim para não fugir da paleta institucional. Mitigado por legenda, tooltip ao passar o mouse, traço tracejado na linha de "previsto" (diferencia da linha sólida) e, no gráfico de Geração Bruta, por uma tabela de dados abaixo do gráfico com os mesmos valores. Irradiação, PR e FC não têm tabela equivalente — se for um problema real para algum usuário, a forma mais direta de resolver sem mudar a cor da marca é adicionar essa tabela nessas 3 abas (não feito nesta rodada, fora do pedido).
- Ícone da legenda mantido quadrado (não adotei o círculo do Velzon): o recurso de "Exportar PNG" do Comparativo lê a cor da legenda a partir do DOM (`svg path, svg line, svg rect`) para redesenhar o gráfico num canvas — um ícone circular (`<circle>`) não seria encontrado por esse seletor e quebraria a exportação.

## Lançamento de Dados — colar coluna do Excel (2026-09-22)

- Nos campos "Geração realizada" e "Irradiação realizada" da linha de novo lançamento: colar mais de um valor (uma coluna copiada do Excel, um valor por linha) cria um lançamento por linha, em dias consecutivos a partir da "Data" selecionada — 1ª linha = a própria data, 2ª linha = dia seguinte, etc. Mesmo SKID/Inversor já escolhidos no formulário. Colar um valor só continua colando normalmente no campo (não intercepta).
- Aceita número com vírgula decimal ou "milhar.decimal,vírgula" (formato PT-BR do Excel), além do formato com ponto.
- Célula em branco no meio da coluna colada pula aquele dia sem desalinhar as datas seguintes (ex.: colar 5 linhas com a 3ª em branco lança dias 1, 2, 4, 5 — nunca "linha 3 vira dia 3 do lançamento seguinte"). Célula com texto que não é número cancela a colagem inteira, com aviso indicando a linha e o dia — nunca lança "o que deu certo" e deixa o resto silenciosamente errado/desalinhado.
- Implementação: `onPaste` nos dois campos; sem `preventDefault` para colagem de 1 valor só (comportamento padrão do navegador). Testado via evento de paste sintético (ClipboardEvent + DataTransfer): coluna com linha em branco no meio, coluna válida, coluna com valor inválido (cancelada, nada gravado) e colagem de valor único (não interceptada). Dados de teste removidos depois.

## Lançamento de Dados — colar duas colunas (geração + irradiação) (2026-09-22)

- Colar duas colunas juntas do Excel (geração e irradiação lado a lado, separadas por tabulação — como o Excel copia um intervalo de células) alimenta os dois campos de uma vez, na ordem geração/irradiação (mesma ordem das colunas da tabela), não importa em qual dos dois campos a colagem foi feita. Colar uma coluna só continua alimentando apenas o campo onde a colagem ocorreu (comportamento anterior, preservado).
- Cada coluna é alinhada aos dias de forma independente: uma célula em branco só na coluna de geração pula a geração daquele dia sem afetar a irradiação do mesmo dia (e vice-versa) — testado colando 5 dias com a geração em branco no dia 3 e a irradiação em branco no dia 4: geração ficou em 1,2,4,5 e irradiação em 1,2,3,5, cada uma com as datas certas.
- Colar uma única linha com tabulação (1 dia só, geração e irradiação juntas) também funciona — antes só uma colagem com quebra de linha era interceptada; agora colagem de uma linha só com tabulação também é.

## Painel Principal — "Todas as usinas" (visão consolidada) (2026-09-23)

- O filtro de usina da barra superior ganhou a opção "Todas as usinas (consolidado)", **só no Painel Principal** — as demais telas (Lançamento, Manutenção etc.) trabalham sempre com uma usina, então a opção não aparece nelas e a usina que estava selecionada é preservada (novo estado `visaoConsolidada` no FiltrosContext, separado de `usinaAtivaId`). Na visão consolidada o fundo não mostra foto (não há "a" usina).
- Conteúdo: potência total; aderência à meta P50 e P90 da carteira; geração realizada (Σ), geração prevista PVsyst (Σ, cada usina com a sua curva de degradação), aderência à previsão e PR da carteira; gráfico diário Σ realizado × Σ previsto (eixo único); tabela por usina com linha "Total da carteira" — clicar no nome abre o painel da usina.
- Cálculo: nova rota `GET /painel/consolidado?inicio&fim` (mesmo recorte de datas das abas do painel individual). Cada usina é calculada pela mesma função da aba Geração Bruta — extraída para `lib/geracaoUsina.ts` (fonte única; a rota da aba passou a usá-la, resposta idêntica, conferida contra valores já validados). A carteira soma numeradores e denominadores — nunca média de percentuais. Aderências e PR só consideram usinas com os dois lados da conta no período; as demais são listadas na tela ("sem geração lançada", "sem previsão"), nunca tratadas como zero. PR da carteira = Σ geração ÷ Σ energia teórica, só nos dias pareados (geração e irradiação) de cada usina — corrige, para esta visão, a falha do consolidado antigo de `/painel/resumo`, que dividia a geração de todos os dias pela energia teórica só dos dias pareados.
- **Anomalia de dado encontrada (não corrigida — decisão do cliente):** UFV Paratinga tem PR diário de ~99–105% em agosto e 107–353% em setembro de 2026 (ex.: 03/09, irradiação 1,668 kWh/m², PR 353%) — fisicamente impossível (PR normal ~75–85%). Indica potência DC cadastrada (7.130 kWp) menor que a real, irradiação medida em plano diferente do dos módulos (ex.: GHI em vez de POA, ou tracker) ou dias de irradiação trocados. Isso também infla o PR da carteira.

## Histórico de manutenções importado — manutencoes.csv (2026-09-23)

- Script `apps/api/prisma/importar_manutencoes_csv.ts` (simula por padrão; `--aplicar` grava; reexecutar não duplica). 29 Ordens de Serviço criadas (jun–set/2026), cada uma com registro na auditoria. Backup do banco feito antes.
- Mapeamento: Status Concluída/Em Execução/Planejada → CONCLUIDA/EM_ANDAMENTO/ABERTA; "Data" → data prevista (calendário) e, nas concluídas, também data de conclusão; prioridade MEDIA (o arquivo não tem). "Responsável" e "Local/Componente" foram para o fim da descrição: o campo de responsável da OS aponta para um usuário do sistema, e os técnicos do arquivo não são usuários — por isso a coluna Responsável do relatório fica "—" para essas OS. SKID preenchido só quando o local cita um único SKID existente na usina (Paratinga SKID 1–5, Camaçari SKID 1); os demais ficam "Usina inteira".
- Nomes do arquivo mapeados por tabela explícita: "UFV Sítio do Pescoço" → UFV Sitio Pescoço, "UFV Cercado Pedra II/III" → UFV Cerado Pedra II/III, "UFV Partinga" → UFV Paratinga.
- Correções confirmadas pelo cliente: as OS "INSPEÇÃO CASQUILHOS QUEBRADOS" (04/09) e "INSPEÇÃO CORRETIVA - TRACKERS BRAMETAL" (19/08), marcadas como Cerado Pedra I no arquivo, foram gravadas em **UFV Pedro Canário** (texto e local indicam Pedro Canário); o chamado "Ticket: 273627 - SG250HX" teve a data "0026-05-17" gravada como 17/05/2026.
- Gravado como veio, para o cliente revisar: "MANUTENÇÃO PREVENTIVA - GERAL" da Cerado Pedra III (07/08) está "Planejada" (ABERTA) no arquivo, mas a descrição diz "ATIVIDADES REALIZADAS"; "INV4 - PROBLEMA INTERNO" (Sítio do Pescoço, 25/08) cita "No dia 25/05" no texto.
- Não gerado: eventos de indisponibilidade a partir dos horários citados nos textos (ex.: "SKID1 desligado das 7:50 às 15:35") — exigiria interpretar texto livre; a aba Disponibilidade continua dependendo dos eventos lançados.

## Administração — Restaurar backup pela interface; versão 0.2.0 (2026-09-23)

- Nova seção "Restaurar backup" na tela Administração (só ADMIN). Aceita o .zip do "Gerar e baixar backup" (troca banco **e** pasta de fotos) ou só um arquivo de banco .db (troca só o banco; fotos mantidas). Limite de 500 MB. Exige digitar RESTAURAR. Objetivo principal: levar os dados do computador local para o servidor sem scp.
- Validações antes de tocar em qualquer coisa: arquivo é .zip com banco.db ou SQLite válido; `PRAGMA integrity_check` = ok; toda tabela e coluna do sistema atual existe no banco enviado (backup de versão mais antiga é recusado, listando o que falta); há ao menos um administrador ativo. Caminhos dentro do .zip são confinados à pasta uploads.
- Backup de segurança automático: antes da troca, o estado atual é salvo em `apps/api/backups/antes_da_restauracao_<data>.zip` (mesmo formato do backup, portanto restaurável pela mesma tela para desfazer). A tela lista esses arquivos com botão Baixar. Pasta fora do git.
- Troca do banco com o sistema no ar: desconecta o Prisma, apaga journal/WAL do banco antigo (seriam aplicados ao novo), copia para um arquivo provisório e renomeia sobre o banco. Registro de auditoria "Restauracao" gravado no banco restaurado. Depois da restauração o administrador entra novamente.
- A geração do .zip passou para `lib/backup.ts` (fonte única da tela, do backup de segurança e do novo comando `npm run backup -- [pasta]` em apps/api).
- nginx em produção: a rota `/api/admin/restauracao` precisa de `client_max_body_size` maior (510m) — ver Parte 6 do docs/DEPLOY_HOSTINGER.md. Com o limite geral de 12m o envio é recusado pelo nginx (erro 413).
- Testado numa cópia isolada do banco (instância separada da API): restauração por .zip e por .db, recusa sem confirmação, arquivo inválido, .zip sem banco.db, banco sem tabela do sistema e banco sem administrador ativo; contagens de dados iguais antes/depois. Cópia e backups de teste apagados.
- Versão do sistema: 0.1.0 → 0.2.0.