// ============================================================
// IMPORTAR.JS — Upload e importação de OFX, CSV, XLSX e NF
// Depende de: config.js, data.js, graph.js, ui.js
// ============================================================
'use strict';

/* ============================================================
   DROP HANDLERS
   ============================================================ */
function handleDropExtrato(e) {
  e.preventDefault();
  document.getElementById('drop-zone-extrato').classList.remove('drag-over');
  processExtratFiles(e.dataTransfer.files);
}

function handleDropXLSX(e) {
  e.preventDefault();
  document.getElementById('drop-zone-xlsx').classList.remove('drag-over');
  processXLSXFiles(e.dataTransfer.files);
}

function handleDropNF(e) {
  e.preventDefault();
  document.getElementById('drop-zone-nf').classList.remove('drag-over');
  processNFFiles(e.dataTransfer.files);
}

function handleExtratoSelect(input) {
  processExtratFiles(input.files);
  input.value = '';
}

function handleNFSelect(input) {
  processNFFiles(input.files);
  input.value = '';
}

/* ============================================================
   NOTAS FISCAIS — IA
   ============================================================ */
function processNFFiles(fileList) {
  if (!fileList || !fileList.length) return;
  Array.from(fileList).forEach((file, i) => {
    const nf = {
      id: Date.now() + i,
      file,
      name: file.name,
      type: file.type,
      resultado: null,
      lancamentoVinculado: null
    };
    window.nfBuffer.push(nf);
    renderNFCard(nf);
  });
}

function renderNFCard(nf) {
  const grade = document.getElementById('nf-grade');
  if (!grade) return;

  const hasKey = !!localStorage.getItem('rfm_claude_key');
  const thumbHtml = nf.type.includes('image')
    ? `<img class="nf-thumb" src="${URL.createObjectURL(nf.file)}" alt="">`
    : `<div class="nf-thumb">📄<div style="font-size:10px;color:var(--text3);margin-top:4px;text-align:center;max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nf.name}</div></div>`;

  const analisarBtn = hasKey
    ? `<button class="btn btn-secondary btn-sm" id="nf-btn-${nf.id}" onclick="analisarNF(${nf.id})">🤖 Analisar com IA</button>`
    : `<small style="color:var(--yellow)">⚠️ Configure API Key em Configurações para usar IA</small>`;

  const optsTx = getTxsParaVincular()
    .map((t, idx) => `<option value="${idx}">${fmtData(t.data)} · ${t.descricao.substring(0,25)} · ${fmtBRL(t.valor)}</option>`)
    .join('');

  const card = document.createElement('div');
  card.id = `nf-card-${nf.id}`;
  card.className = 'nf-card';
  card.innerHTML = `
    ${thumbHtml}
    <div class="nf-controls">
      <span style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nf.name}</span>
      <select class="form-select" id="nf-link-${nf.id}" style="font-size:12px">
        <option value="">— Vincular ao lançamento —</option>
        ${optsTx}
      </select>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${analisarBtn}
        <button class="btn btn-secondary btn-sm" onclick="vincularNF(${nf.id})">🔗 Vincular</button>
        <button class="btn btn-sm" style="background:rgba(255,69,58,.15);color:var(--red);border:none;border-radius:8px;padding:6px 10px;cursor:pointer" onclick="removerNF(${nf.id})">🗑️</button>
      </div>
      <div id="nf-resultado-${nf.id}" class="hidden"></div>
    </div>`;
  grade.appendChild(card);
}

function getTxsParaVincular() {
  return txsMes(S.mesAtual).slice().sort((a, b) => b.data - a.data);
}

