// ============================================================
// GRAPH.JS — Microsoft Graph API e sincronização OneDrive
// Depende de: config.js, data.js
// ============================================================
'use strict';

/* ============================================================
   GRAPH API
   ============================================================ */
async function graphFetch(endpoint, opts = {}) {
  if (!S.token) S.token = await getToken();
  const { method = 'GET', body, raw = false } = opts;
  const headers = {
    Authorization: `Bearer ${S.token}`,
    'Content-Type': 'application/json',
    ...(S.workbookSessionId ? { 'workbook-session-id': S.workbookSessionId } : {})
  };
  const res = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) {
    S.token = await getToken(); // refresh and retry
    return graphFetch(endpoint, opts);
  }
  // Sessão inválida — criar nova e retry
  if ((res.status === 400 || res.status === 404) && S.workbookSessionId) {
    let errBody = '';
    try { errBody = await res.clone().text(); } catch {}
    if (errBody.includes('InvalidSession') || errBody.includes('invalidSession')) {
      console.warn('Sessão inválida. Criando nova sessão e retentando...');
      S.workbookSessionId = null;
      await createWorkbookSession();
      // Retry uma vez com sessão nova
      const retry = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${S.token}`,
          'Content-Type': 'application/json',
          ...(S.workbookSessionId ? { 'workbook-session-id': S.workbookSessionId } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
      if (retry.status === 204 || raw) return null;
      if (!retry.ok) {
        const retryErr = await retry.text();
        throw new Error(`Graph ${retry.status}: ${retryErr.substring(0,200)}`);
      }
      return retry.json();
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${res.status}: ${text.substring(0,200)}`);
  }
  if (res.status === 204 || raw) return null;
  return res.json();
}

/* ---- Encontrar / caching do arquivo ---- */
async function findFile() {
  if (S.fileId) {
    try { await graphFetch(`/me/drive/items/${S.fileId}`); return; } catch {}
  }
  // Tenta pelo caminho exato
  try {
    const d = await graphFetch(`/me/drive/root:${FILE_PATH}`);
    if (d?.id) { S.fileId = d.id; localStorage.setItem('rfm_file_id', d.id); return; }
  } catch {}
  // Busca por nome
  const search = await graphFetch(`/me/drive/root/search(q='financas-rafael.xlsx')`);
  const f = search?.value?.find(i => i.name === 'financas-rafael.xlsx');
  if (f) { S.fileId = f.id; localStorage.setItem('rfm_file_id', f.id); return; }
  throw new Error('Arquivo financas-rafael.xlsx não encontrado. Verifique se está em OneDrive/Financeiro/.');
}

/* ---- Criar sessão do workbook ---- */
async function createWorkbookSession() {
  try {
    const res = await graphFetch(
      `/me/drive/items/${S.fileId}/workbook/createSession`,
      { method: 'POST', body: { persistChanges: true } }
    );
    S.workbookSessionId = res?.id || null;
  } catch(e) {
    console.warn('Sessão workbook não criada — operando sem sessão:', e.message);
    S.workbookSessionId = null;
  }
}

async function closeWorkbookSession() {
  if (!S.workbookSessionId) return;
  try {
    await graphFetch(
      `/me/drive/items/${S.fileId}/workbook/closeSession`,
      { method: 'POST' }
    );
  } catch {}
  S.workbookSessionId = null;
}

/* ---- Ler aba ---- */
async function getSheetValues(sheetName) {
  try {
    const d = await graphFetch(
      `/me/drive/items/${S.fileId}/workbook/worksheets/${encodeURIComponent(sheetName)}/usedRange`
    );
    return d?.values || [];
  } catch { return null; }
}

