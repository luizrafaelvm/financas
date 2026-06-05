# CONTEXTO — Dashboard Financeiro Rafael Maluf
> Leia este arquivo antes de qualquer edição no `index.html`.
> Mantido manualmente — atualize ao adicionar features ou mudar configurações.

---

## IDENTIDADE DO PROJETO

Dashboard financeiro pessoal de nível profissional, acessível via browser em qualquer dispositivo. Design inspirado no app Wallet do iPhone: fundo preto absoluto, glassmorphism, tipografia refinada, animações suaves. Objetivo central: identificar gastos supérfluos, essenciais e onde economizar.

**Usuário:** Rafael Maluf — advogado, sócio da RMaluf Law, Porto Alegre/RS, pai de duas filhas.

---

## INFRAESTRUTURA

| Componente | Detalhe |
|---|---|
| URL pública | `https://luizrafaelvm.github.io/financas/` |
| Repositório | `https://github.com/luizrafaelvm/financas` |
| Branch | `main` — arquivo único `index.html` na raiz |
| Hospedagem | GitHub Pages (gratuito, HTTPS automático) |
| Autenticação | Microsoft Entra ID via MSAL.js v2 |
| Banco de dados | Excel no OneDrive for Business via Microsoft Graph API |
| CDN MSAL | `https://alcdn.msauth.net/browser/2.38.0/js/msal-browser.min.js` |

### Credenciais Azure (NUNCA alterar sem confirmar com Rafael)
```
Client ID : a68a8517-a38f-42a2-b487-02945681c354
Tenant ID : 5c9eb6f9-84b8-49fc-a9f4-3f00f62dfe78
Redirect URIs (SPA):
  - https://luizrafaelvm.github.io/financas/
  - http://localhost:3000/
Permissões delegadas: User.Read, Files.ReadWrite
```

### MSAL.js — Versão e Uso Correto
- Versão: **2.38.0** (não v3 — não tem `initialize()`)
- Fluxo correto: `handleRedirectPromise()` → checar contas → redirecionar
- Cache: `localStorage`
- Token: `acquireTokenSilent()` → fallback `acquireTokenPopup()`

---

## ARQUIVOS NO ONEDRIVE

OneDrive da conta `OneDrive - RMaluf Law` (Business, não pessoal).

```
OneDrive - RMaluf Law/
└── Financeiro/
    ├── GastosCartao.xlsx   ← FONTE — READ ONLY — JAMAIS GRAVAR AQUI
    └── financas-rafael.xlsx ← DESTINO — Dashboard lê e escreve aqui
```

### GastosCartao.xlsx — colunas originais (A–H)
| Col | Nome original | Descrição |
|---|---|---|
| A | `Date` | Data da transação — formato `DD/MM` (SEM ANO) |
| B | `Time` | Hora da transação |
| C | `Merchant` | Nome do estabelecimento (= Descrição) |
| D | `Amount` | Valor (positivo = despesa) |
| E | `Card` | Últimos 4 dígitos do cartão: `2812` ou `4141` |
| F | `Latitude` | Coordenada GPS |
| G | `Longitude` | Coordenada GPS |
| H | `Obs` | Observação livre |

### financas-rafael.xlsx — estrutura completa (A–O)
Colunas A–H: **cópia exata** dos dados do GastosCartao (não alterar).  
Colunas I–O: **preenchidas pelo Dashboard** no momento da importação.

| Col | Nome | Preenchido por |
|---|---|---|
| A | `Date` | GastosCartao (DD/MM) |
| B | `Time` | GastosCartao |
| C | `Descricao` | GastosCartao (= Merchant) |
| D | `Valor` | GastosCartao (= Amount) |
| E | `Carta` | GastosCartao (= Card: 2812 ou 4141) |
| F | `Latitude` | GastosCartao |
| G | `Longitude` | GastosCartao |
| H | `Obs` | GastosCartao |
| I | `Tipo` | Dashboard: `despesa` / `receita` |
| J | `Categoria (aut` | Dashboard: auto-categorizado |
| K | `Subcategoria` | Dashboard |
| L | `Conta` | Dashboard: `itau-2812` ou `itau-4141` |
| M | `Origem` | Dashboard: `importado-gastoscartao` / `manual` |
| N | `MesAno` | Dashboard: formato `YYYY-MM` |
| O | `ID_NF` | Dashboard: referência à nota fiscal (opcional) |