async function analisarNF(nfId) {
  const nf = window.nfBuffer.find(n => n.id === nfId);
  if (!nf) return;
  const apiKey = localStorage.getItem('rfm_claude_key');
  if (!apiKey) { showToast('Configure a API Key em Configurações', 'amarelo'); return; }

  const btn = document.getElementById(`nf-btn-${nfId}`);
  if (btn) { btn.textContent = '⏳ Analisando...'; btn.disabled = true; }

  try {
    const base64 = await fileToBase64(nf.file);
    const contentBlock = nf.type.includes('pdf')
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: PROMPT_NF }
        ]
      : [
          { type: 'image', source: { type: 'base64', media_type: nf.type, data: base64 } },
          { type: 'text', text: PROMPT_NF }
        ];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: 'Você é um assistente de controle financeiro pessoal. Analise o documento enviado e extraia os dados da nota fiscal com precisão. Responda APENAS com JSON válido, sem texto adicional, sem markdown.',
        messages: [{ role: 'user', content: contentBlock }]
      })
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const raw = data.content[0].text.replace(/```json?|```/g, '').trim();
    nf.resultado = JSON.parse(raw);
    exibirResultadoNF(nf);
  } catch(e) {
    const div = document.getElementById(`nf-resultado-${nfId}`);
    if (div) { div.classList.remove('hidden'); div.innerHTML = `<small style="color:var(--red)">Erro: ${e.message}</small>`; }
  } finally {
    if (btn) { btn.textContent = '🤖 Analisar com IA'; btn.disabled = false; }
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function exibirResultadoNF(nf) {
  const div = document.getElementById(`nf-resultado-${nf.id}`);
  if (!div || !nf.resultado) return;
  const r = nf.resultado;

  const somaItens = (r.itens || []).reduce((s, it) => s + (it.valor_total_item || 0), 0);
  const diverge = Math.abs(somaItens - r.valor_total) > 0.05;
  const totalCor = diverge ? 'var(--red)' : 'var(--green)';

  const linhasItens = (r.itens || []).map(it => `
    <tr>
      <td>${it.descricao}</td>
      <td style="text-align:center">${it.quantidade}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace">${fmtBRL(it.valor_unitario)}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace">${fmtBRL(it.valor_total_item)}</td>
    </tr>`).join('');

  const alertaDivergencia = diverge
    ? `<div style="margin-top:8px;padding:6px 10px;background:rgba(255,214,10,.12);color:var(--yellow);border-radius:8px;font-size:12px">
        ⚠️ Soma dos itens (${fmtBRL(somaItens)}) difere do total (${fmtBRL(r.valor_total)})
       </div>` : '';

  div.classList.remove('hidden');
  div.innerHTML = `
    <div class="nf-resultado-inner">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <strong style="font-size:13px">${r.estabelecimento}</strong>
        <span style="font-size:12px;color:var(--text2)">${r.data}</span>
        <span class="badge badge-gray" style="font-size:10px">${r.categoria_sugerida}</span>
      </div>
      <div class="table-wrap">
        <table class="data-table nf-resultado-inner">
          <thead><tr><th>Item</th><th style="text-align:center">Qtd</th><th style="text-align:right">Unit.</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>
            ${linhasItens}
            <tr style="border-top:1px solid var(--border)">
              <td colspan="3"><strong>TOTAL</strong></td>
              <td style="text-align:right;font-family:'DM Mono',monospace;font-weight:600;color:${totalCor}">${fmtBRL(r.valor_total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      ${alertaDivergencia}
      <div style="font-size:12px;color:var(--text2);margin-top:8px">Pagamento: ${r.forma_pagamento}</div>
      <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="usarDadosNF(${nf.id})">✓ Usar estes dados</button>
    </div>`;
}

function usarDadosNF(nfId) {
  const nf = window.nfBuffer.find(n => n.id === nfId);
  if (!nf?.resultado) return;
  const r = nf.resultado;
  const estab = (r.estabelecimento || '').toLowerCase();
  const txs = getTxsParaVincular();

  // Buscar por similaridade de descrição ou proximidade de valor
  let bestIdx = -1, bestScore = -1;
  txs.forEach((t, idx) => {
    let score = 0;
    const desc = t.descricao.toLowerCase();
    if (estab && desc.includes(estab.substring(0, Math.min(6, estab.length)))) score += 2;
    if (Math.abs(t.valor - r.valor_total) < 0.5) score += 3;
    else if (Math.abs(t.valor - r.valor_total) < 5) score += 1;
    if (score > bestScore) { bestScore = score; bestIdx = idx; }
  });

  if (bestIdx >= 0) {
    const sel = document.getElementById(`nf-link-${nfId}`);
    if (sel) sel.value = bestIdx;
  }
  vincularNF(nfId);
}

async function vincularNF(nfId) {
  const nf = window.nfBuffer.find(n => n.id === nfId);
  if (!nf) return;
  const sel = document.getElementById(`nf-link-${nfId}`);
  if (!sel || sel.value === '') {
    showToast('Selecione um lançamento para vincular', 'amarelo'); return;
  }
  const txIdx = parseInt(sel.value);
  const txs = getTxsParaVincular();
  const tx = txs[txIdx];
  if (!tx) return;

  // Montar texto de observação
  const r = nf.resultado || {};
  let obs = `NF: ${r.estabelecimento || nf.name} ${r.data || ''} · Total: R$${r.valor_total || ''}`;
  if (r.itens?.length) {
    const itensStr = r.itens.map(it => `${it.descricao} x${it.quantidade} R$${it.valor_unitario}`).join(' · ');
    obs += ` · Itens: ${itensStr}`;
  }
  if (obs.length > 250) obs = obs.substring(0, 247) + '...';

  // Atualizar memória local
  tx.observacao = obs;
  nf.lancamentoVinculado = tx.id;

  // Gravar no Excel: coluna H = Obs (índice 7, col H)
  try {
    await graphFetch(
      `/me/drive/items/${S.fileId}/workbook/worksheets/${encodeURIComponent(SHEET_DADOS)}/range(address='H${tx.rowIndex}')`,
      { method: 'PATCH', body: { values: [[obs]] } }
    );
  } catch(e) {
    showToast(`Erro ao gravar: ${e.message}`, 'amarelo'); return;
  }

  // Feedback visual no card
  const card = document.getElementById(`nf-card-${nfId}`);
  if (card) {
    const badge = document.createElement('span');
    badge.className = 'nf-vinculado-badge';
    badge.textContent = '✓ Vinculado';
    card.querySelector('.nf-controls').appendChild(badge);
  }
  showToast('✓ Nota vinculada ao lançamento', 'verde');
}

function removerNF(nfId) {
  window.nfBuffer = window.nfBuffer.filter(n => n.id !== nfId);
  const card = document.getElementById(`nf-card-${nfId}`);
  if (card) card.remove();
}

/* ============================================================
   EXTRATOS — OFX / CSV
   ============================================================ */
function processExtratFiles(fileList) {
  if (!fileList || !fileList.length) return;
  const files = Array.from(fileList);
  let pending = files.length;
  let lidas = 0, duplas = 0;

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target.result;
      const ext = file.name.split('.').pop().toLowerCase();
      let parsed = [];
      try {
        parsed = ext === 'ofx' ? parseOFX(content) : parseCSV(content);
      } catch(err) {
        showToast(`Erro em ${file.name}: ${err.message}`, 'amarelo');
      }
      parsed.forEach(t => { t.origem_arquivo = file.name; });
      lidas += parsed.length;

      // Dedup contra S.transactions
      const novas = parsed.filter(t => !isDuplicata(t));
      duplas += parsed.length - novas.length;
      S.importBuffer = S.importBuffer.concat(novas);

      pending--;
      if (pending === 0) {
        showImportPreview(S.importBuffer);
        atualizarImportStats(lidas, duplas, S.importBuffer.length);
      }
    };
    reader.readAsText(file, 'latin1');
  });
}