/* ---- Criar aba se não existir ---- */
async function ensureSheet(name, headers) {
  const existing = await getSheetValues(name);
  if (existing !== null) return;
  await graphFetch(`/me/drive/items/${S.fileId}/workbook/worksheets`, {
    method: 'POST', body: { name }
  });
  const colEnd = String.fromCharCode(64 + headers.length);
  await graphFetch(
    `/me/drive/items/${S.fileId}/workbook/worksheets/${encodeURIComponent(name)}/range(address='A1:${colEnd}1')`,
    { method: 'PATCH', body: { values: [headers] } }
  );
}

/* ---- Escrever linha ao final (wrapper) ---- */
async function appendRow(sheetName, values) {
  await appendRows(sheetName, [values]);
}

/* ---- Escrever múltiplas linhas de uma vez (1 chamada API) ---- */
async function appendRows(sheetName, rowsArray) {
  if (!rowsArray || rowsArray.length === 0) return;

  // Garantir sessão válida
  if (!S.workbookSessionId) await createWorkbookSession();

  // Descobrir última linha usada
  const rangeData = await graphFetch(
    `/me/drive/items/${S.fileId}/workbook/worksheets/${encodeURIComponent(sheetName)}/usedRange`
  );
  const firstRow = (rangeData?.rowCount || 1) + 1;
  const lastRow  = firstRow + rowsArray.length - 1;
  const colCount = rowsArray[0].length;
  const colEnd   = String.fromCharCode(64 + colCount);

  // Escrever todas as linhas de uma vez
  await graphFetch(
    `/me/drive/items/${S.fileId}/workbook/worksheets/${encodeURIComponent(sheetName)}/range(address='A${firstRow}:${colEnd}${lastRow}')`,
    { method: 'PATCH', body: { values: rowsArray } }
  );
}

