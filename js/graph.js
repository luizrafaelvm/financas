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

/* ---- Escrever linha ao final ---- */
async function appendRow(sheetName, values) {
  // Garantir sessão válida antes de escrever
  if (!S.workbookSessionId) {
    await createWorkbookSession();
  }
  try {
    const rangeData = await graphFetch(
      `/me/drive/items/${S.fileId}/workbook/worksheets/${encodeURIComponent(sheetName)}/usedRange`
    );
    const nextRow = (rangeData?.rowCount || 1) + 1;
    const colEnd  = String.fromCharCode(64 + values.length);
    await graphFetch(
      `/me/drive/items/${S.fileId}/workbook/worksheets/${encodeURIComponent(sheetName)}/range(address='A${nextRow}:${colEnd}${nextRow}')`,
      { method: 'PATCH', body: { values: [values] } }
    );
  } catch(e) {
    // Se sessão expirou, tentar sem sessão
    if (e.message.includes('InvalidSession') || e.message.includes('invalidSession')) {
      S.workbookSessionId = null;
      const rangeData = await graphFetch(
        `/me/drive/items/${S.fileId}/workbook/worksheets/${encodeURIComponent(sheetName)}/usedRange`
      );
      const nextRow = (rangeData?.rowCount || 1) + 1;
      const colEnd  = String.fromCharCode(64 + values.length);
      await graphFetch(
        `/me/drive/items/${S.fileId}/workbook/worksheets/${encodeURIComponent(sheetName)}/range(address='A${nextRow}:${colEnd}${nextRow}')`,
        { method: 'PATCH', body: { values: [values] } }
      );
    } else {
      throw e;
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
   SYNC GASTOSCARTAO
   ============================================================ */
let _syncGCRunning = false;

async function syncGastosCartao() {
  if (_syncGCRunning) return;
  _syncGCRunning = true;
  try {
    // 1) Localizar GastosCartao.xlsx
    let gcId = S.gastosCartaoFileId;
    if (gcId) {
      try { await graphFetch(`/me/drive/items/${gcId}`); }
      catch { gcId = null; }
    }
    if (!gcId) {
      try {
        const d = await graphFetch(`/me/drive/root:/Financeiro/GastosCartao.xlsx`);
        if (d?.id) { gcId = d.id; S.gastosCartaoFileId = d.id; localStorage.setItem('rfm_gastoscartao_id', d.id); }
      } catch {}
    }
    if (!gcId) {
      try {
        const s = await graphFetch(`/me/drive/root/search(q='GastosCartao.xlsx')`);
        const f = s?.value?.find(i => i.name === 'GastosCartao.xlsx');
        if (f) { gcId = f.id; S.gastosCartaoFileId = f.id; localStorage.setItem('rfm_gastoscartao_id', f.id); }
      } catch {}
    }
    if (!gcId) { showToast('GastosCartao não localizado', 'amarelo'); return; }

    // 2) Ler primeira aba (usedRange)
    const wbSheets = await graphFetch(`/me/drive/items/${gcId}/workbook/worksheets`);
    const primeiraAba = wbSheets?.value?.[0]?.name;
    if (!primeiraAba) { showToast('GastosCartao não localizado', 'amarelo'); return; }

    const rangeData = await graphFetch(
      `/me/drive/items/${gcId}/workbook/worksheets/${encodeURIComponent(primeiraAba)}/usedRange`
    );
    const raw = rangeData?.values;
    if (!raw || raw.length < 2) {
      showToast('✓ GastosCartao atualizado — nenhuma transação nova', 'verde');
      return;
    }

    // 3) Processar em chunks de 500, inferindo MesAno cronologicamente
    const CHUNK = 500;
    const novas = [];
    let anoBase = S.gastosCartaoAnoBase;
    let prevMes = null;

    for (let start = 1; start < raw.length; start += CHUNK) {
      await new Promise(r => setTimeout(r, 0));
      const chunk = raw.slice(start, start + CHUNK);
      for (const r of chunk) {
        if (!r) continue;
        const descricao = String(r[2] || '').trim();
        const valor = parseValorBR(r[3]);
        if (!descricao || valor === 0) continue;

        // Heurística de sequência cronológica
        const partes = String(r[0] || '').split('/');
        const mes = parseInt(partes[1]) || 1;
        if (prevMes !== null && mes < prevMes) anoBase++;
        prevMes = mes;
        const mesAno = `${anoBase}-${String(mes).padStart(2,'0')}`;

        // Deduplicação
        const dataObj = reconstructDate(r[0], mesAno);
        const data = (dataObj && !isNaN(dataObj.getTime())) ? dataObj : new Date();
        const dataStr = (isNaN(new Date(data).getTime()) ? '' : new Date(data).toISOString()).slice(0,10);
        const conta = mapCartao(r[4]);
        const existe = S.transactions.some(tx =>
          (tx.data instanceof Date && !isNaN(tx.data.getTime()) ? tx.data.toISOString().slice(0,10) : '') === dataStr &&
          tx.descricao === descricao &&
          tx.valor === valor &&
          tx.conta === conta
        );
        if (existe) continue;

        const { cat, sub } = categorizar(descricao);
        novas.push({
          colA: String(r[0] || ''), colB: String(r[1] || ''),
          colC: descricao, colD: String(r[3] || ''),
          colE: r[4], colF: r[5] || '', colG: r[6] || '', colH: String(r[7] || ''),
          tipo: cat === 'Receitas' ? 'receita' : 'despesa',
          cat, sub, conta, mesAno, data, valor
        });
      }
    }

    // 4) Gravar novas linhas na aba Dados em lotes de 50
    if (novas.length > 0) {
      for (let i = 0; i < novas.length; i += 50) {
        await new Promise(r => setTimeout(r, 0));
        for (const tx of novas.slice(i, i + 50)) {
          const row = [
            tx.colA, tx.colB, tx.colC, tx.colD, tx.colE,
            tx.colF, tx.colG, tx.colH,
            tx.tipo, tx.cat, tx.sub, tx.conta,
            'cartao-automatico', tx.mesAno, '', ''
          ];
          await appendRow(SHEET_DADOS, row);
          S.transactions.push({
            id: S.transactions.length + 1,
            rowIndex: S.transactions.length + 2,
            data: tx.data, hora: tx.colB,
            descricao: tx.colC, valor: tx.valor,
            valorSigned: tx.tipo === 'despesa' ? -tx.valor : tx.valor,
            tipo: tx.tipo, categoria: tx.cat, subcategoria: tx.sub,
            conta: tx.conta, origem: 'cartao-automatico',
            observacao: tx.colH, mesAno: tx.mesAno,
            idNF: '', categorizadoNoExcel: false
          });
        }
      }
      renderAll();
      showToast(`✓ GastosCartao — ${novas.length} novas transações`, 'verde');
    } else {
      showToast('✓ GastosCartao atualizado — nenhuma transação nova', 'verde');
    }
  } catch (e) {
    console.error('syncGastosCartao:', e);
  } finally {
    _syncGCRunning = false;
  }
}