/* ============================================================
   EXTRATOS — XLSX
   ============================================================ */
function processXLSXFiles(fileList) {
  if (!fileList || !fileList.length) return;
  if (typeof XLSX === 'undefined') {
    showToast('SheetJS não carregado — adicione o CDN na página', 'amarelo'); return;
  }
  const files = Array.from(fileList);
  let pending = files.length;

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        parseXLSXExterno(rows, file.name);
      } catch(err) {
        showToast(`Erro em ${file.name}: ${err.message}`, 'amarelo');
      }
      pending--;
      if (pending === 0 && S.importBuffer.length) {
        showImportPreview(S.importBuffer);
        atualizarImportStats(S.importBuffer.length, 0, S.importBuffer.length);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function parseXLSXExterno(rows, fileName, idxForced) {
  if (!rows || rows.length < 2) return;
  const header = (rows[0] || []).map(h => String(h || '').toLowerCase().trim());

  const findCol = (keywords) => {
    for (const kw of keywords) {
      const idx = header.findIndex(h => h.includes(kw));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  let iData  = idxForced?.data  ?? findCol(['data','date','dt','vencimento']);
  let iDesc  = idxForced?.desc  ?? findCol(['descricao','descrição','historico','histórico','estabelecimento','memo','name','merchant','lancamento','lançamento']);
  let iValor = idxForced?.valor ?? findCol(['valor','value','amount','debito','débito','credito','crédito','montante','parcela']);

  if (iData < 0 || iDesc < 0 || iValor < 0) {
    showModalMapeamento(rows, fileName, (idx) => parseXLSXExterno(rows, fileName, idx));
    return;
  }

  let lidas = 0, duplas = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null || c === '' || c === undefined)) continue;
    const descricao = String(r[iDesc] || '').trim();
    if (!descricao) continue;

    // Inferir valor (pode ser negativo → despesa)
    const rawValor = r[iValor];
    const valorNum = typeof rawValor === 'number' ? rawValor : parseValorBR(String(rawValor || ''));
    if (!valorNum && valorNum !== 0) continue;
    const valor = Math.abs(valorNum);
    if (valor === 0) continue;
    const tipo = valorNum < 0 ? 'despesa' : 'receita';

    // Parse de data
    let date;
    const rawDate = r[iData];
    if (rawDate instanceof Date) {
      date = rawDate;
    } else if (typeof rawDate === 'number') {
      // Serial de data Excel
      date = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
    } else {
      const ds = String(rawDate || '').trim();
      const pts = ds.split(/[\/\-\.]/);
      if (pts.length === 3) {
        const [a, b, c] = pts;
        // Detectar DD/MM/YYYY vs YYYY-MM-DD
        date = a.length === 4
          ? new Date(`${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}T00:00:00`)
          : new Date(`${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}T00:00:00`);
      }
    }
    if (!date || isNaN(date.getTime())) continue;

    const mesAno = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    const { cat, sub } = categorizar(descricao);
    lidas++;
    const tx = { data: date, descricao, valor, tipo, cat, sub,
      conta: 'itau-cartao', mesAno, origem: 'xlsx-import', origem_arquivo: fileName };

    if (isDuplicata(tx)) { duplas++; continue; }
    S.importBuffer.push(tx);
  }
  atualizarImportStats(lidas, duplas, S.importBuffer.length);
}

