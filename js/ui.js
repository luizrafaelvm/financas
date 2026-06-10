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
    buildIndex();
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

/* === RECORRENTES === */
function toggleValorVariavel() {
  const v = document.getElementById('rec-variavel')?.value==='sim';
  document.getElementById('grupo-valor-fixo')
    ?.classList.toggle('hidden', v);
  document.getElementById('grupo-valor-variavel')
    ?.classList.toggle('hidden', !v);
}

function abrirModalRecorrente() {
  document.getElementById('rec-edit-id').value = '';
  document.getElementById('rec-desc').value = '';
  document.getElementById('rec-valor').value = '';
  document.getElementById('rec-valor-med').value = '';
  document.getElementById('rec-dia').value = '10';
  document.getElementById('rec-variavel').value = 'nao';
  document.getElementById('rec-obs').value = '';
  document.getElementById('rec-cat').value = 'Moradia';
  document.getElementById('rec-sub').value = '';
  document.getElementById('rec-modal-titulo').textContent =
    'Novo Recorrente';
  document.getElementById('rec-btn-desativar').style.display='none';
  toggleValorVariavel();
  document.getElementById('modal-recorrente')
    .classList.remove('hidden');
}

function editarRecorrente(id) {
  const r = S.recorrentes.find(x=>String(x.id)===String(id));
  if (!r) return;
  document.getElementById('rec-edit-id').value = r.id;
  document.getElementById('rec-desc').value = r.descricao;
  document.getElementById('rec-variavel').value =
    r.variavel?'sim':'nao';
  document.getElementById('rec-valor').value = r.valor;
  document.getElementById('rec-valor-med').value =
    r.ultimoValor||r.valor;
  document.getElementById('rec-dia').value = r.diaVencimento;
  document.getElementById('rec-cat').value = r.categoria;
  document.getElementById('rec-sub').value = r.subcategoria||'';
  document.getElementById('rec-conta').value = r.conta;
  document.getElementById('rec-obs').value = r.observacao||'';
  document.getElementById('rec-modal-titulo').textContent =
    'Editar Recorrente';
  document.getElementById('rec-btn-desativar').style.display='';
  toggleValorVariavel();
  document.getElementById('modal-recorrente')
    .classList.remove('hidden');
}

async function saveRecorrente() {
  const variavel =
    document.getElementById('rec-variavel').value==='sim';
  const rec = {
    descricao: document.getElementById('rec-desc').value.trim(),
    variavel,
    valor: parseFloat(document.getElementById(
      variavel?'rec-valor-med':'rec-valor').value)||0,
    diaVencimento:
      parseInt(document.getElementById('rec-dia').value)||1,
    categoria: document.getElementById('rec-cat').value,
    subcategoria: document.getElementById('rec-sub').value,
    conta: document.getElementById('rec-conta').value,
    observacao: document.getElementById('rec-obs').value,
    tipo: 'despesa', ativo: true
  };
  if (!rec.descricao) {
    alert('Informe a descrição.'); return;
  }
  const editId = document.getElementById('rec-edit-id').value;
  showLoading(true,'Salvando recorrente...');
  try {
    if (editId) {
      await atualizarRecorrente(editId,
        {...rec, ultimoValor:rec.valor, id:editId});
    } else {
      await salvarRecorrente(rec);
    }
    closeModal('recorrente');
    renderRecorrentes();
    showLoading(false);
    showToast('✓ Recorrente salvo','verde');
  } catch(e) {
    showLoading(false);
    alert('Erro: '+e.message);
  }
}

async function desativarRecorrente() {
  const id = document.getElementById('rec-edit-id').value;
  if (!id||!confirm('Desativar este recorrente?')) return;
  showLoading(true,'Desativando...');
  try {
    const r = S.recorrentes.find(x=>String(x.id)===String(id));
    await atualizarRecorrente(id, {...r, ativo:false});
    closeModal('recorrente');
    renderRecorrentes();
    showLoading(false);
    showToast('Recorrente desativado','amarelo');
  } catch(e) {
    showLoading(false);
    alert('Erro: '+e.message);
  }
}

