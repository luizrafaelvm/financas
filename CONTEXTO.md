# CONTEXTO — Dashboard Financeiro · Rafael Maluf
> Arquivo de referência para o Claude Code. Leia este arquivo antes de qualquer alteração no projeto.

---

## 1. O QUE É ESTE PROJETO

Dashboard financeiro pessoal single-page (`index.html`) hospedado no GitHub Pages.
Sem backend. Sem Node. Sem build tools. Tudo roda no browser.

- **URL pública:** `https://luizrafaelvm.github.io/financas/`
- **Repositório:** `https://github.com/luizrafaelvm/financas`
- **Arquivo principal:** `index.html` (único arquivo — CSS, HTML e JS embutidos)

---

## 2. STACK TÉCNICA

| Camada | Tecnologia | Observação |
|---|---|---|
| Hospedagem | GitHub Pages | Branch `main`, pasta raiz |
| Autenticação | MSAL.js v2.38 (CDN) | OAuth2 com Microsoft Entra ID |
| Banco de dados | Excel no OneDrive | Leitura e escrita via Microsoft Graph API |
| Gráficos | Chart.js v4.4 (CDN) | Donut, área, barras |
| Fontes | DM Sans + DM Mono | Google Fonts |
| PDF export | jsPDF (CDN) | Fase 6 |
| Excel export | SheetJS (CDN) | Fase 6 |

### CDNs em uso
```
MSAL:    https://alcdn.msauth.net/browser/2.38.0/js/msal-browser.min.js
Charts:  https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js
jsPDF:   https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
SheetJS: https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
Fonts:   https://fonts.googleapis.com/css2?family=DM+Sans:...&family=DM+Mono:...
```

**Regra absoluta:** nunca adicionar dependências fora dessas CDNs. Sem npm, sem webpack, sem bundlers.

---

## 3. CREDENCIAIS AZURE (já embutidas no index.html)

```javascript
CLIENT_ID  = 'a68a8517-a38f-42a2-b487-02945681c354'
TENANT_ID  = '5c9eb6f9-84b8-49fc-a9f4-3f00f62dfe78'
REDIRECT   = 'https://luizrafaelvm.github.io/financas/'
SCOPES     = ['User.Read', 'Files.ReadWrite']
```

App registrado no Azure como **SPA (Single Page Application)**.
Permissões Microsoft Graph delegadas: `User.Read` + `Files.ReadWrite`.

---

## 4. ARQUIVO EXCEL — FONTE DE DADOS

**Localização no OneDrive:** `/Financeiro/financas-rafael.xlsx`

O dashboard busca o arquivo nesta sequência:
1. `localStorage` (cache do `fileId`)
2. Path `/me/drive/root:/Financeiro/financas-rafael.xlsx`
3. Search por nome `financas-rafael.xlsx`

### 4.1 Aba `Lançamentos` — transações (NÃO renomear esta aba)

Colunas **A–H são bloqueadas** — vêm do arquivo `GastosCartao.xlsx` automaticamente. **Nunca alterar a lógica que lê ou escreve essas colunas.**

| Col | Nome | Formato | Observação |
|---|---|---|---|
| A | Date | `"22/05"` | DD/MM **sem ano** — ano vem da coluna N |
| B | Time | `"12h51"` | Separado da data |
| C | Descricao | texto | Usado para categorização automática |
| D | Valor | `"110,80"` | **Texto com vírgula decimal**, sempre positivo |
| E | Cartao | `2812` ou `4141` | Inteiro — ambos mapeiam para `itau-cartao` |
| F | Latitude | float | Dado geográfico, não usado pelo dashboard |
| G | Longitude | float | Dado geográfico, não usado pelo dashboard |
| H | Obs | texto | Observação livre, geralmente vazia |

Colunas **I–O são preenchidas pelo dashboard:**

| Col | Nome | Valores possíveis |
|---|---|---|
| I | Tipo (receita/despesa) | `receita` / `despesa` / `transferência` |
| J | Categoria (auto) | ver tabela de categorias |
| K | Subcategoria | nível 2 de categorização |
| L | Conta | `itau-cartao` / `itau-corrente` / `nubank` |
| M | Origem | `cartao-automatico` / `manual` / `ofx-import` / `csv-import` |
| N | MesAno | `YYYY-MM` ex: `"2025-06"` — **obrigatório para reconstruir o ano** |
| O | ID_NF | ID da nota fiscal (dado externo) |

