// ============================================================
// UI.JS — Modais, ações do usuário e interações gerais
// Depende de: config.js, data.js, graph.js, render.js
// ============================================================
'use strict';

/* ============================================================
   LOADING
   ============================================================ */
function showLoading(show, msg='Carregando...') {
  const el = document.getElementById('loading-overlay');
  el.classList.toggle('hidden', !show);
  if (msg) document.getElementById('loading-text').textContent = msg;
}

/* ============================================================
   MODAIS
   ============================================================ */
function openModal(id) {
  if (id==='lancamento') {
    document.getElementById('lc-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('lc-desc').value = '';
    document.getElementById('lc-valor').value = '';
    document.getElementById('lc-obs').value = '';
    document.getElementById('lc-recorrente').checked = false;
  }
  document.getElementById(`modal-${id}`).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(`modal-${id}`).classList.add('hidden');
}

/* ============================================================
   LANÇAMENTO — NOVO
   ============================================================ */
function autoCatLancamento() {
  const desc = document.getElementById('lc-desc').value;
  const { cat, sub } = categorizar(desc);
  document.getElementById('lc-cat').value = cat;
  document.getElementById('lc-sub').value = sub;
}

async function saveLancamento() {
  const data  = document.getElementById('lc-data').value;
  const desc  = document.getElementById('lc-desc').value.trim();
  const valor = parseFloat(document.getElementById('lc-valor').value);
  const tipo  = document.getElementById('lc-tipo').value;
  const conta = document.getElementById('lc-conta').value;
  const cat   = document.getElementById('lc-cat').value;
  const sub   = document.getElementById('lc-sub').value;
  const obs   = document.getElementById('lc-obs').value;

  if (!data || !desc || isNaN(valor) || valor <= 0) {
    alert('Preencha todos os campos obrigatórios (Data, Descrição, Valor).');
    return;
  }

  const d     = new Date(data);
  const mesAno = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const id    = Date.now();
  const row = [
    id,
    `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`,
    desc,
    tipo === 'despesa' ? -valor : valor,
    tipo, cat, sub, conta, 'manual', obs, mesAno
  ];

  showLoading(true, 'Salvando lançamento...');
  try {
    await appendRow(SHEET_DADOS, row);
    // Atualizar estado local
    S.transactions.push({
      id, rowIndex: -1,
      data: d, hora: '',
      descricao: desc, valor,
      valorSigned: tipo==='despesa' ? -valor : valor,
      tipo, categoria: cat, subcategoria: sub,
      conta, origem: 'manual', observacao: obs,
      mesAno, idNF: '', categorizadoNoExcel: true
    });
    S._cache = {};
    closeModal('lancamento');
    renderAll();
    if (S.mesAtual !== mesAno) S.mesAtual = mesAno;
    renderAll();
    showLoading(false);
  } catch (e) {
    showLoading(false);
    alert('Erro ao salvar: ' + e.message);
  }
}

/* ============================================================
   METAS
   ============================================================ */
function editMeta(cat) {
  document.getElementById('meta-modal-title').textContent = `Meta: ${cat}`;
  document.getElementById('meta-cat').value = cat;
  const m = S.metas[cat];
  document.getElementById('meta-teto').value = m?.teto || '';
  document.getElementById('meta-alerta').value = m?.alerta || 80;
  openModal('meta');
}

async function saveMeta() {
  const cat   = document.getElementById('meta-cat').value;
  const teto  = parseFloat(document.getElementById('meta-teto').value);
  const alerta= parseFloat(document.getElementById('meta-alerta').value)||80;
  if (!cat || isNaN(teto)) { alert('Preencha a categoria e o teto.'); return; }

  showLoading(true,'Salvando meta...');
  try {
    // Check if exists
    const raw = await getSheetValues(SHEET_METAS);
    let rowNum = -1;
    if (raw) {
      for (let i=1;i<raw.length;i++) {
        if (raw[i][0]===cat) { rowNum=i+1; break; }
      }
    }
    if (rowNum>0) {
      await graphFetch(
        `/me/drive/items/${S.fileId}/workbook/worksheets/${encodeURIComponent(SHEET_METAS)}/range(address='B${rowNum}:C${rowNum}')`,
        {method:'PATCH',body:{values:[[teto,alerta]]}}
      );
    } else {
      await appendRow(SHEET_METAS,[cat,teto,alerta]);
    }
    S.metas[cat] = { teto, alerta };
    closeModal('meta');
    renderMetas();
    renderHome();
    showLoading(false);
  } catch(e) {
    showLoading(false);
    alert('Erro: '+e.message);
  }
}

/* ============================================================
   ASSISTENTE IA (Claude API)
   ============================================================ */
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = '';
  await sendMessage(msg);
}

