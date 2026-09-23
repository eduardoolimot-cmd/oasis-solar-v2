# Design System — Velzon (Admin & Dashboard Template)
Fonte analisada: `themesbrand.com/velzon/html/default/dashboard-analytics.html` (layout vertical, tema claro, topbar escura, sidebar com gradiente `gradient-4`)

---

## 1. Paleta de Cores

### Cores de marca (brand)
| Papel | Nome interno | HEX | RGB |
|---|---|---|---|
| Primária (Primary) | `--vz-primary` | `#405189` | 64, 81, 137 |
| Secundária (Secondary) | `--vz-secondary` | `#3577f1` | 53, 119, 241 |
| Sucesso (Success) | `--vz-success` | `#0ab39c` | 10, 179, 156 |
| Info | `--vz-info` | `#299cdb` | 41, 156, 219 |
| Alerta (Warning) | `--vz-warning` | `#f7b84b` | 247, 184, 75 |
| Perigo (Danger) | `--vz-danger` | `#f06548` | 240, 101, 72 |

### Escala de cores base (Bootstrap-like)
| Nome | HEX |
|---|---|
| Blue | `#3577f1` |
| Indigo | `#405189` |
| Purple | `#6559cc` |
| Pink | `#f672a7` |
| Red | `#f06548` |
| Orange | `#f1963b` |
| Yellow | `#f7b84b` |
| Green | `#0ab39c` |
| Teal | `#02a8b5` |
| Cyan | `#299cdb` |

### Neutros (grayscale)
| Token | HEX | Uso |
|---|---|---|
| `--vz-light` / gray-100 | `#f3f6f9` | Fundos suaves, hover de linhas de tabela |
| gray-200 | `#eff2f7` | Divisores leves |
| gray-300 | `#e9ebec` | Bordas de cards/inputs |
| gray-400 | `#ced4da` | Bordas de inputs inativos |
| gray-500 | `#adb5bd` | Placeholder, ícones inativos |
| `--vz-gray` / gray-600 | `#878a99` | Texto secundário/legenda |
| gray-700 | `#495057` | Texto de ícones do header |
| gray-800/900 (`--vz-dark`) | `#343a40` / `#212529` | Texto principal (body color) |
| Branco | `#ffffff` | Cards, topbar de conteúdo, texto sobre fundo escuro |

### Fundo e destaque
- **Fundo geral da aplicação (body):** `#f3f3f9` (lilás muito claro, praticamente cinza-azulado)
- **Fundo de cards:** `#ffffff`
- **Topbar (cabeçalho horizontal):** `#405189` (dark, `data-topbar="dark"`), texto branco/ícones brancos com opacidade
- **Campo de busca da topbar:** `rgba(255,255,255,0.05)` sobre o fundo escuro, texto branco
- **Sidebar (menu vertical):** gradiente linear `linear-gradient(to right, #1a1d21, #405189)` — de um cinza quase preto (`#1a1d21`) até o indigo primário (`#405189`) — variante "gradient-4"
- **Cores de destaque em gráficos/mapas (accent):** azul `#3577f1`, vermelho/coral `#f06548` (usado para destacar um item fora do padrão, ex. barra "Russia"), verde `#0ab39c`, teal `#02a8b5`

### Cores "soft" (fundo suave + texto colorido) — padrão de badges/botões soft
Fórmula: fundo = cor a ~12–15% de opacidade sobre branco, texto = cor sólida.
- Soft secondary: fundo `#e1ebfd` / texto `#3577f1`
- Badge de crescimento positivo (soft success): fundo `#f3f6f9` / texto `#0ab39c`
- Badge de queda (soft danger): mesmo padrão com `#f06548`

---

## 2. Tipografia

- **Fonte principal:** `"Poppins", sans-serif` (Google Font) — usada em toda a interface, títulos e corpo.
- **Fonte monoespaçada:** `SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` (código/dados tabulares específicos).

### Tamanho base e escala
- **Tamanho base do body:** `0.8125rem` (~13px) — bem menor que o padrão de 16px, característico de dashboards densos.
- **Peso base do texto:** 400 (Regular).
- **Line-height base:** 1.5.
- **Cor do texto padrão:** `#212529`.

### Hierarquia observada (tamanhos computados)
| Elemento | Tamanho | Peso | Cor |
|---|---|---|---|
| Título de página (ex. "ANALYTICS") | ~14–16px, uppercase, letter-spacing leve | 600–700 | `#212529` |
| Título de card (`.card-title`) | ~14–15px | 600 | `#212529` |
| Número KPI grande (ex. "28.05k") | ~22–24px | 600–700 (semibold/bold) | `#212529` |
| Legenda/label secundário (ex. "Users", "Sessions") | 13px | 500 (medium) | `#878a99` |
| Badge/variação percentual | ~9.75px | 600 (semibold) | cor semântica (verde/vermelho) |
| Botão padrão | 13px | 400 | conforme variante |
| Botão pequeno (`.btn-sm`) | ~11.4px | 400 | conforme variante |
| Item de menu lateral | 15px | 400 (500 quando ativo) | branco / branco translúcido |