Coluna **P** reservada para ID interno do dashboard (auto-incremento).

### Quirks críticos de parsing
- **Coluna D:** converter `"110,80"` → `110.80` (trocar vírgula por ponto, ignorar pontos de milhar)
- **Coluna A sem ano:** reconstruir data completa com `colA + colN` → `"22/05" + "2025-05"` → `2025-05-22`
- **Linha 2 vazia:** existe uma linha em branco entre o cabeçalho e os dados — ignorar silenciosamente
- **Coluna E:** números 2812 e 4141 são ambos cartão Itaú → sempre mapear para `"itau-cartao"`

### 4.2 Aba `Metas`
| Coluna | Tipo |
|---|---|
| Categoria | texto |
| Teto Mensal | número |
| Alerta em % | número (padrão 80) |

### 4.3 Aba `Configurações`
| Chave | Tipo |
|---|---|
| renda_mensal_estimada | número |
| nome_usuario | texto |
| moeda | texto (`BRL`) |

As abas `Metas` e `Configurações` são criadas automaticamente pelo dashboard no primeiro acesso se não existirem.

---

## 5. DESIGN SYSTEM (não alterar sem instrução explícita)

```css
--green:  #30D158   /* receitas, saldo positivo — igual Apple Wallet */
--red:    #FF453A   /* despesas, alertas críticos */
--yellow: #FFD60A   /* alertas de atenção */
--blue:   #0A84FF   /* ações, interativos */
--purple: #BF5AF2   /* categoria Lazer */
--orange: #FF9F0A   /* categoria Alimentação */
--gray:   #8E8E93   /* texto secundário */
--bg:     #000000   /* fundo absoluto — nunca gradiente no body */
--bg2:    #111111   /* sidebar */
--bg3:    #1C1C1E   /* cards internos, modais */
--card:   rgba(255,255,255,0.055)  /* glassmorphism */
--border: rgba(255,255,255,0.09)   /* bordas dos cards */
```

**Fontes:** `DM Sans` (corpo) + `DM Mono` (valores monetários e números)

**Cards:** `border-radius: 20px`, `backdrop-filter: blur(20px)`, `box-shadow: 0 8px 32px rgba(0,0,0,0.6)`

**Cartões estilo Wallet:**
- Itaú Cartão: `linear-gradient(135deg, #E67E22, #D35400)`
- Nubank: `linear-gradient(135deg, #6C3483, #8E44AD)`

**Layout:**
- Desktop: sidebar de 64px (só ícones) + área principal
- Mobile (≤640px): bottom navigation bar com 5 ícones

---

## 6. PERFIL DO RAFAEL (contexto para o Assistente IA)

- Advogado, sócio da **RMaluf Law**
- Pai de duas filhas (pensão alimentícia ativa para ambas)
- Recebe pró-labore via **Nubank**
- Gastos do dia a dia via **Itaú cartão** (dois cartões: 2812 e 4141)

### Regras absolutas para o Assistente IA
| Categoria | Regra |
|---|---|
| Saúde / Medicamentos | **NUNCA** classificar como supérfluo. Inclui antidepressivos. |
| Filhas / Pensão | Obrigação legal — **nunca** sugerir redução |
| Moradia / Financiamento | Obrigação contratual — **nunca** sugerir corte |
| Saúde / Terapia | Essencial para saúde mental — sem julgamento |

---

## 7. CATEGORIAS E CORES