function isDuplicata(nova) {
  return S.transactions.some(t => {
    const descMatch = String(t.descricao||'').toUpperCase().trim() ===
                      String(nova.descricao||'').toUpperCase().trim();
    const valorMatch = Math.abs(parseFloat(t.valor)||0).toFixed(2) ===
                       Math.abs(parseFloat(nova.valor)||0).toFixed(2);
    if (!descMatch || !valorMatch) return false;

    try {
      const d1 = new Date(t.data);
      const d2 = new Date(nova.data);
      if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return descMatch && valorMatch;
      return d1.toDateString() === d2.toDateString();
    } catch {
      return descMatch && valorMatch;
    }
  });
}

function atualizarImportStats(lidas, duplas, novas) {
  const el = document.getElementById('import-stats');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = `✓ ${lidas} lidas · ${duplas} duplicatas ignoradas · ${novas} novas a importar`;
}

/* ============================================================
   PARSERS — OFX e CSV
   ============================================================ */
function parseOFX(content) {
  const txs = [];
  const stmtBlocks = content.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) || [];
  stmtBlocks.forEach(block => {
    const get = tag => { const m = block.match(new RegExp(`<${tag}>([^<\r\n]+)`,'i')); return m?m[1].trim():''; };
    const dateStr = get('DTPOSTED');
    const amount  = parseFloat(get('TRNAMT').replace(',','.'));
    const memo    = get('MEMO') || get('NAME');
    if (!dateStr || isNaN(amount)) return;
    const y=dateStr.substring(0,4), mo=dateStr.substring(4,6), d2=dateStr.substring(6,8);
    const date = new Date(`${y}-${mo}-${d2}T00:00:00`);
    if (isNaN(date.getTime())) return;
    const mesAno = `${y}-${mo}`;
    const { cat, sub } = categorizar(memo);
    const tipo = amount < 0 ? 'despesa' : 'receita';
    txs.push({ data: date, descricao: memo, valor: Math.abs(amount),
      tipo, cat, sub, conta: 'itau-corrente', mesAno, origem: 'ofx-import' });
  });
  return txs;
}