**Padrão geral:** pesos usados são 400 (texto corrido), 500 (labels secundários) e 600 (títulos, números de destaque, badges) — sem uso de 700/800 de forma proeminente. Títulos de seção do menu ("MENU", "PAGES", "COMPONENTS") ficam em caixa alta, tamanho pequeno (~11px), letter-spacing aumentado, cor acinzentada translúcida.

---

## 3. Espaçamento e Layout

### Grid / estrutura
- **Largura da sidebar:** `250px` (padrão "lg"); versões reduzidas: `180px` (md) e `70px` (sm/collapsed).
- **Altura da topbar:** `71px`, fixa (`position: fixed`), com `margin-left` do conteúdo principal igual à largura da sidebar (`250px`).
- **Layout:** vertical (sidebar fixa à esquerda + topbar fixa no topo), `data-layout-width="fluid"` (conteúdo ocupa 100% da largura restante, sem container centralizado).
- **Grid de cards:** sistema de colunas Bootstrap (12 colunas), gap padrão entre cards de ~24px (`1.5rem`).

### Padding / Margens
- **Padding interno de card-header:** `16px` (1rem).
- **Padding interno de card-body:** tipicamente `16–24px` (1–1.5rem), variável por card.
- **Padding de botão padrão:** `8px 14.4px` (0.5rem 0.9rem aprox.).
- **Padding de botão pequeno (`.btn-sm`):** `4px 8px`.
- **Padding de item de menu:** vertical ~10px, horizontal ~20px.

### Border-radius (escala completa)
| Token | Valor |
|---|---|
| `--vz-border-radius-sm` | `0.2rem` (~3.2px) |
| `--vz-border-radius` (padrão) | `0.25rem` (4px) — usado em cards, inputs, botões, badges |
| `--vz-border-radius-lg` | `0.3rem` (~4.8px) |
| `--vz-border-radius-xl` | `1rem` (16px) |
| `--vz-border-radius-xxl` / `2xl` | `2rem` (32px) |
| `--vz-border-radius-pill` | `50rem` — usado em botões "pill" (ex. badge "how to setup") |

O padrão dominante é um raio pequeno e discreto (4px), reforçando a linguagem visual "flat/enterprise" típica de dashboards administrativos, com pílulas reservadas para badges e botões de destaque secundário.

---

## 4. Componentes

### Botões
- **Primário (`.btn-primary`):** fundo `#405189`, texto branco, `border-radius: 4px` (efetivamente ~3.2px computado), sem sombra visível em repouso, padding compacto.
- **Sucesso/CTA (ex. "Upgrade Account!"):** fundo `#0ab39c`, texto branco, `border-radius: 4px`, `box-shadow: none`, padding `8px 14px`.
- **Soft buttons (`.btn-soft-*`):** fundo em tom claro da cor (ex. `#e1ebfd` para secondary), texto na cor sólida correspondente (`#3577f1`), frequentemente combinados com `rounded-pill`.
- **Botões de ícone do header** (busca, apps, tela cheia, dark mode, notificações): sem fundo (`transparent`), ícone em `#495057` (light) ou branco translúcido (dark topbar), fundo hover em `rgba(53,119,241,0.12)`.

### Cards
- Fundo branco (`#ffffff`) sobre o body cinza-lilás (`#f3f3f9`) — contraste sutil que já separa os blocos sem precisar de bordas fortes.
- `border-radius: 4px`.
- `box-shadow: 0 1px 2px rgba(56, 65, 74, 0.15)` — sombra bem sutil, quase um "flat design com profundidade mínima".
- Sem borda visível por padrão (`border: 0`), a separação é feita só por sombra + fundo.
- `.card-header` com `border-bottom: 1px solid #e9ebec` e padding de 16px.

### Inputs / campos de formulário
- Campo de busca da topbar: fundo `rgba(255,255,255,0.05)` (translúcido sobre o header escuro), sem borda, `border-radius: 4px`, texto e placeholder brancos/translúcidos.
- Inputs padrão de formulário (fora da topbar): fundo branco, borda `1px solid #ced4da`, `border-radius: 4px`, mesma tipografia Poppins 13px.