| Categoria | Cor hex | Tipo | Subcategorias |
|---|---|---|---|
| Moradia | `#0A84FF` | Essencial | Financiamento, Condomínio, IPTU, Reformas |
| Filhas | `#30D158` | Essencial | Pensão Filha 1, Pensão Filha 2, Educação |
| Saúde | `#FF453A` | Essencial | Medicamentos, Consultas, Plano de Saúde, Terapia |
| Alimentação | `#FF9F0A` | Misto | Supermercado, Delivery, Restaurante |
| Transporte | `#64D2FF` | Misto | Aplicativo, Combustível, Estacionamento |
| Lazer | `#BF5AF2` | Supérfluo | Streaming, Eventos, Bares, Esporte |
| Vestuário | `#FF6B6B` | Supérfluo | Roupas, Calçados, Acessórios |
| Assinaturas | `#FFD60A` | Supérfluo | Software, Serviços Digitais |
| Financiamentos | `#FF6830` | Essencial | Parcelas, Seguros |
| Compras Online | `#FF7043` | Variável | Marketplace |
| Receitas | `#30D158` | Receita | Pró-labore, Honorários |
| Outros | `#8E8E93` | — | Não categorizado |

**Essenciais (protegidos):** `['Moradia', 'Filhas', 'Saúde', 'Financiamentos']`
**Supérfluos (analisáveis):** `['Lazer', 'Vestuário', 'Assinaturas']`

---

## 8. REGRAS DE CATEGORIZAÇÃO AUTOMÁTICA (palavras-chave)

O dashboard usa estas regras em ordem de prioridade. A primeira match ganha.

```javascript
const REGRAS = [
  // Saúde
  {kw:['PAGUE MENOS','DROGASIL','ULTRAFARMA','DROGA RAIA','FARMACIA','DROGARIA','PACHECO','RAIA'], cat:'Saúde', sub:'Medicamentos'},
  {kw:['CONSULTA','CLINICA','DR ','DRA ','MEDICO','HOSPITAL','LABORATORIO','EXAME','RDSAUDE'],     cat:'Saúde', sub:'Consultas'},
  {kw:['UNIMED','AMIL','SULAMERICA','HAPVIDA'],                                                    cat:'Saúde', sub:'Plano de Saúde'},
  // Filhas
  {kw:['PENSAO','PENSÃO','ALIMENTOS'],                                     cat:'Filhas',        sub:'Pensão'},
  {kw:['ESCOLA','COLEGIO','COLÉGIO','MATERIAL ESCOLAR'],                   cat:'Filhas',        sub:'Educação'},
  // Moradia
  {kw:['FINANCIAMENTO','PRESTACAO IMOVEL','CAIXA ECONOMICA HABIT'],        cat:'Moradia',       sub:'Financiamento'},
  {kw:['CONDOMINIO','CONDOMÍNIO'],                                          cat:'Moradia',       sub:'Condomínio'},
  {kw:['IPTU','PREFEITURA'],                                                cat:'Moradia',       sub:'IPTU'},
  {kw:['CELSO FLIPER','LIONASSISTENCIA'],                                   cat:'Moradia',       sub:'Manutenção'},
  {kw:['TINTA'],                                                            cat:'Moradia',       sub:'Reforma'},
  // Alimentação
  {kw:['IFOOD','RAPPI','UBER EATS','JAMES DELIVERY'],                       cat:'Alimentação',   sub:'Delivery'},
  {kw:['CARREFOUR','EXTRA','PAO DE ACUCAR','HORTIFRUTI','ATACADAO','ASSAI','SUPERMERCADO','ZAFFARI','OBA HORTI','MERCADOCAR'], cat:'Alimentação', sub:'Supermercado'},
  {kw:['RESTAURANTE','LANCHONETE','PIZZARIA','SUSHI','HAMBURGER','CHURRASCARIA','BURGER KING','PADARIA','EMPANADA','BODEGA','FAFRE','PUPORK'], cat:'Alimentação', sub:'Restaurante'},
  // Transporte
  {kw:['UBER','99APP','99POP','CABIFY','MOVIDA'],                           cat:'Transporte',    sub:'Aplicativo'},
  {kw:['POSTO','COMBUSTIVEL','GASOLINA','SHELL','IPIRANGA'],                cat:'Transporte',    sub:'Combustível'},
  {kw:['ESTACIONAMENTO','PARKING','PARK','REK PARKING'],                    cat:'Transporte',    sub:'Estacionamento'},
  // Lazer
  {kw:['NETFLIX','SPOTIFY','GLOBOPLAY','DISNEY','HBO','AMAZON PRIME','APPLE TV','YOUTUBE PREMIUM'], cat:'Lazer', sub:'Streaming'},
  {kw:['CINEMA','TEATRO','SHOW','INGRESSO','TICKETMASTER','EVENTIM','INTI*TEATRO'],                  cat:'Lazer', sub:'Eventos'},
  {kw:['BAR ','BALADA','NIGHT','BLACK DOGS','BLUE HOUSE'],                                           cat:'Lazer', sub:'Bares'},
  {kw:['DECATHLON','MIMIC'],                                                                          cat:'Lazer', sub:'Esporte'},
  {kw:['GRUPO ESPIRITA','LIVRARIA'],                                                                  cat:'Lazer', sub:'Cultura'},
  // Assinaturas
  {kw:['MICROSOFT','ADOBE','DROPBOX','GOOGLE ONE','ICLOUD','LINKEDIN','OPENAI','ANTHROPIC'],         cat:'Assinaturas', sub:'Software'},
  {kw:['ASAAS'],                                                                                      cat:'Assinaturas', sub:'Serviço Digital'},
  // Vestuário
  {kw:['ZARA','H&M','RENNER','C&A','RIACHUELO','HERING','FARM','AREZZO','BEFIX','DAISO'],            cat:'Vestuário',   sub:'Roupas'},
  // Receitas
  {kw:['PRO-LABORE','PROLABORE','HONORARIOS','HONORÁRIOS','TED RECEBIDA','PIX RECEBIDO'],            cat:'Receitas',    sub:'Pró-labore'},
  // Marketplace
  {kw:['MERCADOLIVRE','MERCADOL','AMAZONMKTPLC','AMAZON','TOPCANDYD'],                               cat:'Compras Online', sub:'Marketplace'},
  // Financiamentos
  {kw:['PRUDENT','APOL'],                                                                             cat:'Financiamentos', sub:'Seguro'},
];
```