function cadastrarSugestao(s) {
  document.getElementById('rec-desc').value = s.descricao;
  document.getElementById('rec-variavel').value =
    s.variavel?'sim':'nao';
  document.getElementById('rec-valor').value = s.valor;
  document.getElementById('rec-valor-med').value = s.valor;
  document.getElementById('rec-cat').value = s.categoria||'Outros';
  document.getElementById('rec-sub').value = s.subcategoria||'';
  document.getElementById('rec-edit-id').value = '';
  document.getElementById('rec-btn-desativar').style.display='none';
  document.getElementById('rec-modal-titulo').textContent =
    'Novo Recorrente';
  toggleValorVariavel();
  document.getElementById('modal-recorrente')
    .classList.remove('hidden');
}

/* === PAGAMENTO MENSAL DE RECORRENTES === */
function _isPago(rec, mesAno) {
  return (rec.pagoMeses || '').split(',').includes(mesAno);
}

async function togglePagamentoRec(recId, mesAno) {
  const rec = (S.recorrentes || []).find(r => String(r.id) === String(recId));
  if (!rec) return;
  const meses = (rec.pagoMeses || '').split(',').filter(Boolean);
  const idx   = meses.indexOf(mesAno);
  if (idx >= 0) {
    meses.splice(idx, 1);
  } else {
    meses.push(mesAno);
  }
  const novoValor = meses.join(',');
  rec.pagoMeses = novoValor;
  try {
    await atualizarRecorrente(recId, { pagoMeses: novoValor });
  } catch(e) {
    console.error('[REC] Erro ao salvar pagoMeses:', e);
  }
  renderRecorrentes();
}

let _recSortDesc = false;

function toggleSortRec() {
  _recSortDesc = !_recSortDesc;
  const icon  = document.getElementById('sort-rec-icon');
  const label = document.getElementById('sort-rec-label');
  if (icon)  icon.textContent  = _recSortDesc ? '↓' : '↕';
  if (label) label.textContent = _recSortDesc ? 'Maior → menor' : 'Ordenar por valor';
  renderRecorrentes();
}

/* === RELATÓRIO MENSAL === */
function popularSelectRelMes() {
  const sel = document.getElementById('rel-mes-select');
  if (!sel) return;
  sel.innerHTML = '';
  const meses = (S._mesesDisponiveis || []).slice(0, 12);
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun',
                 'Jul','Ago','Set','Out','Nov','Dez'];
  meses.forEach(m => {
    const [ano, mes] = m.split('-');
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = `${nomes[parseInt(mes)-1]}/${ano}`;
    if (m === S.mesAtual) opt.selected = true;
    sel.appendChild(opt);
  });
}

function montarContextoRelatorio(mesAno) {
  const res   = resumoMes(mesAno);
  const cats  = gastosPorCategoria(mesAno);
  const txs   = txsMes(mesAno);
  const top10 = txs
    .filter(t => t.tipo === 'despesa')
    .sort((a,b) => b.valor - a.valor)
    .slice(0, 10)
    .map(t => ({
      desc: t.descricao, valor: t.valor,
      cat: t.categoria, data: t.data
    }));

  const [ano, mes] = mesAno.split('-').map(Number);
  const dtAnt = new Date(ano, mes - 2, 1);
  const mesAnt = `${dtAnt.getFullYear()}-`
    + String(dtAnt.getMonth()+1).padStart(2,'0');
  const resAnt = resumoMes(mesAnt);

  const recAtivos = (S.recorrentes||[]).filter(r => r.ativo);
  const totalRec  = recAtivos.reduce(
    (s,r) => s + (r.ultimoValor||r.valor), 0);

  const renda = parseFloat(
    S.config?.renda_mensal_estimada ||
    localStorage.getItem('rfm_renda') || 0);

  return {
    mesAno, renda,
    receitas:  res.receitas,
    despesas:  res.despesas,
    saldo:     res.receitas - res.despesas,
    comprometimento: renda > 0
      ? Math.round(res.despesas / renda * 100) : null,
    categorias: cats.map(([cat, total]) => ({
      nome: cat, valor: total,
      pctRenda: renda > 0
        ? Math.round(total / renda * 100) : null
    })),
    top10Gastos: top10,
    recorrentes: {
      total: totalRec,
      itens: recAtivos.map(r => ({
        desc: r.descricao,
        valor: r.ultimoValor || r.valor,
        cat: r.categoria,
        variavel: r.variavel
      }))
    },
    comparativoMesAnterior: {
      mesAno: mesAnt,
      receitas: resAnt.receitas,
      despesas: resAnt.despesas,
      variacaoDespesas: resAnt.despesas > 0
        ? Math.round(
            (res.despesas - resAnt.despesas)
            / resAnt.despesas * 100)
        : null
    }
  };
}