**Aba:** sempre usar a **primeira aba** (auto-detectar via `/workbook/worksheets`).  
**Regra de ouro:** o Dashboard **nunca grava no GastosCartao.xlsx**.

---

## CARTÕES

| Número | Banco | Uso | Mapeamento interno |
|---|---|---|---|
| `2812` | Itaú | Compras físicas, serviços presenciais | `itau-2812` |
| `4141` | Itaú | Apps digitais: Anthropic, OpenAI, Netflix, etc. | `itau-4141` |

Gradiente do card 2812: `#E67E22 → #C0392B` (laranja Itaú)  
Gradiente do card 4141: `#1A5276 → #2471A3` (azul escuro)

---

## DATAS — FORMATO E INFERÊNCIA DE ANO

O GastosCartao armazena datas como `DD/MM` (sem ano). Regra de inferência:

```javascript
function parseDateDDMM(ddmm) {
  const [dd, mm] = String(ddmm).split('/');
  const currMM = new Date().getMonth() + 1;
  // Se mês da data > mês atual + 1, assumir ano anterior
  const year = parseInt(mm) > currMM + 1
    ? new Date().getFullYear() - 1
    : new Date().getFullYear();
  return `${year}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
}

function getMesAnoFromDDMM(ddmm) {
  const [dd, mm] = String(ddmm).split('/');
  const currMM = new Date().getMonth() + 1;
  const year = parseInt(mm) > currMM + 1
    ? new Date().getFullYear() - 1
    : new Date().getFullYear();
  return `${year}-${mm.padStart(2,'0')}`;
}
```

---

## GRAPH API — PADRÕES DE USO

```javascript
// Autenticar e chamar a Graph API
async function gFetch(method, path, body) {
  const token = await getToken(); // acquireTokenSilent → popup
  const h = { Authorization: `Bearer ${token}` };
  if (body) h['Content-Type'] = 'application/json';
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method, headers: h, body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`Graph ${res.status}`);
  return res.headers.get('Content-Type')?.includes('json') ? res.json() : null;
}

// Localizar arquivo por caminho
async function getFileId(relativePath) {
  const r = await gFetch('GET', `/me/drive/root:/${relativePath}`);
  return r?.id;
}

// Detectar primeira aba do Excel
async function getPrimeiraAba(fileId) {
  const r = await gFetch('GET', `/me/drive/items/${fileId}/workbook/worksheets`);
  return r.value[0].name;
}

// Ler dados (usedRange retorna values como array 2D)
async function lerUsedRange(fileId, sheetName) {
  return gFetch('GET',
    `/me/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(sheetName)}/usedRange`
  );
}