Estas regras são **editáveis pelo usuário** na seção Configurações do dashboard.

---

## 9. SEÇÕES DO DASHBOARD

| # | Seção | ID no HTML | Status |
|---|---|---|---|
| 1 | 🏠 Visão Geral | `sec-home` | ✅ Implementado |
| 2 | 📋 Lançamentos | `sec-lancamentos` | ✅ Implementado |
| 3 | 📊 Análise por Categoria | `sec-analise` | ✅ Implementado |
| 4 | 🔍 Diagnóstico | `sec-diagnostico` | ✅ Implementado |
| 5 | 🎯 Metas | `sec-metas` | ✅ Implementado |
| 6 | 📥 Importar | `sec-importar` | ✅ Multi-arquivo OFX/CSV/XLSX + Notas Fiscais IA |
| 7 | 🤖 Assistente IA | `sec-assistente` | ✅ Claude Sonnet |
| 8 | ⚙️ Configurações | `sec-configuracoes` | ✅ Implementado |

---

## 10. FLUXO DE DADOS (como o dashboard funciona)

```
Login Microsoft (MSAL.js)
        ↓
getToken() → accessToken
        ↓
findFile() → busca financas-rafael.xlsx no OneDrive
        ↓
ensureSheet() → cria Metas e Configurações se não existirem
        ↓
getSheetValues('Dados') → lê aba Dados
        ↓
parseDados() → converte raw[][] em objetos JS:
  - Ignora linha 2 (vazia)
  - Converte D "110,80" → 110.80
  - Reconstrói data: colA + colN → Date object
  - Mapeia colE (2812/4141) → "itau-cartao"
  - Auto-categoriza pela descricao (colC) se colJ estiver vazia
        ↓
S.transactions[] → estado global em memória
        ↓
renderAll() → atualiza todos os componentes visuais
```

**Escrita (novo lançamento):**
```
Modal preenchido pelo Rafael
        ↓
saveLancamento()
        ↓
appendRow(SHEET_DADOS, [...]) → Graph API PATCH
        ↓
S.transactions.push(...) → atualiza memória local
        ↓
renderAll() → atualiza UI sem recarregar página
```

---

## 11. ESTADO GLOBAL (`S`)