function sendChip(el) {
  sendMessage(el.textContent);
}

async function sendMessage(msg) {
  const container = document.getElementById('chat-messages');

  // Adicionar mensagem do usuário
  container.innerHTML += `<div class="msg-bubble msg-user">${escHtml(msg)}</div>`;

  // Thinking indicator
  const thinkId = 'think-' + Date.now();
  container.innerHTML += `<div class="msg-thinking" id="${thinkId}">
    <div class="dot"></div><div class="dot"></div><div class="dot"></div>
  </div>`;
  container.scrollTop = container.scrollHeight;

  const apiKey = localStorage.getItem('rfm_claude_key') || '';
  if (!apiKey) {
    document.getElementById(thinkId)?.remove();
    container.innerHTML += `<div class="msg-bubble msg-ai">⚠️ Configure sua Anthropic API Key em Configurações para ativar o assistente.</div>`;
    container.scrollTop = container.scrollHeight;
    return;
  }

  // Preparar contexto financeiro
  const mes = S.mesAtual;
  const { receitas, despesas, saldo, renda, comprometimento } = resumoMes(mes);
  const cats = gastosPorCategoria(mes);
  const context = {
    mes: mesAnoLabel(mes),
    saldo: fmtBRL(saldo),
    receitas: fmtBRL(receitas),
    despesas: fmtBRL(despesas),
    comprometimento: comprometimento.toFixed(1)+'%',
    renda_estimada: fmtBRL(renda),
    gastos_por_categoria: Object.fromEntries(cats.map(([c,v])=>[c,fmtBRL(v)])),
    top5_gastos: txsMes(mes).filter(t=>t.tipo==='despesa').sort((a,b)=>b.valor-a.valor).slice(0,5).map(t=>({
      descricao: t.descricao, valor: fmtBRL(t.valor), categoria: t.categoria
    }))
  };

  S.chatHistory.push({ role: 'user', content: msg });
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `Você é um consultor financeiro pessoal direto e empático do Rafael, advogado, pai de duas filhas.
REGRAS ABSOLUTAS:
- Gastos com medicamentos antidepressivos, saúde mental e consultas médicas são ESSENCIAIS — jamais questione.
- Pensão alimentícia das filhas é obrigação legal — nunca sugira corte.
- Financiamento imobiliário é obrigação contratual — nunca sugira corte.
- Seja direto, prático, sem julgamentos morais.
- Foque em onde é REALMENTE possível economizar.
- Use valores em R$ (reais brasileiros).
- Responda sempre em português brasileiro.
- Seja conciso (máximo 300 palavras por resposta).

CONTEXTO FINANCEIRO ATUAL (${context.mes}):
${JSON.stringify(context, null, 2)}`,
        messages: S.chatHistory.slice(-6)
      })
    });
    const data = await res.json();
    const reply = data.content?.[0]?.text || 'Não consegui processar sua pergunta.';
    S.chatHistory.push({ role: 'assistant', content: reply });
    document.getElementById(thinkId)?.remove();
    container.innerHTML += `<div class="msg-bubble msg-ai">${escHtml(reply).replace(/\n/g,'<br>')}</div>`;
  } catch(e) {
    document.getElementById(thinkId)?.remove();
    container.innerHTML += `<div class="msg-bubble msg-ai">❌ Erro ao conectar à IA: ${escHtml(e.message)}</div>`;
  }
  container.scrollTop = container.scrollHeight;
}

/* ============================================================
   CONFIGURAÇÕES
   ============================================================ */
function initConfiguracoes() {
  const renda = S.config.renda_mensal_estimada || '';
  if (renda) document.getElementById('cfg-renda').value = renda;
  const key = localStorage.getItem('rfm_claude_key') || '';
  if (key) document.getElementById('cfg-apikey').value = key;
}

async function clearCache() {
  if (!confirm('Limpar cache local? Você será redirecionado para re-autenticar.')) return;
  localStorage.removeItem('rfm_file_id');
  localStorage.removeItem('rfm_claude_key');
  location.reload();
}

function exportarJSON() {
  const data = {
    exportado_em: new Date().toISOString(),
    mes_atual: S.mesAtual,
    transacoes: S.transactions,
    metas: S.metas,
    config: S.config
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `financas-rafael-${S.mesAtual}.json`;
  a.click(); URL.revokeObjectURL(url);
}