function parseCSV(content) {
  const txs = [];
  const lines = content.split(/\r?\n/).filter(l=>l.trim());
  if (lines.length < 2) return txs;
  const sep = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(sep).map(h=>h.trim().toLowerCase().replace(/"/g,''));

  for (let i=1;i<lines.length;i++) {
    const cols = lines[i].split(sep).map(c=>c.trim().replace(/^"|"$/g,''));
    if (cols.length < 2) continue;
    const row = {};
    header.forEach((h,j)=>{ row[h]=cols[j]||''; });

    const dateStr = row['data']||row['date']||cols[0];
    const memo    = row['histórico']||row['historico']||row['descricao']||row['description']||cols[1]||'';
    const credit  = parseValorBR(row['crédito']||row['credito']||'0');
    const debit   = parseValorBR(row['débito']||row['debito']||'0');
    const valor   = credit > 0 ? credit : debit;
    const tipo    = credit > 0 ? 'receita' : 'despesa';
    if (!dateStr || !memo || valor === 0) continue;

    let date;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      date = new Date(`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}T00:00:00`);
    } else { continue; }
    if (isNaN(date.getTime())) continue;

    const mesAno = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    const { cat, sub } = categorizar(memo);
    txs.push({ data: date, descricao: memo, valor, tipo, cat, sub,
      conta: 'itau-corrente', mesAno, origem: 'csv-import' });
  }
  return txs;
}

/* ============================================================
   PREVIEW DE IMPORTAÇÃO
   ============================================================ */
let _importPage = 0;
const _importPageSize = 50;

function showImportPreview(txs) {
  _importPage = 0;
  const el = document.getElementById('import-preview');
  el.classList.remove('hidden');
  _renderImportPage(txs);
}

function _renderImportPage(txs) {
  const total = txs.length;
  const start = _importPage * _importPageSize;
  const end   = Math.min(start + _importPageSize, total);
  const pages = Math.ceil(total / _importPageSize);

  document.getElementById('preview-count').textContent =
    `${total} transações encontradas`;

  const body = document.getElementById('preview-body');
  body.innerHTML = txs.slice(start, end).map(t => `
    <tr>
      <td style="font-size:12px">${fmtData(t.data)}</td>
      <td style="font-size:12px">${t.descricao}</td>
      <td><span class="badge badge-gray" style="font-size:10px">${t.cat}</span></td>
      <td style="font-size:11px;color:var(--text3)">${t.sub}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace;color:${t.tipo==='receita'?'var(--green)':'var(--red)'};font-size:13px">
        ${t.tipo==='receita'?'+':'-'}${fmtBRL(t.valor)}
      </td>
      <td><span class="badge-arquivo" title="${t.origem_arquivo||''}">${t.origem_arquivo||''}</span></td>
    </tr>`).join('');

  const pg = document.getElementById('preview-pagination');
  if (pages > 1) {
    pg.style.display = 'flex';
    pg.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="_importPage=Math.max(0,_importPage-1);_renderImportPage(S.importBuffer)"
        ${_importPage===0?'disabled':''}>← Anterior</button>
      <span>Pág. ${_importPage+1} / ${pages}</span>
      <button class="btn btn-secondary btn-sm" onclick="_importPage=Math.min(${pages-1},_importPage+1);_renderImportPage(S.importBuffer)"
        ${_importPage===pages-1?'disabled':''}>Próxima →</button>`;
  } else {
    pg.style.display = 'none';
  }
}

function cancelImport() {
  S.importBuffer = [];
  _importPage = 0;
  document.getElementById('import-preview').classList.add('hidden');
  const stats = document.getElementById('import-stats');
  if (stats) stats.classList.add('hidden');
}

async function confirmImport() {
  if (!S.importBuffer.length) return;
  const total = S.importBuffer.length;
  const prog  = document.getElementById('import-progress');
  const bar   = document.getElementById('import-progress-bar');
  const txt   = document.getElementById('import-progress-text');
  prog.classList.remove('hidden');
  bar.style.width = '0%';

  try {
    let done = 0;
    let loteCount = 0;
    for (let i = 0; i < total; i += 50) {
      const batch = S.importBuffer.slice(i, i + 50);
      for (const t of batch) {
        const d = t.data;
        const row = [
          `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`,
          '00h00', t.descricao, t.valor.toFixed(2).replace('.',','), '', '', '', '',
          t.tipo, t.cat, t.sub, t.conta, t.origem||'ofx-import', t.mesAno, '', Date.now()
        ];
        await appendRow(SHEET_DADOS, row);
        S.transactions.push({
          id: Date.now(), rowIndex: -1,
          data: d, hora: '', descricao: t.descricao,
          valor: t.valor, valorSigned: t.tipo==='despesa'?-t.valor:t.valor,
          tipo: t.tipo, categoria: t.cat, subcategoria: t.sub,
          conta: t.conta, origem: t.origem||'ofx-import', observacao: '',
          mesAno: t.mesAno, idNF: '', categorizadoNoExcel: true
        });
        done++;
      }
      const pct = Math.round((done / total) * 100);
      bar.style.width = pct + '%';
      txt.textContent = `Gravando ${done} / ${total}...`;
      await new Promise(r => setTimeout(r, 0));
      loteCount++;
      // Renovar sessão a cada 10 lotes para evitar expiração
      if (loteCount % 10 === 0) {
        S.workbookSessionId = null;
        await createWorkbookSession();
      }
    }
    prog.classList.add('hidden');
    cancelImport();
    renderAll();
    showToast(`✓ ${total} transações importadas`, 'verde');
  } catch(e) {
    prog.classList.add('hidden');
    alert('Erro ao importar: ' + e.message);
  }
}

/* ============================================================
   MODAL DE MAPEAMENTO DE COLUNAS
   ============================================================ */
function showModalMapeamento(rows, fileName, callback) {
  const header = (rows[0] || []).map((h, i) => `<option value="${i}">${h || 'Coluna '+(i+1)}</option>`).join('');
  ['map-data','map-desc','map-valor'].forEach(id => {
    const el = document.getElementById(id);
    el.innerHTML = '<option value="-1">— Selecione —</option>' + header;
  });
  document.getElementById('mapeamento-titulo').textContent = 'Mapear colunas — ' + fileName;
  window.mapeamentoPendente = { rows, fileName, callback };
  openModal('mapeamento');
}

function confirmarMapeamento() {
  const iData  = parseInt(document.getElementById('map-data').value);
  const iDesc  = parseInt(document.getElementById('map-desc').value);
  const iValor = parseInt(document.getElementById('map-valor').value);
  if (iData < 0 || iDesc < 0 || iValor < 0) {
    showToast('Selecione as três colunas', 'amarelo'); return;
  }
  closeModal('mapeamento');
  if (window.mapeamentoPendente?.callback) {
    window.mapeamentoPendente.callback({ data: iData, desc: iDesc, valor: iValor });
  }
  window.mapeamentoPendente = null;
}