```javascript
const S = {
  token:        null,          // Bearer token Microsoft Graph
  fileId:       null,          // ID do Excel no OneDrive (cacheado em localStorage)
  transactions: [],            // Array de objetos de transação parseados
  metas:        {},            // { 'Alimentação': { teto: 800, alerta: 80 }, ... }
  config:       {},            // { renda_mensal_estimada: 15000, ... }
  mesAtual:     'YYYY-MM',     // Mês em exibição (ex: '2025-06')
  importBuffer: [],            // Transações lidas de OFX/CSV aguardando confirmação
  chatHistory:  [],            // Histórico de mensagens do assistente IA
  charts:       {}             // Instâncias Chart.js (para destroy antes de recriar)
}
```

**localStorage usado:**
- `rfm_file_id` — ID do Excel (evita busca repetida)
- `rfm_claude_key` — API Key do Claude (nunca enviada ao servidor)

---

## 12. FASES DO PROJETO

| Fase | Descrição | Status |
|---|---|---|
| 0 | Setup Azure + GitHub Pages | ✅ Concluído |
| 1 | Visual completo com dados mock | ✅ Concluído |
| 2 | Autenticação Microsoft + leitura OneDrive | ✅ Implementado no index.html atual |
| 3 | Entrada manual + categorização + escrita Excel | ✅ Implementado |
| 4 | Gráficos e análises (Chart.js) | ✅ Implementado |
| 5 | Assistente IA (Claude Sonnet) | ✅ Implementado |
| 6 | Export PDF/Excel + parser PDF extrato | 🔄 Em andamento |

### Fase 6 — próximos aprimoramentos planejados
- Exportar relatório mensal em PDF (jsPDF)
- Exportar lançamentos em Excel (SheetJS)
- Parser de extrato PDF do Itaú (PDF.js)
- Lançamentos parcelados (repetir N meses automaticamente)
- Edição inline de categoria diretamente na tabela de lançamentos
- Regras de categorização editáveis na interface (Configurações)
- Histórico de cumprimento de metas (3 meses)
- Gráfico de barras: evolução de categoria nos últimos 6 meses
- Comparativo mês atual vs. mês anterior

---

## 13. CONVENÇÕES DO CÓDIGO

- **Função de formatação BRL:** `fmtBRL(valor)` → `"R$ 1.234,56"`
- **Formatação de data:** `fmtData(date)` → `"22/05/2025"`
- **Label de mês:** `mesAnoLabel('2025-05')` → `"Mai 2025"`
- **Parsing de valor BR:** `parseValorBR("110,80")` → `110.80`
- **Reconstrução de data:** `reconstructDate("22/05", "2025-05")` → `Date`
- **Categorização:** `categorizar("NETFLIX.COM")` → `{ cat: 'Lazer', sub: 'Streaming' }`
- **Transações do mês:** `txsMes('2025-05')` → array filtrado
- **Resumo do mês:** `resumoMes('2025-05')` → `{ receitas, despesas, saldo, renda, comprometimento, maiorGasto }`
- **Charts:** sempre chamar `destroyChart('key')` antes de criar novo Chart.js

---

## 14. GRAPH API — ENDPOINTS USADOS

```
GET  /me/drive/root:/Financeiro/financas-rafael.xlsx     → localizar arquivo
GET  /me/drive/items/{fileId}                            → verificar se fileId ainda válido
GET  /me/drive/root/search(q='financas-rafael.xlsx')     → busca por nome (fallback)
GET  /me/drive/items/{fileId}/workbook/worksheets/{aba}/usedRange  → ler dados
PATCH /me/drive/items/{fileId}/workbook/worksheets/{aba}/range(address='A5:P5')  → escrever linha
POST  /me/drive/items/{fileId}/workbook/worksheets       → criar nova aba
```

Token renovado silenciosamente via `acquireTokenSilent()`. Em caso de falha, redireciona para `acquireTokenRedirect()`.

---

## 15. REGRAS PARA O CLAUDE CODE