// Adicionar linha ao final
async function appendRow(fileId, sheetName, row) {
  const d = await lerUsedRange(fileId, sheetName);
  const nextRow = (d.values?.length || 1) + 1;
  const lastCol = colLetter(row.length); // A=1, B=2 ... O=15
  await gFetch('PATCH',
    `/me/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(sheetName)}/range(address='A${nextRow}:${lastCol}${nextRow}')`,
    { values: [row] }
  );
}
```

---

## CONTEXTO FINANCEIRO (IMUTÁVEL)

### Receitas
- Pró-labore / distribuição de lucros da RMaluf Law
- Recebido via Nubank (pessoa física)
- Eventuais honorários avulsos

### Gastos essenciais — JAMAIS classificar como supérfluo
| Item | Observação |
|---|---|
| Financiamento imobiliário | Obrigação contratual |
| Pensão alimentícia Filha 1 | Obrigação legal |
| Pensão alimentícia Filha 2 | Obrigação legal |
| Medicamentos antidepressivos | Saúde essencial — sem julgamento |
| Consultas / Exames / Terapia | Saúde — protegido |

### Gastos supérfluos (candidatos a corte)
- Lazer (streaming, bares, eventos, viagens)
- Vestuário
- Assinaturas digitais (exceto ferramentas de trabalho)

---

## REGRAS DE AUTO-CATEGORIZAÇÃO

```javascript
const RULES_CAT = [
  { ct: 'Saúde',        sb: 'Medicamentos',   kw: 'FARMACIA,DROGARIA,DROGASIL,PAGUE MENOS,ULTRAFARMA,DROGA RAIA,PACHECO' },
  { ct: 'Saúde',        sb: 'Consultas',      kw: 'CONSULTA,CLINICA,MEDICO,HOSPITAL,LABORATORIO,EXAME' },
  { ct: 'Saúde',        sb: 'Terapia',        kw: 'TERAPIA,PSICO' },
  { ct: 'Filhas',       sb: 'Pensão',         kw: 'PENSAO,PENSÃO,ALIMENTOS' },
  { ct: 'Moradia',      sb: 'Financiamento',  kw: 'FINANCIAMENTO,CAIXA ECONOMICA HABIT' },
  { ct: 'Moradia',      sb: 'Condomínio',     kw: 'CONDOMINIO,CONDOMÍNIO' },
  { ct: 'Alimentação',  sb: 'Supermercado',   kw: 'ZAFFARI,CARREFOUR,EXTRA,ASSAI,ATACADAO,PAO DE ACUCAR,HORTIFRUTI,SUPERMERCADO,MERCADO' },
  { ct: 'Alimentação',  sb: 'Padaria',        kw: 'PADARIA,FLORENZZA' },
  { ct: 'Alimentação',  sb: 'Delivery',       kw: 'IFOOD,RAPPI,UBER EATS,JAMES DELIVERY' },
  { ct: 'Alimentação',  sb: 'Restaurante',    kw: 'RESTAURANTE,CHURRASCARIA,SUSHI,HAMBURGUER,PIZZA,LANCHONETE,PIQUETE,BODEGA,DONA ROSE,GRILL,TAVERNA' },
  { ct: 'Lazer',        sb: 'Streaming',      kw: 'NETFLIX,SPOTIFY,DISNEY,HBO,AMAZON PRIME,YOUTUBE PREMIUM,GLOBOPLAY,APPLE TV' },
  { ct: 'Lazer',        sb: 'Hotel/Viagem',   kw: 'HOTEL,POUSADA,AIRBNB,TURISMO,BOOKING,REFUGIO,COR DE VINHO' },
  { ct: 'Lazer',        sb: 'Eventos/Cultura',kw: 'CINEMA,TEATRO,SHOW,INGRESSO,LIVRARIA' },
  { ct: 'Lazer',        sb: 'Bares',          kw: 'BAR ,BALADA,NIGHT,VINHO,CERVEJA' },
  { ct: 'Transporte',   sb: 'Aplicativo',     kw: '99APP,UBER,CABIFY,MOVIDA' },
  { ct: 'Transporte',   sb: 'Combustível',    kw: 'POSTO,COMBUSTIVEL,GASOLINA,SHELL,IPIRANGA,BR DISTRIBUIDORA' },
  { ct: 'Transporte',   sb: 'Estacionamento', kw: 'PARKING,ESTACIONAMENTO,REK PARK' },
  { ct: 'Assinaturas',  sb: 'IA/Software',    kw: 'ANTHROPIC,OPENAI,MICROSOFT,ADOBE,DROPBOX,GOOGLE ONE,ICLOUD,LINKEDIN,GITHUB' },
  { ct: 'Vestuário',    sb: 'Roupas',         kw: 'ZARA,RENNER,C&A,RIACHUELO,HERING,FARM,AREZZO,H&M' },
];
```

Merchants reais já observados nos dados: `ZAFFARI BOULEVARD`, `PADARIA FLORENZZA`, `99APP`, `MOVIDA VC`, `NETFLIX`, `ANTHROPIC`, `OPENAI`, `HOTEL REFUGIO DA MONTA`, `REK PARKING`, `BODEGA GAUCHA`, `COR DE VINHO TURISMO`, `LIVRARIA`, `DONA ROSE`.

---

## DESIGN SYSTEM

```css
/* Cores */
--bg:     #000000;          /* fundo absoluto */
--bg2:    #111111;          /* sidebar */
--bg3:    #1c1c1e;          /* cards escuros */
--card:   rgba(255,255,255,0.045);
--card-b: rgba(255,255,255,0.08);

--green:  #30D158;   /* receitas, saldo positivo, OK */
--red:    #FF453A;   /* despesas, alertas críticos */
--yellow: #FFD60A;   /* atenção */
--blue:   #0A84FF;   /* ações, links */
--orange: #FF9F0A;
--purple: #BF5AF2;