/* ---- graphFetch com retry automático para 503/429 ---- */
async function graphFetchWithRetry(endpoint, opts = {}, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await graphFetch(endpoint, opts);
    } catch(e) {
      const is503 = e.message.includes('503');
      const is429 = e.message.includes('429');
      if ((is503 || is429) && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`Graph ${is503?503:429} — retry ${attempt+1}/${maxRetries} em ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        S.workbookSessionId = null;
        await createWorkbookSession();
      } else {
        throw e;
      }
    }
  }
}

/* ---- Atualizar células I-O de uma linha ---- */
async function updateCategorizacao(rowIndex, campos) {
  // campos = [tipo, cat, sub, conta, origem, mesAno, idNF]
  const nextCol = String.fromCharCode(64 + campos.length + 8); // I=9 → char(73)
  await graphFetch(
    `/me/drive/items/${S.fileId}/workbook/worksheets/${encodeURIComponent(SHEET_DADOS)}/range(address='I${rowIndex}:${nextCol}${rowIndex}')`,
    { method: 'PATCH', body: { values: [campos] } }
  );
}

/* ---- Salvar configuração no Excel ---- */
async function saveConfig(chave, valor) {
  S.config[chave] = valor;
  // Verificar se a chave já existe na aba
  const rows = await getSheetValues(SHEET_CFG);
  if (!rows) return;
  let found = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === chave) { found = i + 1; break; } // +1 para 1-indexed
  }
  if (found > 0) {
    await graphFetch(
      `/me/drive/items/${S.fileId}/workbook/worksheets/${encodeURIComponent(SHEET_CFG)}/range(address='B${found}')`,
      { method: 'PATCH', body: { values: [[valor]] } }
    );
  } else {
    await appendRow(SHEET_CFG, [chave, valor]);
  }
}

/* ============================================================
   TOAST
   ============================================================ */
function showToast(mensagem, tipo) {
  const cor = tipo === 'verde' ? 'var(--green)' : 'var(--yellow)';
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
    background:var(--bg3);color:var(--text);border-left:4px solid ${cor};
    border-radius:12px;padding:12px 18px;font-size:14px;font-family:inherit;
    box-shadow:0 4px 20px rgba(0,0,0,0.6);max-width:320px;
    animation:slideInToast .25s ease;`;
  el.textContent = mensagem;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ============================================================
   RECORRENTES — CRUD
   ============================================================ */
async function salvarRecorrente(rec) {
  const id = Date.now();
  const row = [
    id,
    rec.descricao || '',
    rec.categoria || 'Outros',
    rec.subcategoria || '',
    rec.conta || 'itau-corrente',
    rec.tipo || 'despesa',
    rec.valor || 0,
    rec.diaVencimento || 1,
    rec.variavel ? 'sim' : 'nao',
    'sim',
    rec.observacao || '',
    rec.valor || 0,
    '',
    rec.pagoMeses || ''
  ];
  await appendRows('Recorrentes', [row]);
  S.recorrentes.push({ ...rec, id, ativo: true });
  S._cache = {};
}

async function atualizarRecorrente(id, campos) {
  const raw = await getSheetValues('Recorrentes');
  if (!raw) return;
  let rowNum = -1;
  for (let i = 1; i < raw.length; i++) {
    if (String(raw[i][0]) === String(id)) { rowNum = i + 1; break; }
  }
  if (rowNum < 0) return;
  const existente = S.recorrentes.find(r => String(r.id) === String(id)) || {};
  const dados = { ...existente, ...campos };
  await graphFetch(
    `/me/drive/items/${S.fileId}/workbook/worksheets/Recorrentes/range(address='A${rowNum}:N${rowNum}')`,
    { method: 'PATCH', body: { values: [[
      id,
      dados.descricao, dados.categoria, dados.subcategoria,
      dados.conta, dados.tipo, dados.valor, dados.diaVencimento,
      dados.variavel?'sim':'nao', dados.ativo?'sim':'nao',
      dados.observacao, dados.ultimoValor, dados.ultimoPagamento,
      dados.pagoMeses || ''
    ]] } }
  );
  const idx = S.recorrentes.findIndex(r => String(r.id) === String(id));
  if (idx >= 0) S.recorrentes[idx] = { ...S.recorrentes[idx], ...campos };
  S._cache = {};
}

/* ============================================================
   SYNC GASTOSCARTAO
   ============================================================ */
function _gcParseDate(raw) {
  if (typeof raw === 'number' && raw > 40000 && raw < 60000) {
    return new Date(Math.round((raw - 25569) * 86400 * 1000));
  }
  const s = String(raw || '').trim();
  const p = s.split('/');
  if (p.length === 3) {
    return new Date(+p[2], +p[1] - 1, +p[0]);
  }
  if (p.length === 2) {
    const day = +p[0], mon = +p[1];
    const now  = new Date();
    const year = mon <= now.getMonth() + 1 ? now.getFullYear() : now.getFullYear() - 1;
    return new Date(year, mon - 1, day);
  }
  return new Date();
}

async function syncGastosCartao() {
  try {
    const token = await getToken();
    // Lê via tabela "Gastos" — mesmo endpoint do app iPhone
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/Financeiro/GastosCartao.xlsx:/workbook/tables/Gastos/rows`;
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GastosCartao HTTP ${res.status}`);
    const json = await res.json();

    S.gastosCartao = (json.value || [])
      .map(r => {
        const v = r.values[0];
        return {
          date:        _gcParseDate(v[0]),
          timeStr:     String(v[1] || '').trim(),
          descricao:   String(v[2] || '').trim(),
          valor:       parseFloat(String(v[3] || '0').replace(',', '.')),
          cartao:      String(v[4] || '').trim(),
          lat:         parseFloat(v[5]) || 0,
          lng:         parseFloat(v[6]) || 0,
          obs:         String(v[7] || '').trim(),
          catOverride: String(v[8] || '').trim(),
        };
      })
      .filter(r => r.descricao && r.valor > 0);

    console.log(`[GC] ${S.gastosCartao.length} transações — somente leitura`);
  } catch (e) {
    console.error('[GC] Erro:', e.message);
    S.gastosCartao = [];
  }
  // NUNCA chamar appendRows ou qualquer escrita no financas-rafael.xlsx aqui
}