1. **Nunca editar index.html para adicionar lógica** — toda lógica nova vai no arquivo .js correspondente
2. **Nunca fragmentar o index.html** com blocos `<script>` inline — usar apenas `<script src="js/...">` externos
2. **Nunca alterar as colunas A–H** do Excel nem a lógica que as lê
3. **Nunca adicionar dependências fora das CDNs listadas no item 2**
4. **Sempre destruir instâncias Chart.js antes de recriar** (`destroyChart()`)
5. **Manter o design system** — não alterar cores, fontes ou bordas sem instrução
6. **Comentar seções novas** com blocos `/* === NOME === */`
7. **Testar parsing de valor:** a coluna D vem como texto `"110,80"` — nunca assumir número
8. **Preservar o sistema de autenticação** — não refatorar MSAL sem instrução explícita
9. **Regras de categorização** são o coração do sistema — adicionar sempre ao array `REGRAS`, nunca substituir
10. **Gastos de Saúde, Filhas e Moradia** jamais devem aparecer como supérfluos em nenhum cálculo

---

## 16. RECURSOS IMPLEMENTADOS PÓS-FASE 3

### syncGastosCartao()
- Busca GastosCartao.xlsx em /Financeiro/GastosCartao.xlsx automaticamente
- Chamada silenciosa durante loadAllData() e no botão Re-sincronizar
- Deduplica por Date+Descricao+Valor+Cartao antes de gravar
- Processa em chunks de 500 linhas para não travar o browser
- Grava na aba Dados em lotes de 50 via appendRow()
- Cache do fileId em localStorage('rfm_gastoscartao_id')
- Inferência de ano por sequência cronológica com S.gastosCartaoAnoBase
- Feedback via showToast() no canto inferior direito

### Seção Importar — três blocos
- Bloco A: OFX/CSV múltiplos simultâneos (parseOFX + parseCSV existentes)
- Bloco B: XLSX de outros cartões/bancos com detecção automática de colunas
  - Modal de mapeamento manual se detecção falhar (id="modal-mapeamento")
  - Parser: parseXLSXExterno() usando SheetJS global XLSX
- Bloco C: Notas fiscais JPG/PNG/PDF com análise via Claude API
  - Grade de thumbnails com preview de imagem ou ícone PDF
  - Análise IA: PROMPT_NF → JSON com itens, valores unitários e totais
  - Vinculação manual ou automática (heurística nome+valor) ao lançamento
  - Grava observação na coluna H (Obs) da aba Dados via PATCH
  - Badge "✓ Vinculado" após confirmação

### Globals adicionados
- window.nfBuffer = []           — notas fiscais pendentes
- window.mapeamentoPendente = null — callback do modal de mapeamento
- const PROMPT_NF               — prompt estruturado para extração de NF
- S.gastosCartaoAnoBase         — ano base para inferência (padrão: ano atual - 3)

### CDN adicionado
SheetJS: https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js

### Aba Recorrentes
- Criada automaticamente no primeiro acesso
- Colunas: ID, Descricao, Categoria, Subcategoria, Conta, Tipo,
  Valor, DiaVencimento, Variavel (sim/nao), Ativo, Observacao,
  UltimoValor, UltimoPagamento
- Recorrentes fixos: Variavel = 'nao', Valor fixo mensal
- Recorrentes variáveis: Variavel = 'sim', Valor = média histórica
- parseRecorrentes() em data.js
- detectarRecorrentes() detecta padrões nos últimos 3 meses
- salvarRecorrente() e atualizarRecorrente() em graph.js

---

## 17. ESTRUTURA DE ARQUIVOS (pós-modularização)

```
index.html        — HTML estrutural puro (~500 linhas)
css/app.css       — Todo o design system e estilos
js/config.js      — Constantes, estado S, REGRAS, PROMPT_NF
js/data.js        — Parsing, cálculos, utilitários
js/graph.js       — Microsoft Graph API, OneDrive, syncGastosCartao
js/auth.js        — MSAL, login, loadAllData (ponto de entrada)
js/render.js      — Renderização de todas as seções e gráficos
js/importar.js    — OFX, CSV, XLSX, notas fiscais, preview
js/ui.js          — Modais, formulários, chat IA, exportações
```

### Ordem de carregamento (crítica)
CDNs → config → data → graph → render → ui → importar → auth

### Como editar no futuro
- Novo estilo visual:          `css/app.css`
- Nova regra de categorização: `js/config.js`  (array REGRAS)
- Bug na API do OneDrive:      `js/graph.js`
- Novo gráfico ou seção:       `js/render.js`
- Melhoria na importação:      `js/importar.js`
- Novo modal ou formulário:    `js/ui.js`
- Problema de login:           `js/auth.js`