--t1: #ffffff;
--t2: rgba(235,235,245,.8);
--t3: #8e8e93;              /* texto secundário */
--t4: #636366;              /* texto terciário */

/* Glassmorphism */
backdrop-filter: blur(24px);
border: 1px solid var(--card-b);
border-radius: 20px;
box-shadow: 0 8px 32px rgba(0,0,0,.7);

/* Tipografia */
font-family: "DM Sans", -apple-system, sans-serif;
font-family: "DM Mono", monospace;   /* valores monetários */
```

---

## SEÇÕES DO DASHBOARD

| ID | Seção | Status |
|---|---|---|
| `sec-home` | 🏠 Visão Geral | ✅ Funcional |
| `sec-lanc` | 📋 Lançamentos | ✅ Funcional |
| `sec-cats` | 📊 Análise por Categoria | ✅ Funcional |
| `sec-diag` | 🔍 Diagnóstico | ✅ Funcional |
| `sec-metas` | 🎯 Metas | ✅ Funcional |
| `sec-nf` | 🧾 Notas Fiscais (Claude Vision) | ✅ Funcional |
| `sec-imp` | 📥 Importar | 🔧 Em progresso |
| `sec-ai` | 🤖 Assistente IA | ✅ Funcional |
| `sec-cfg` | ⚙️ Configurações | ✅ Funcional |

---

## FASES DO PROJETO

| Fase | Descrição | Status |
|---|---|---|
| 0 | Setup Azure + GitHub Pages | ✅ Concluída |
| 1 | HTML completo com dados mock | ✅ Concluída |
| 2 | Auth M365 + leitura OneDrive real | 🔧 Em progresso |
| 3 | Import GastosCartao → financas-rafael | 🔧 Em progresso |
| 4 | Gráficos e análises com dados reais | ⏳ Pendente |
| 5 | Assistente IA com contexto real | ⏳ Pendente |
| 6 | Export PDF/Excel + parser extrato PDF | ⏳ Pendente |

---

## O QUE FALTA IMPLEMENTAR (Fase 2/3 — próxima sessão)

### Prioridade 1 — Import GastosCartao
- [ ] `iniciarImportGC()` — lê GastosCartao (read-only), detecta duplicatas vs. financas-rafael
- [ ] Modal `#imp-ov` — preview tabular com categoria editável por linha e checkbox "pular"
- [ ] `confirmarImportacao()` — grava apenas colunas I–O em financas-rafael, linha completa A–O
- [ ] Deduplicação por chave composta: `Date_Time_Amount_Merchant`
- [ ] Botão "Buscar Novos Lançamentos" na seção Importar chama `iniciarImportGC()`

### Prioridade 2 — Carregar dados reais ao fazer login
- [ ] `carregarDadosOneDrive()` — lê financas-rafael ao autenticar, popula `LANCS[]`
- [ ] Mapeamento flexível de headers (nomes podem variar)
- [ ] Auto-detectar meses disponíveis e selecionar o mais recente

### Prioridade 3 — UX de cartões na Home
- [ ] Cards cc-2812 e cc-4141 mostram total real do mês selecionado
- [ ] Seletor de mês lê meses reais dos dados carregados

---

## REGRAS INVIOLÁVEIS

1. **GastosCartao.xlsx nunca é alterado** — apenas leitura
2. **Medicamentos, terapia, pensão e financiamento são ESSENCIAIS** — jamais aparecem como supérfluo
3. **Arquivo único** — tudo em `index.html` (sem build tools, sem Node no browser)
4. **CDNs apenas** — sem npm install no front-end
5. **MSAL.js v2** — não atualizar para v3 sem refatoração completa
6. **Comentários em português** no código

---

## CDNs UTILIZADAS

```html
<!-- Auth -->
<script src="https://alcdn.msauth.net/browser/2.38.0/js/msal-browser.min.js"></script>
<!-- Gráficos -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<!-- Excel export -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<!-- PDF export (fase 6) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<!-- Fontes -->
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

---

## COMO USAR ESTE ARQUIVO NO CLAUDE CODE

Na primeira mensagem de cada sessão:

```
Leia o CONTEXTO.md e o index.html.
[descreva o que quer implementar]
Faça edições cirúrgicas — não reescreva seções que já funcionam.
```