async function gerarRelatorioMensal() {
  const apiKey = localStorage.getItem('rfm_claude_key');
  if (!apiKey) {
    alert('Configure a Claude API Key em Configurações primeiro.');
    showSection('configuracoes', null);
    return;
  }

  const mesAno = document.getElementById('rel-mes-select')?.value
    || S.mesAtual;
  const [ano, mes] = mesAno.split('-');
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const nomeMes = `${nomes[parseInt(mes)-1]}/${ano}`;

  const ctx = montarContextoRelatorio(mesAno);

  const container = document.getElementById('chat-messages');
  container.innerHTML +=
    `<div class="msg-bubble msg-user">📊 Gerar relatório completo de ${nomeMes}</div>`;

  const typingId = 'typing-' + Date.now();
  container.innerHTML +=
    `<div class="msg-bubble msg-ai"><span id="${typingId}">⏳ Analisando ${nomeMes}...</span></div>`;
  container.scrollTop = container.scrollHeight;

  const systemPrompt = `Você é um consultor financeiro pessoal direto, \
empático e sem julgamentos.
O usuário é Rafael, advogado, sócio de escritório, pai de duas filhas.

REGRAS ABSOLUTAS — jamais violar:
- Medicamentos antidepressivos e saúde mental: ESSENCIAIS, \
nunca questionar ou sugerir corte
- Pensão alimentícia (duas filhas): obrigação legal, \
nunca sugerir redução
- Financiamento imobiliário: obrigação contratual, nunca sugerir corte
- Categorias protegidas: Moradia, Filhas, Saúde, Financiamentos

Gere um relatório mensal estruturado com exatamente estas seções:

## 📋 RESUMO EXECUTIVO
3-4 frases: saldo do mês, comprometimento de renda, \
comparativo com mês anterior.

## 📊 ANÁLISE POR CATEGORIA
Top 5 categorias de gasto com valor e % da renda. \
Destaque as que merecem atenção.

## 🔝 TOP 3 MAIORES GASTOS
Os três maiores gastos individuais com contexto breve.

## 🔄 RECORRENTES
Total de compromissos fixos e variáveis. \
Algum que merece revisão (exceto os protegidos)?

## 🚨 ALERTAS
Categorias em excesso, padrões preocupantes ou \
variações bruscas vs. mês anterior.

## 💡 ONDE ECONOMIZAR
2-3 sugestões concretas e realistas \
(apenas categorias não protegidas).

## ✅ 3 AÇÕES PARA O PRÓXIMO MÊS
Ações específicas e mensuráveis que Rafael pode tomar agora.

Use valores em R$. Seja direto, prático e empático. \
Responda em português brasileiro.`;

  const userMsg = `Dados financeiros de ${nomeMes}:\n\n`
    + JSON.stringify(ctx, null, 2)
    + `\n\nGere o relatório mensal completo.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(()=>({}));
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const texto = data.content?.[0]?.text || 'Sem resposta.';

    const typingEl = document.getElementById(typingId);
    if (typingEl) {
      typingEl.closest('.msg-bubble').innerHTML =
        formatarMarkdownRelatorio(texto);
    }

    window._ultimoRelatorio = texto;
    document.getElementById('btn-copiar-relatorio').style.display = '';
    container.scrollTop = container.scrollHeight;

  } catch(e) {
    const typingEl = document.getElementById(typingId);
    if (typingEl) {
      typingEl.closest('.msg-bubble').innerHTML =
        `❌ Erro: ${escHtml(e.message)}`;
    }
    container.scrollTop = container.scrollHeight;
  }
}

function copiarRelatorio() {
  if (!window._ultimoRelatorio) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(window._ultimoRelatorio)
      .then(() => showToast('📋 Relatório copiado!','verde'))
      .catch(() => _copiarFallback());
  } else {
    _copiarFallback();
  }
}

function _copiarFallback() {
  const ta = document.createElement('textarea');
  ta.value = window._ultimoRelatorio;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast('📋 Copiado!','verde');
}

/* === VER NF VINCULADA === */
function verNF(lancamentoId) {
  const mapa = JSON.parse(localStorage.getItem('nf_lancamentos') || '{}');
  const nfData = mapa[String(lancamentoId)];
  if (!nfData) { showToast('NF não encontrada', 'amarelo'); return; }

  const dataAnalise = nfData.dataAnalise
    ? new Date(nfData.dataAnalise).toLocaleDateString('pt-BR') : '—';

  const linhas = (nfData.items || []).map(it => `
    <tr>
      <td style="font-size:12px">${escHtml(it.descricao || '')}</td>
      <td style="text-align:center;font-size:12px">${it.quantidade || 1}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace;font-size:12px">${fmtBRL(it.valor_unitario || 0)}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace;font-size:12px">${fmtBRL(it.valor_total_item || it.total || 0)}</td>
    </tr>`).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-ver-nf';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:560px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div class="modal-title" style="margin:0">📄 Nota Fiscal</div>
        <div style="font-size:12px;color:var(--text2)">${escHtml(nfData.estabelecimento || '')} · ${dataAnalise}</div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th style="text-align:center">Qtd</th>
              <th style="text-align:right">Valor Unit.</th>
              <th style="text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${linhas || '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px">Sem itens registrados</td></tr>'}</tbody>
        </table>
      </div>
      <div style="margin-top:14px;text-align:right;font-family:'DM Mono',monospace;font-size:16px;font-weight:600;color:var(--green)">
        Total: ${fmtBRL(nfData.total || 0)}
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="document.getElementById('modal-ver-nf').remove()">✕ Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

/* === EXPORTAR PDF MENSAL === */
function exportarRelatorioPDF(mesAno) {
  if (typeof window.jspdf === 'undefined') {
    showToast('jsPDF não carregado', 'amarelo'); return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const NOMES_MES = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const [ano, mes] = (mesAno || S.mesAtual).split('-');
  const nomeMes = `${NOMES_MES[parseInt(mes)-1]} ${ano}`;

  const { receitas, despesas, saldo, renda, comprometimento } = resumoMes(mesAno);
  const cats = gastosPorCategoria(mesAno);

  const agora = new Date();
  const dtStr = `${String(agora.getDate()).padStart(2,'0')}/${String(agora.getMonth()+1).padStart(2,'0')}/${agora.getFullYear()} ${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;

  const addRodape = () => {
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(200, 200, 200);
      doc.line(15, 285, 195, 285);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(`Gerado em ${dtStr} - Dashboard Financeiro Rafael Maluf`, 15, 290);
    }
  };

  /* --- PÁGINA 1: Resumo executivo --- */
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 132, 255);
  doc.text('DASHBOARD FINANCEIRO - Rafael Maluf', 15, 20);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 51, 51);
  doc.text(nomeMes.toUpperCase(), 15, 30);

  const boxes = [
    { x: 15,  label: 'RECEITAS', value: fmtBRL(receitas), r: 45, g: 138, b: 78  },
    { x: 75,  label: 'DESPESAS', value: fmtBRL(despesas), r: 192, g: 57, b: 43  },
    { x: 135, label: 'SALDO',    value: fmtBRL(saldo),
      r: saldo >= 0 ? 45 : 192, g: saldo >= 0 ? 138 : 57, b: saldo >= 0 ? 78 : 43 }
  ];
  boxes.forEach(box => {
    doc.setDrawColor(180, 180, 180);
    doc.rect(box.x, 40, 55, 28, 'D');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text(box.label, box.x + 27.5, 51, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(box.r, box.g, box.b);
    doc.text(box.value, box.x + 27.5, 62, { align: 'center' });
  });

  if (renda > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 51, 51);
    doc.text(`Comprometimento de renda: ${comprometimento.toFixed(1)}%`, 15, 85);
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 51, 51);
  doc.text('TOP 5 CATEGORIAS DO MES', 15, 100);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = 108;
  cats.slice(0, 5).forEach(([cat, val]) => {
    const pctRenda = renda > 0 ? ` - ${(val / renda * 100).toFixed(1)}%` : '';
    doc.text(`- ${cat} - ${fmtBRL(val)}${pctRenda}`, 20, y);
    y += 7;
  });

  /* --- PÁGINA 2+: Lançamentos --- */
  doc.addPage();

  const txs = txsMes(mesAno)
    .slice()
    .sort((a, b) => {
      const da = a.data instanceof Date ? a.data : new Date(a.data);
      const db = b.data instanceof Date ? b.data : new Date(b.data);
      return da - db;
    });

  const COL = { dataX: 15, descX: 41, catX: 122, valorX: 195 };

  const addHeaderTabela = (pageY) => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Data',      COL.dataX,  pageY);
    doc.text('Descricao', COL.descX,  pageY);
    doc.text('Categoria', COL.catX,   pageY);
    doc.text('Valor',     COL.valorX, pageY, { align: 'right' });
    doc.setDrawColor(180, 180, 180);
    doc.line(15, pageY + 2, 195, pageY + 2);
    return pageY + 7;
  };

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 51, 51);
  doc.text(`LANCAMENTOS - ${nomeMes.toUpperCase()}`, 15, 14);

  let ty = addHeaderTabela(20);
  let count = 0;

  txs.forEach((t) => {
    if (count > 0 && count % 40 === 0) {
      doc.addPage();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 51, 51);
      doc.text(`LANCAMENTOS - ${nomeMes.toUpperCase()} (cont.)`, 15, 12);
      ty = addHeaderTabela(18);
    }

    if (count % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      doc.rect(15, ty - 4, 180, 6, 'F');
    }

    const dataStr = fmtData(t.data);
    const descStr = (t.descricao || '').substring(0, 38);
    const catStr  = (t.categoria  || '').substring(0, 18);
    const sinal   = t.tipo === 'receita' ? '+' : '-';
    const valorStr = `${sinal}${fmtBRL(t.valor)}`;
    const cor = t.tipo === 'receita' ? [45, 138, 78] : [192, 57, 43];

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 51, 51);
    doc.text(dataStr, COL.dataX, ty);
    doc.text(descStr, COL.descX, ty);
    doc.text(catStr,  COL.catX,  ty);
    doc.setTextColor(...cor);
    doc.text(valorStr, COL.valorX, ty, { align: 'right' });

    ty += 6;
    count++;
  });

  ty += 2;
  doc.setDrawColor(180, 180, 180);
  doc.line(15, ty, 195, ty);
  ty += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Total de lancamentos: ${txs.length}`, 15, ty);

  addRodape();
  doc.save(`financas-${mesAno}.pdf`);
  showToast('PDF gerado com sucesso!', 'verde');
}

function formatarMarkdownRelatorio(txt) {
  return txt
    .replace(/^## (.+)$/gm,
      '<div style="font-size:13px;font-weight:700;'
      +'color:var(--blue);margin:18px 0 6px 0">$1</div>')
    .replace(/^### (.+)$/gm,
      '<div style="font-size:12px;font-weight:600;'
      +'color:var(--text2);margin:10px 0 4px 0">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm,
      '<div style="padding-left:12px;margin:2px 0">'
      +'· $1</div>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

/* ============================================================
   EM ABERTO — GastosCartao read-only
   ============================================================ */
let _lancTab = 'aberto';
let _gcMesFiltro = null;

function _gcMesStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function switchLancTab(tab) {
  _lancTab = tab;
  const pAberto = document.getElementById('pane-aberto');
  const pHist   = document.getElementById('pane-hist');
  const bAberto = document.getElementById('stab-aberto');
  const bHist   = document.getElementById('stab-hist');
  if (!pAberto) return;
  pAberto.style.display = tab === 'aberto' ? '' : 'none';
  pHist.style.display   = tab === 'hist'   ? '' : 'none';
  if (bAberto) {
    bAberto.style.borderBottom = tab === 'aberto' ? '2px solid var(--blue)' : '2px solid transparent';
    bAberto.style.color        = tab === 'aberto' ? 'var(--text)' : 'var(--text3)';
    bAberto.style.fontWeight   = tab === 'aberto' ? '600' : '400';
    bHist.style.borderBottom   = tab === 'hist'   ? '2px solid var(--blue)' : '2px solid transparent';
    bHist.style.color          = tab === 'hist'   ? 'var(--text)' : 'var(--text3)';
    bHist.style.fontWeight     = tab === 'hist'   ? '600' : '400';
  }
  if (tab === 'aberto') renderEmAberto();
}

function renderEmAberto() {
  const el = document.getElementById('pane-aberto');
  if (!el) return;
  const rows = S.gastosCartao || [];

  if (!rows.length) {
    el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">
      <div style="font-size:36px;margin-bottom:12px">📭</div>
      <div>Nenhuma transação do GastosCartao carregada.</div>
    </div>`;
    return;
  }

  const meses = [...new Set(rows.map(r => _gcMesStr(r.date)).filter(Boolean))].sort().reverse();
  if (!_gcMesFiltro || !meses.includes(_gcMesFiltro)) _gcMesFiltro = meses[0];

  const filtradas = rows
    .filter(r => _gcMesStr(r.date) === _gcMesFiltro)
    .sort((a, b) => b.date - a.date);

  const total = filtradas.reduce((s, r) => s + r.valor, 0);

  const opts = meses.map(m => {
    const [y, mo] = m.split('-');
    const label = new Date(+y, +mo - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return `<option value="${m}" ${m === _gcMesFiltro ? 'selected' : ''}>${label}</option>`;
  }).join('');

  const linhas = filtradas.map(r => {
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const { cat } = categorizar(r.descricao);
    const conta = r.cartao === '2812' ? 'itau-2812'
                : r.cartao === '4141' ? 'itau-4141' : r.cartao;
    return `
    <div style="display:flex;align-items:center;gap:12px;
      padding:12px 16px;border-bottom:1px solid var(--border)">
      <div style="min-width:38px;text-align:center">
        <div style="font-size:13px;font-weight:600">${dateStr}</div>
        <div style="font-size:10px;color:var(--text3)">${r.timeStr}</div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:500;white-space:nowrap;
          overflow:hidden;text-overflow:ellipsis">${r.descricao}</div>
        <div style="font-size:11px;color:var(--text3)">${cat || 'Outros'} · ${conta}</div>
      </div>
      <div class="mono" style="font-size:14px;color:var(--red);
        font-weight:600;flex-shrink:0">${fmtBRL(r.valor)}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;
      margin-bottom:16px;gap:12px">
      <select onchange="_gcMesFiltro=this.value;renderEmAberto()"
        style="background:var(--card);border:1px solid var(--border);
        color:var(--text);border-radius:8px;padding:6px 10px;font-size:13px">
        ${opts}
      </select>
      <div>
        <span style="font-size:12px;color:var(--text3);margin-right:8px">
          ${filtradas.length} transações</span>
        <span class="mono" style="font-size:18px;color:var(--red);font-weight:700">
          ${fmtBRL(total)}</span>
      </div>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      ${linhas || '<div style="padding:32px;text-align:center;color:var(--text3)">Nenhuma transação neste mês</div>'}
    </div>
    <div style="text-align:center;margin-top:10px;font-size:11px;color:var(--text3)">
      Fonte: GastosCartao.xlsx · somente leitura
    </div>`;
}