### Navegação (Sidebar / Topbar)
- **Sidebar:** fundo em gradiente diagonal-horizontal do preto-acinzentado (`#1a1d21`) ao indigo (`#405189`); itens de menu em branco (`#ffffff`) com ícones à esquerda; título de seção ("MENU", "PAGES", "COMPONENTS") em caixa alta, cinza translúcido, tamanho reduzido; item ativo/hover recebe leve realce de fundo.
- **Topbar:** fundo sólido escuro `#405189` (modo "dark" independente do tema geral claro), com: botão hambúrguer, busca, seletor de idioma (bandeira), grid de apps, carrinho com badge numérico, tela cheia, alternância de dark mode, sino de notificações com badge, e bloco de perfil (avatar + nome + cargo) à direita.
- **Título de página** (`.page-title-box`): fundo branco, abaixo da topbar, com `box-shadow: 0 1px 2px rgba(56,65,74,0.15)`, contendo título em caixa alta à esquerda e breadcrumb à direita.

### Badges
- Numéricos/notificação (ex. "5", "3"): pequenos círculos cheios com cor sólida (azul info / vermelho danger), texto branco, posicionados via `position: absolute` sobre o ícone.
- De variação percentual (ex. "↑ 16.24%"): fundo "soft" muito claro (`#f3f6f9`), texto colorido semanticamente (verde `#0ab39c` para alta, vermelho `#f06548` para queda), `font-size: ~9.75px`, `font-weight: 600`, `border-radius: 4px`, sempre acompanhado de ícone de seta.

### Sombras (box-shadow) — escala
| Token | Valor | Uso |
|---|---|---|
| `--vz-box-shadow-sm` | `0 0.125rem 0.25rem rgba(0,0,0,0.075)` | Elementos discretos |
| `--vz-box-shadow` (padrão) | `0 1px 2px rgba(56, 65, 74, 0.15)` | Cards, page-title-box |
| `--vz-box-shadow-lg` | `0 5px 10px rgba(30, 32, 37, 0.12)` | Dropdowns, popovers, elementos elevados |
| `--vz-box-shadow-inset` | `inset 0 1px 2px rgba(0,0,0,0.075)` | Estados pressionados/inset |
| Sidebar | `0 2px 4px rgba(15, 34, 58, 0.12)` | Sombra lateral do menu fixo |

---

## 5. Elementos Especiais

- **Gradiente de sidebar:** único elemento com gradiente explícito na interface — `linear-gradient(to right, #1a1d21, #405189)`, aplicado horizontalmente da esquerda (quase preto) para a direita (indigo). É uma das várias variantes de sidebar do template (gradient-1 a gradient-5); esta instância usa "gradient-4".
- **Sem animações de scroll (scroll-reveal) detectadas** — a interface é um dashboard administrativo estático baseado em Bootstrap 5, sem biblioteca de scroll-animation aparente na página analisada.
- **Micro-transições:** hovers e mudanças de estado usam transições CSS simples (opacidade/cor), sem efeitos elaborados.
- **Gráficos e mapas:** paleta de dados usa as cores da marca (azul `#3577f1` como padrão de série, vermelho `#f06548` como destaque/outlier, verde/teal em heatmaps de calendário com gradação de intensidade `0-50`, `51-100`).
- **Cartão de upsell/trial:** ilustração customizada (persona) posicionada à direita do texto, dentro de um card com fundo levemente destacado (tom pêssego/creme muito claro) para chamar atenção da barra de aviso de trial expirando — padrão de "banner de conversão" dentro do próprio grid do dashboard.
- **Dark mode:** suportado nativamente via atributo `data-bs-theme` e toggle no header (ícone de lua), independente do modo "dark" fixo da topbar/sidebar.
- **Multi-idioma:** seletor de idioma via bandeira no header (i18n pronto).

---

## Resumo técnico rápido (tokens principais)

```css
:root {
  /* Cores */
  --color-primary: #405189;
  --color-secondary: #3577f1;
  --color-success: #0ab39c;
  --color-info: #299cdb;
  --color-warning: #f7b84b;
  --color-danger: #f06548;
  --color-body-bg: #f3f3f9;
  --color-surface: #ffffff;
  --color-text: #212529;
  --color-text-muted: #878a99;
  --color-border: #e9ebec;

  /* Tipografia */
  --font-family: "Poppins", sans-serif;
  --font-size-base: 0.8125rem; /* 13px */
  --line-height-base: 1.5;

  /* Raio de borda */
  --radius-sm: 0.2rem;
  --radius-base: 0.25rem; /* 4px — padrão dominante */
  --radius-lg: 0.3rem;
  --radius-pill: 50rem;

  /* Sombra */
  --shadow-base: 0 1px 2px rgba(56, 65, 74, 0.15);
  --shadow-lg: 0 5px 10px rgba(30, 32, 37, 0.12);

  /* Layout */
  --sidebar-width: 250px;
  --topbar-height: 71px;
}
```
