// ============================================================
// RENDER.JS — Renderização de todas as seções do dashboard
// Depende de: config.js, data.js
// ============================================================
'use strict';

/* ============================================================
   NAVEGAÇÃO
   ============================================================ */
function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(s =>
    s.classList.remove('active'));
  document.querySelectorAll('.nav-btn,.bnav-btn').forEach(b =>
    b.classList.remove('active'));

  const sec = document.getElementById(`sec-${id}`);
  if (sec) sec.classList.add('active');

  document.querySelectorAll(`[data-section="${id}"]`)
    .forEach(b => b.classList.add('active'));
  if (btn) btn.classList.add('active');

  if (sec && id !== 'home') {
    const body = sec.querySelector('tbody');
    if (body) body.innerHTML = `<tr><td colspan="6"
      style="text-align:center;padding:24px;color:var(--text3)">
      Carregando...</td></tr>`;
  }

  requestAnimationFrame(() => {
    setTimeout(() => renderSection(id), 0);
  });
}

function renderSection(id) {
  const cacheKey = `${id}_${S.mesAtual}_${S.transactions.length}`;
  const cacheaveis = ['analise','diagnostico','metas'];

  if (cacheaveis.includes(id) && S._secaoCache[cacheKey]) {
    const sec = document.getElementById(`sec-${id}`);
    if (sec) sec.innerHTML = S._secaoCache[cacheKey];
    return;
  }

  switch(id) {
    case 'home':         renderHome();           break;
    case 'lancamentos':  renderEmAberto(); renderLancamentos(); break;
    case 'analise':      renderAnalise();         break;
    case 'diagnostico':  renderDiagnostico();     break;
    case 'metas':        renderMetas();           break;
    case 'recorrentes':  renderRecorrentes?.();   break;
    case 'importar':                              break;
    case 'assistente': {
      const relSel = document.getElementById('rel-mes-select');
      if (relSel && !relSel.options.length) {
        mesesToDisplay().forEach(m => {
          const opt = document.createElement('option');
          opt.value = m; opt.textContent = mesAnoLabel(m);
          if (m === S.mesAtual) opt.selected = true;
          relSel.appendChild(opt);
        });
      }
      popularSelectRelMes?.();
      break;
    }
    case 'configuracoes':
      initConfiguracoes?.();
      renderizarEditorRegras?.();
      break;
  }

  if (cacheaveis.includes(id)) {
    const sec = document.getElementById(`sec-${id}`);
    if (sec) S._secaoCache[cacheKey] = sec.innerHTML;
  }
}

function renderAll() {
  S._cache = {};
  initMesSelect();
  initCatFilter();
  updateHeaderBalance();
  const secAtiva = document.querySelector('.section.active');
  const idAtivo  = secAtiva?.id?.replace('sec-','') || 'home';
  renderSection(idAtivo);
}

/* ============================================================
   HOME — helper centralizado GastosCartao
   ============================================================ */
function gcResumoMes(mesAno) {
  const rows = (S.gastosCartao || []).filter(r => _gcMesStr(r.date) === mesAno);
  const total = rows.reduce((s, r) => s + r.valor, 0);
  const maior = rows.length
    ? rows.reduce((m, r) => r.valor > m.valor ? r : m, rows[0])
    : null;
  const sorted = [...rows].sort((a, b) => b.valor - a.valor);

  const porCategoria = {};
  rows.forEach(r => {
    const cat = r.catOverride || _gcCategoria(r.descricao);
    porCategoria[cat] = (porCategoria[cat] || 0) + r.valor;
  });

  return {
    total, maior, count: rows.length,
    top5:  sorted.slice(0, 5),
    top10: sorted.slice(0, 10),
    porCategoria
  };
}

function _gcCategoria(descricao) {
  const c = categorizar(descricao);
  if (c && c.cat !== 'Outros') return c.cat;
  const d = (descricao || '').toUpperCase();
  if (/FARMAC|DROGASIL|DROGA|ULTRAFARMA|PANVEL/.test(d))     return 'Saúde';
  if (/FINANC|CAIXA HABIT|PRESTACAO IMOVEL/.test(d))         return 'Moradia';
  if (/PENSAO|PENSÃO|ESCOLA|COLEGIO/.test(d))                return 'Filhas';
  if (/CARREFOUR|ZAFFARI|MERCADO|HIPER|ATACADAO/.test(d))    return 'Alimentação';
  if (/IFOOD|RAPPI|JAMES|UBER EATS/.test(d))                 return 'Alimentação';
  if (/RESTAUR|LANCHE|SUSHI|PIZZA|BURGER|CHURRASCO/.test(d)) return 'Alimentação';
  if (/NETFLIX|SPOTIFY|DISNEY|HBO|AMAZON|YOUTUBE/.test(d))   return 'Lazer';
  if (/TEATRO|CINEMA|SHOW|INGRESSO|TICKETMASTER|ESPIRITA/.test(d)) return 'Lazer';
  if (/BAR |BALADA|CERVEJ|CHOPP/.test(d))                    return 'Lazer';
  if (/UBER|99APP|TAXI|CABIFY/.test(d))                      return 'Transporte';
  if (/ANTHROPIC|MICROSOFT|ADOBE|GOOGLE ONE|ICLOUD/.test(d)) return 'Assinaturas';
  if (/ZARA|RENNER|FARM|AREZZO|HERING|RIACHUELO/.test(d))    return 'Vestuário';
  return 'Outros';
}

/* ============================================================
   HOME
   ============================================================ */
function renderHome() {
  const mes = S.mesAtual;
  const { receitas, renda, maiorGasto } = resumoMes(mes);
  const _gc = gcResumoMes(mes);
  const despesas = _gc.total;
  const saldo = receitas - despesas;
  const comprometimento = renda > 0 ? (despesas / renda * 100) : 0;

  const mesaMudou = S._lastRenderedMes !== mes;
  if (!mesaMudou && S.charts.donut) {
    updateHeaderBalance();
  }
  if (mesaMudou) {
    destroyChart('donut');
    destroyChart('area');
    S._lastRenderedMes = mes;
  }

  // ---- PAINEL DE CHOQUE ----
  const choqueEl        = document.getElementById('choque-valor');
  const choqueSub       = document.getElementById('choque-sub');
  const choqueMes       = document.getElementById('choque-mes');
  const choqueBarra     = document.getElementById('choque-barra');
  const choqueBarraLabel= document.getElementById('choque-barra-label');
  const choqueBadges    = document.getElementById('choque-badges');

  if (choqueEl) {
    choqueEl.textContent = fmtBRL(despesas);
    choqueEl.style.color = despesas > renda ? 'var(--red)' : 'var(--yellow)';
  }
  if (choqueMes) choqueMes.textContent = mesAnoLabel(mes).toUpperCase();
  if (choqueSub) {
    const sobra = receitas - despesas;
    choqueSub.textContent = sobra >= 0
      ? `Sobram ${fmtBRL(sobra)} de ${fmtBRL(renda)} estimados`
      : `⚠️ Você gastou ${fmtBRL(Math.abs(sobra))} a mais do que recebeu`;
    choqueSub.style.color = sobra >= 0 ? 'var(--text2)' : 'var(--red)';
  }
  if (choqueBarra) {
    const pct = Math.min(comprometimento, 100);
    choqueBarra.style.width = pct + '%';
    choqueBarra.style.background = pct >= 90 ? 'var(--red)'
      : pct >= 70 ? 'var(--yellow)' : 'var(--green)';
  }
  if (choqueBarraLabel) {
    choqueBarraLabel.textContent =
      `${comprometimento.toFixed(1)}% da renda estimada comprometida`;
  }
  if (choqueBadges) {
    const nTxs = _gc.count;
    const nCats = new Set(_gc.top5.map(r => categorizar(r.descricao).cat)).size;
    choqueBadges.innerHTML = `
      <span class="badge ${comprometimento>=90?'badge-red':
        comprometimento>=70?'badge-yellow':'badge-green'}">
        ${comprometimento.toFixed(0)}% da renda</span>
      <span class="badge badge-gray">${nTxs} transações</span>
      <span class="badge badge-gray">${nCats} categorias</span>`;
  }

  // ---- SUMMARY GRID ----
  const totalRecorrentes = S.recorrentes
    .filter(r => r.ativo)
    .reduce((s,r) => s + (r.variavel ? r.ultimoValor || r.valor : r.valor), 0);

  document.getElementById('summary-grid').innerHTML = `
    ${summaryCard('RECEITAS','var(--green)',fmtBRL(receitas),'do mês')}
    ${summaryCard('DESPESAS','var(--red)',fmtBRL(despesas),'cartão (em aberto)')}
    ${summaryCard('RECORRENTES','var(--orange)',fmtBRL(totalRecorrentes),'compromisso fixo')}
    ${summaryCard('MAIOR GASTO','var(--yellow)',
      maiorGasto ? fmtBRL(maiorGasto.valor) : '—',
      maiorGasto ? maiorGasto.descricao.substring(0,22) : 'nenhum')}`;

  // ---- TOP 5 GASTOS ----
  const top5   = _gc.top5;
  const top5El = document.getElementById('home-top5');
  if (top5El) {
    top5El.innerHTML = top5.length === 0
      ? '<div style="color:var(--text3);font-size:13px">Sem gastos registrados</div>'
      : top5.map((r,i) => {
          const cat = categorizar(r.descricao).cat;
          const dateStr = (r.date instanceof Date ? r.date : new Date(r.date))
            .toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric'});
          return `
        <div style="display:flex;align-items:center;gap:12px;
          padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="width:24px;height:24px;border-radius:50%;
            background:var(--bg3);display:flex;align-items:center;
            justify-content:center;font-size:11px;font-weight:600;
            flex-shrink:0">${i+1}</div>
          <span style="width:10px;height:10px;border-radius:50%;
            background:${CORES[cat]||'#8E8E93'};flex-shrink:0"></span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;white-space:nowrap;overflow:hidden;
              text-overflow:ellipsis">${r.descricao}</div>
            <div style="font-size:11px;color:var(--text3)">
              ${cat} · ${dateStr}</div>
          </div>
          <div style="font-family:'DM Mono',monospace;color:var(--red);
            font-size:14px;white-space:nowrap;font-weight:500">
            ${fmtBRL(r.valor)}</div>
        </div>`;
        }).join('');
  }

  // ---- COMPROMETIMENTO RECORRENTES ----
  const recEl = document.getElementById('home-recorrentes');
  if (recEl) {
    const recAtivos = S.recorrentes.filter(r=>r.ativo);
    if (!recAtivos.length) {
      recEl.innerHTML = `<div style="color:var(--text3);font-size:13px">
        Nenhum recorrente cadastrado.
        <button class="btn btn-secondary btn-sm" style="margin-left:8px"
          onclick="showSection('recorrentes',null)">
          Cadastrar →</button></div>`;
    } else {
      const totalRec = recAtivos.reduce((s,r)=>
        s+(r.variavel?r.ultimoValor||r.valor:r.valor),0);
      recEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:10px">
          <span style="font-size:13px;color:var(--text2)">
            ${recAtivos.length} recorrentes ativos</span>
          <span style="font-family:'DM Mono',monospace;color:var(--orange);
            font-weight:500">${fmtBRL(totalRec)}/mês</span>
        </div>
        ${recAtivos.slice(0,4).map(r=>`
          <div style="display:flex;justify-content:space-between;
            padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)">
            <div style="font-size:12px">${r.descricao}
              ${r.variavel?'<span style="font-size:10px;color:var(--text3)"> variável</span>':''}
            </div>
            <span style="font-family:\'DM Mono\',monospace;font-size:12px;
              color:var(--orange)">${fmtBRL(r.variavel?r.ultimoValor||r.valor:r.valor)}</span>
          </div>`).join('')}
        ${recAtivos.length > 4 ? `
          <div style="text-align:center;padding-top:8px">
            <button class="btn btn-secondary btn-sm"
              onclick="showSection('recorrentes',null)">
              Ver todos ${recAtivos.length} recorrentes →</button>
          </div>` : ''}`;
    }
  }

  // ---- CARTÕES ----
  const txsDiners = txsMes(mes).filter(t=>
    t.conta&&t.conta.toLowerCase().includes('diners'));
  const totalItau = _gc.total;
  const totalDiners = txsDiners.filter(t=>t.tipo==='despesa')
    .reduce((s,t)=>s+t.valor,0);

  const walletEl = document.getElementById('wallet-cards');
  if (walletEl) walletEl.innerHTML = `
    <div class="wallet-card"
      style="background:linear-gradient(135deg,#E67E22,#D35400);
      cursor:pointer" onclick="showSection('lancamentos',null)">
      <div class="wallet-card-bank">Itaú · Cartão de Crédito</div>
      <div class="wallet-card-num">•••• 2812 / 4141</div>
      <div class="wallet-card-label">FATURA DO MÊS</div>
      <div class="wallet-card-balance">${fmtBRL(totalItau)}</div>
    </div>
    ${totalDiners>0?`
    <div class="wallet-card"
      style="background:linear-gradient(135deg,#1A237E,#283593)">
      <div class="wallet-card-bank">Caixa · Diners Club</div>
      <div class="wallet-card-num">•••• Diners</div>
      <div class="wallet-card-label">FATURA DO MÊS</div>
      <div class="wallet-card-balance">${fmtBRL(totalDiners)}</div>
    </div>`:''}`;

  // ---- CONTAS ----
  const txsItauCC   = txsMes(mes).filter(t=>t.conta&&
    (t.conta==='itau-corrente'||t.conta.includes('corrente')));
  const txsBradesco = txsMes(mes).filter(t=>t.conta&&
    t.conta.toLowerCase().includes('bradesco'));
  const txsNubank   = txsMes(mes).filter(t=>t.conta&&
    t.conta.toLowerCase().includes('nubank'));
  const saldoItauCC   = txsItauCC.reduce((s,t)=>
    s+(t.tipo==='receita'?t.valor:-t.valor),0);
  const saldoBradesco = txsBradesco.reduce((s,t)=>
    s+(t.tipo==='receita'?t.valor:-t.valor),0);
  const saldoNubank   = txsNubank.reduce((s,t)=>
    s+(t.tipo==='receita'?t.valor:-t.valor),0);

  const contaEl = document.getElementById('conta-cards');
  if (contaEl) contaEl.innerHTML = `
    <div class="wallet-card"
      style="background:linear-gradient(135deg,#1565C0,#1976D2)">
      <div class="wallet-card-bank">Itaú · Conta Corrente</div>
      <div class="wallet-card-label">SALDO ESTIMADO</div>
      <div class="wallet-card-balance"
        style="color:${saldoItauCC>=0?'white':'#FFCDD2'}">
        ${fmtBRL(saldoItauCC)}</div>
    </div>
    ${saldoBradesco!==0||txsBradesco.length>0?`
    <div class="wallet-card"
      style="background:linear-gradient(135deg,#B71C1C,#C62828)">
      <div class="wallet-card-bank">Bradesco · Conta Corrente</div>
      <div class="wallet-card-label">SALDO ESTIMADO</div>
      <div class="wallet-card-balance">${fmtBRL(saldoBradesco)}</div>
    </div>`:''}
    ${saldoNubank!==0||txsNubank.length>0?`
    <div class="wallet-card"
      style="background:linear-gradient(135deg,#6C3483,#8E44AD)">
      <div class="wallet-card-bank">Nubank · Conta Digital</div>
      <div class="wallet-card-label">SALDO ESTIMADO</div>
      <div class="wallet-card-balance">${fmtBRL(saldoNubank)}</div>
    </div>`:''}`;

  // ---- DONUT COM LEGENDA MANUAL ----
  const catData = gastosPorCategoria(mes);
  if (!S.charts.donut && catData.length > 0) {
    const ctx = document.getElementById('chart-donut')?.getContext('2d');
    if (ctx) {
      S.charts.donut = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: catData.map(([c])=>c),
          datasets: [{
            data: catData.map(([,v])=>v),
            backgroundColor: catData.map(([c])=>CORES[c]||'#8E8E93'),
            borderWidth: 0, hoverOffset: 4
          }]
        },
        options: {
          cutout:'68%', responsive:true, maintainAspectRatio:true,
          plugins: {
            legend:{display:false},
            tooltip:{callbacks:{
              label: ctx=>`${ctx.label}: ${fmtBRL(ctx.raw)}`
            }}
          }
        }
      });
    }
  }

  // Legenda manual do donut
  const legendaEl = document.getElementById('donut-legenda');
  if (legendaEl) {
    const total = catData.reduce((s,[,v])=>s+v,0);
    legendaEl.innerHTML = catData.slice(0,8).map(([cat,val])=>`
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:10px;height:10px;border-radius:50%;
          background:${CORES[cat]||'#8E8E93'};flex-shrink:0"></span>
        <span style="font-size:12px;flex:1;color:var(--text2)">${cat}</span>
        <span style="font-family:'DM Mono',monospace;font-size:12px;
          color:var(--text)">${fmtBRL(val)}</span>
        <span style="font-size:10px;color:var(--text3);width:32px;
          text-align:right">${total>0?((val/total)*100).toFixed(0):'0'}%</span>
      </div>`).join('');
  }

  renderAlertas(mes);
  updateHeaderBalance();
}

function summaryCard(label, color, value, sub) {
  return `
    <div class="card card-p">
      <div class="card-label">${label}</div>
      <div class="card-value sm mono" style="color:${color}">${value}</div>
      <div class="card-sub">${sub}</div>
    </div>`;
}

function renderAlertas(mes) {
  const el = document.getElementById('alerts-section');
  const cats = gastosPorCategoria(mes);
  const alertas = cats.filter(([cat, val]) => {
    const meta = S.metas[cat];
    return meta && meta.teto > 0 && (val/meta.teto)*100 >= meta.alerta;
  });
  if (alertas.length === 0) { el.innerHTML=''; return; }
  el.innerHTML = `
    <div class="section-title">⚠️ Alertas</div>
    <div class="card card-p">
      ${alertas.map(([cat,val])=>{
        const m = S.metas[cat];
        const pct = Math.min((val/m.teto)*100,100);
        const cls = pct>=90?'badge-red':'badge-yellow';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:14px">${cat}</div>
            <div style="font-size:11px;color:var(--text3)">${fmtBRL(val)} de ${fmtBRL(m.teto)}</div>
          </div>
          <span class="badge ${cls}">${pct.toFixed(0)}%</span>
        </div>`;
      }).join('')}
    </div>`;
}

function destroyChart(key) {
  if (S.charts[key]) {
    try { S.charts[key].destroy(); } catch {}
    delete S.charts[key];
  }
}

/* ============================================================
   LANÇAMENTOS
   ============================================================ */
function renderLancamentos() {
  const search = (document.getElementById('search-input')?.value||'')
    .toLowerCase();
  const tipo   = document.getElementById('filter-tipo')?.value||'';
  const cat    = document.getElementById('filter-cat')?.value||'';
  const conta  = document.getElementById('filter-conta')?.value||'';

  let txs = txsMes(S.mesAtual);
  if (search) txs = txs.filter(t =>
    t.descricao.toLowerCase().includes(search) ||
    (t.categoria||'').toLowerCase().includes(search));
  if (tipo)  txs = txs.filter(t => t.tipo === tipo);
  if (cat)   txs = txs.filter(t => t.categoria === cat);
  if (conta) txs = txs.filter(t => t.conta === conta);

  const total   = txs.length;
  const perPage = S.itensPorPagina || 50;
  const paginas = Math.max(1, Math.ceil(total / perPage));
  if (S.paginaLancamentos > paginas) S.paginaLancamentos = 1;
  const inicio  = (S.paginaLancamentos - 1) * perPage;
  const fim     = Math.min(inicio + perPage, total);
  const txsPag  = txs.slice(inicio, fim);

  const body = document.getElementById('lancamentos-body');
  if (!total) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;
      padding:32px;color:var(--text3)">
      Nenhum lançamento encontrado</td></tr>`;
    document.getElementById('lancamentos-count').innerHTML = '';
    return;
  }

  const origMap = {
    'cartao-automatico':'🤖 Auto','manual':'✍️ Manual',
    'csv-import':'📄 CSV','ofx-import':'📄 OFX',
    'sms-automatico':'📱 SMS'
  };
  const nfMapa = JSON.parse(localStorage.getItem('nf_lancamentos') || '{}');

  body.innerHTML = txsPag.map(t => {
    const cor  = t.tipo==='receita'?'var(--green)':'var(--red)';
    const sinal= t.tipo==='receita'?'+':'-';
    const dot  = `<span style="width:9px;height:9px;border-radius:50%;
      background:${CORES[t.categoria]||'#8E8E93'};
      display:inline-block;margin-right:6px;flex-shrink:0"></span>`;
    const sub  = t.subcategoria && t.subcategoria !== 'Não categorizado'
      ? `<div style="font-size:11px;color:var(--text3)">${t.subcategoria}</div>`:'';
    const nfIcon = t.observacao && t.observacao.startsWith('NF:') ? ` 🧾` : '';
    const nfBadge = nfMapa[t.id]
      ? `<span class="nf-badge" onclick="verNF('${t.id}')">📄 NF</span>` : '';
    return `<tr>
      <td style="color:var(--text2);font-size:12px;white-space:nowrap">
        ${fmtData(t.data)}</td>
      <td>
        <div style="font-size:13px">${t.descricao}${nfIcon}</div>${sub}
      </td>
      <td><div style="display:flex;align-items:center">
        ${dot}<span style="font-size:12px">${t.categoria}</span>
      </div></td>
      <td><span style="background:rgba(255,255,255,.07);
        border-radius:8px;padding:2px 8px;font-size:11px">
        ${t.conta}</span></td>
      <td style="font-size:12px;color:var(--text2)">
        ${origMap[t.origem]||'•'}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace;
        color:${cor};font-size:14px;white-space:nowrap">
        ${sinal}${fmtBRL(t.valor)}</td>
      <td style="text-align:center">${nfBadge}</td>
    </tr>`;
  }).join('');

  document.getElementById('lancamentos-count').innerHTML = `
    <div style="display:flex;justify-content:space-between;
      align-items:center;flex-wrap:wrap;gap:8px;padding:4px 0">
      <span style="font-size:12px;color:var(--text3)">
        ${total} lançamentos · mostrando ${inicio+1}–${fim}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn btn-secondary btn-sm"
          onclick="irPagina(${S.paginaLancamentos-1})"
          ${S.paginaLancamentos<=1?'disabled':''}>‹</button>
        <span style="font-size:12px;color:var(--text2)">
          ${S.paginaLancamentos} / ${paginas}</span>
        <button class="btn btn-secondary btn-sm"
          onclick="irPagina(${S.paginaLancamentos+1})"
          ${S.paginaLancamentos>=paginas?'disabled':''}>›</button>
      </div>
    </div>`;
}

function irPagina(n) {
  const txs = txsMes(S.mesAtual);
  const max = Math.max(1,Math.ceil(txs.length/(S.itensPorPagina||50)));
  S.paginaLancamentos = Math.max(1, Math.min(n, max));
  renderLancamentos();
}

function initCatFilter() {
  const sel = document.getElementById('filter-cat');
  if (!sel) return;
  const cats = [...new Set(S.transactions.map(t=>t.categoria))].sort();
  sel.innerHTML = '<option value="">Todas as categorias</option>' +
    cats.map(c=>`<option value="${c}">${c}</option>`).join('');
}

/* ============================================================
   ANÁLISE POR CATEGORIA
   ============================================================ */
function renderAnalise() {
  const cats = gastosPorCategoria(S.mesAtual);
  const { renda } = resumoMes(S.mesAtual);
  const el = document.getElementById('analise-categorias');

  if (!cats.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">Sem dados para este mês</div></div>`;
    return;
  }

  el.innerHTML = cats.map(([cat, val]) => {
    const meta  = S.metas[cat];
    const teto  = meta?.teto || 0;
    const pct   = teto > 0 ? Math.min((val/teto)*100,100) : 0;
    const pctRenda = (val/renda)*100;
    const cor   = CORES[cat]||'#8E8E93';
    const barColor = pct >= 90 ? 'var(--red)' : pct >= 60 ? 'var(--yellow)' : cor;
    const isEss = ESSENCIAIS.includes(cat);
    const txsCount = txsMes(S.mesAtual).filter(t=>t.categoria===cat&&t.tipo==='despesa').length;

    return `<div class="card card-p" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="cat-dot" style="background:${cor};width:12px;height:12px"></span>
          <div>
            <div style="font-size:15px;font-weight:500">${cat}</div>
            <div style="font-size:11px;color:var(--text3)">${txsCount} lançamento${txsCount!==1?'s':''} · ${pctRenda.toFixed(1)}% da renda ${isEss?'· 🛡️ Essencial':''}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="mono" style="font-size:16px;color:${cor}">${fmtBRL(val)}</div>
          ${teto>0?`<div style="font-size:11px;color:var(--text3)">de ${fmtBRL(teto)}</div>`:''}
        </div>
      </div>
      ${teto>0?`<div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%;background:${barColor}"></div></div>`:''}
    </div>`;
  }).join('');
}

/* ============================================================
   DIAGNÓSTICO — helpers
   ============================================================ */
const _CAT_ESSENCIAIS = ['Saúde', 'Moradia', 'Filhas', 'Financiamentos'];
const _CAT_SUPERFLUAS = ['Lazer', 'Vestuário', 'Assinaturas'];

function _calcScore(resumo) {
  const renda = parseFloat(S.config?.renda_mensal_estimada) || 0;
  if (!renda) return {
    score: 50, cor: 'var(--yellow)', emoji: '🟡',
    msg: 'Configure sua renda estimada em Configurações para calcular o score.'
  };
  const pct = resumo.total / renda;
  let score = 100;
  if      (pct >= 1.0) score -= 50;
  else if (pct >= 0.9) score -= 35;
  else if (pct >= 0.8) score -= 20;
  else if (pct >= 0.7) score -= 12;
  else if (pct >= 0.6) score -= 5;

  const totalSup = _CAT_SUPERFLUAS
    .reduce((s, c) => s + (resumo.porCategoria[c] || 0), 0);
  const pctSup = totalSup / renda;
  if      (pctSup >= 0.3) score -= 20;
  else if (pctSup >= 0.2) score -= 12;
  else if (pctSup >= 0.1) score -= 6;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const cor   = score >= 70 ? 'var(--green)'
              : score >= 45 ? 'var(--yellow)' : 'var(--red)';
  const emoji = score >= 70 ? '🟢' : score >= 45 ? '🟡' : '🔴';
  const msg   = score >= 70
    ? 'Boa saúde financeira. Continue assim.'
    : score >= 45
    ? 'Atenção: renda comprometida acima de 70%.'
    : 'Situação crítica: gastos próximos ou acima da renda.';
  return { score, cor, emoji, msg };
}

function _identificarSuperfluas(resumo) {
  return _CAT_SUPERFLUAS
    .filter(c => (resumo.porCategoria[c] || 0) > 5)
    .map(c => {
      const total  = resumo.porCategoria[c];
      const renda  = parseFloat(S.config?.renda_mensal_estimada) || 0;
      const pctStr = renda > 0
        ? ` (${(total / renda * 100).toFixed(1)}% da renda)` : '';
      return {
        cat: c, total,
        sugestao: `Você gastou ${fmtBRL(total)} em ${c}${pctStr}.` +
          ` Reduzir 50% economizaria ${fmtBRL(total * 0.5)}/mês.`
      };
    })
    .sort((a, b) => b.total - a.total);
}

/* ============================================================
   DIAGNÓSTICO
   ============================================================ */
function renderDiagnostico() {
  const mes    = S.mesAtual || getMesAtual();
  const resumo = gcResumoMes(mes);
  const sc     = _calcScore(resumo);
  const sups   = _identificarSuperfluas(resumo);

  const top10HTML = resumo.top10.length
    ? resumo.top10.map((r, i) => {
        const cat = r.catOverride || _gcCategoria(r.descricao);
        const d   = r.date instanceof Date ? r.date : new Date(r.date);
        return `<div style="display:flex;align-items:center;gap:10px;
          padding:9px 0;border-bottom:1px solid var(--border)">
          <span style="min-width:20px;color:var(--text3);font-size:12px">
            ${i + 1}.</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;white-space:nowrap;
              overflow:hidden;text-overflow:ellipsis">${r.descricao}</div>
            <div style="font-size:11px;color:var(--text3)">
              ${cat} · ${d.toLocaleDateString('pt-BR',
                {day:'2-digit', month:'2-digit'})}</div>
          </div>
          <span class="mono" style="color:var(--red);font-weight:600;
            flex-shrink:0">${fmtBRL(r.valor)}</span>
        </div>`;
      }).join('')
    : '<div style="color:var(--text3);padding:16px 0">Sem dados este mês.</div>';

  const supsHTML = sups.length
    ? sups.map(s => `
      <div class="card" style="padding:14px 16px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-weight:600">💸 ${s.cat}</span>
          <span class="mono" style="color:var(--red)">${fmtBRL(s.total)}</span>
        </div>
        <div style="font-size:12px;color:var(--yellow);
          background:rgba(255,214,10,0.07);border-radius:6px;padding:8px 10px">
          💡 ${s.sugestao}
        </div>
      </div>`).join('')
    : '<div class="card" style="padding:14px 16px;color:var(--green);font-size:13px">' +
      '✅ Nenhum gasto supérfluo significativo este mês.</div>';

  const escudosHTML = _CAT_ESSENCIAIS
    .filter(c => (resumo.porCategoria[c] || 0) > 0)
    .map(c => `
      <div style="display:flex;justify-content:space-between;
        padding:9px 0;border-bottom:1px solid var(--border)">
        <span>🛡️ ${c}</span>
        <span class="mono">${fmtBRL(resumo.porCategoria[c])}</span>
      </div>`).join('');

  const html = `
    <div style="display:grid;grid-template-columns:170px 1fr;
      gap:16px;margin-bottom:20px">
      <div class="card" style="text-align:center;padding:24px 14px">
        <div style="font-size:11px;color:var(--text3);font-weight:600;
          margin-bottom:10px;text-transform:uppercase">Saúde Financeira</div>
        <div style="font-size:58px;font-weight:800;
          color:${sc.cor};line-height:1">${sc.score}</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">/ 100</div>
        <div style="font-size:20px;margin-bottom:8px">${sc.emoji}</div>
        <div style="font-size:11px;color:var(--text3);line-height:1.5">
          ${sc.msg}</div>
      </div>
      <div class="card">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px">
          🚨 Top 10 Maiores Gastos</div>
        ${top10HTML}
      </div>
    </div>
    <div style="font-size:13px;font-weight:600;margin-bottom:12px">
      💸 Gastos Supérfluos Identificados</div>
    ${supsHTML}
    ${escudosHTML ? `
    <div class="card" style="margin-top:16px">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px">
        🛡️ Essenciais Protegidos — Jamais Cortar</div>
      ${escudosHTML}
    </div>` : ''}`;

  const secEl = document.getElementById('sec-diagnostico');
  if (!secEl) return;
  const tituloEl = secEl.querySelector('.section-title');
  if (tituloEl) {
    while (tituloEl.nextSibling) secEl.removeChild(tituloEl.nextSibling);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    secEl.appendChild(wrapper);
  } else {
    secEl.innerHTML = html;
  }
}

/* ============================================================
   METAS
   ============================================================ */
function renderMetas() {
  const el = document.getElementById('metas-grid');
  const cats = gastosPorCategoria(S.mesAtual);
  const todas = [...new Set([...Object.keys(S.metas), ...cats.map(([c])=>c)])];

  if (!todas.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎯</div><div class="empty-state-text">Clique em "Nova Meta" para definir tetos por categoria</div></div>`;
    return;
  }

  el.innerHTML = todas.map(cat => {
    const meta  = S.metas[cat];
    const gasto = cats.find(([c])=>c===cat)?.[1]||0;
    const teto  = meta?.teto||0;
    const pct   = teto>0 ? Math.min((gasto/teto)*100,100) : 0;
    const cor   = pct>=90?'var(--red)':pct>=60?'var(--yellow)':'var(--green)';
    return `<div class="card meta-card">
      <div class="meta-cat">${cat}</div>
      <div class="meta-values">
        <span class="mono" style="color:var(--red)">${fmtBRL(gasto)}</span>
        <span style="color:var(--text3)">${teto>0?`/ ${fmtBRL(teto)}`:fmtBRL(0)}</span>
      </div>
      ${teto>0?`<div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%;background:${cor}"></div></div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">${pct.toFixed(0)}% utilizado</div>`
      :'<div style="font-size:11px;color:var(--text3);margin-top:6px">Sem teto definido</div>'}
      <button class="meta-edit-btn" style="margin-top:10px" onclick="editMeta('${cat}')">Editar meta →</button>
    </div>`;
  }).join('');
  renderHistoricoMetas();
}

function renderHistoricoMetas() {
  let el = document.getElementById('metas-historico');
  if (!el) {
    const grid = document.getElementById('metas-grid');
    if (!grid) return;
    el = document.createElement('div');
    el.id = 'metas-historico';
    grid.insertAdjacentElement('afterend', el);
  }

  const metas = Object.entries(S.metas || {}).filter(([, m]) => m.teto > 0);
  const meses = [...new Set(
    (S.gastosCartao || []).map(r => _gcMesStr(r.date)).filter(Boolean)
  )].sort().reverse().slice(0, 3);

  if (!metas.length || !meses.length) {
    el.innerHTML =
      '<div style="color:var(--text3);font-size:13px;padding:16px 0">' +
      'Dados insuficientes para histórico.</div>';
    return;
  }

  const resumosPorMes = {};
  meses.forEach(m => { resumosPorMes[m] = gcResumoMes(m); });

  const headerMeses = meses.map(m => {
    const [y, mo] = m.split('-');
    const label = new Date(+y, +mo - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    return `<th style="text-align:right;padding:8px 12px;font-size:11px;
      color:var(--text3)">${label}</th>`;
  }).join('');

  const rows = metas.map(([cat, meta]) => {
    const cells = meses.map(m => {
      const gasto = resumosPorMes[m].porCategoria[cat] || 0;
      const teto  = meta.teto || 0;
      const pct   = teto > 0 ? (gasto / teto) * 100 : 0;
      const cor   = pct >= 90 ? 'var(--red)'
                  : pct >= 70 ? 'var(--yellow)' : 'var(--text)';
      return `<td style="text-align:right;padding:8px 12px;font-size:12px;
        color:${cor}" class="mono">${fmtBRL(gasto)}</td>`;
    }).join('');
    return `
      <tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 12px;font-size:13px">${cat}</td>
        <td style="padding:8px 12px;font-size:12px;color:var(--text3)"
          class="mono">${fmtBRL(meta.teto)}</td>
        ${cells}
      </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="font-size:13px;font-weight:600;margin:20px 0 10px 0">
      📅 Histórico por Categoria (últimos 3 meses)</div>
    <div class="card" style="padding:0;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:8px 12px;font-size:11px;
              color:var(--text3)">Categoria</th>
            <th style="text-align:right;padding:8px 12px;font-size:11px;
              color:var(--text3)">Teto</th>
            ${headerMeses}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ============================================================
   RECORRENTES
   ============================================================ */
function renderRecorrentes() {
  const fixos     = S.recorrentes.filter(r=>r.ativo&&!r.variavel);
  const variaveis = S.recorrentes.filter(r=>r.ativo&&r.variavel);
  const totalFixo = fixos.reduce((s,r)=>s+r.valor,0);
  const totalVar  = variaveis.reduce(
    (s,r)=>s+(r.ultimoValor||r.valor),0);

  const mes = getMesAtual();
  const totalPago = fixos
    .filter(r => _isPago(r, mes))
    .reduce((s,r) => s + parseFloat(r.valor||0), 0);
  const nPago   = fixos.filter(r => _isPago(r, mes)).length;
  const aPagar  = totalFixo - totalPago;
  const nAPagar = fixos.length - nPago;

  const resumoEl = document.getElementById('rec-resumo');
  if (resumoEl) {
    resumoEl.innerHTML = `
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        <div>
          <div class="card-label">COMPROMISSO FIXO</div>
          <div class="mono" style="font-size:22px;color:var(--red)">
            ${fmtBRL(totalFixo)}/mês</div>
          <div style="font-size:11px;color:var(--text3)">
            ${fixos.length} itens fixos</div>
        </div>
        <div>
          <div class="card-label">ESTIMATIVA VARIÁVEL</div>
          <div class="mono" style="font-size:22px;color:var(--orange)">
            ${fmtBRL(totalVar)}/mês</div>
          <div style="font-size:11px;color:var(--text3)">
            ${variaveis.length} itens variáveis</div>
        </div>
        <div>
          <div class="card-label">✅ PAGO</div>
          <div class="mono" style="font-size:22px;color:var(--green)">
            ${fmtBRL(totalPago)}/mês</div>
          <div style="font-size:11px;color:var(--text3)">
            ${nPago} itens pagos</div>
        </div>
        <div>
          <div class="card-label">⏳ A PAGAR</div>
          <div class="mono" style="font-size:22px;color:${aPagar > 0 ? 'var(--yellow)' : 'var(--green)'}">
            ${fmtBRL(aPagar)}/mês</div>
          <div style="font-size:11px;color:var(--text3)">
            ${nAPagar} itens pendentes</div>
        </div>
      </div>`;
  }

  renderTabRecorrentes('fixos', fixos);
  renderTabRecorrentes('variaveis', variaveis);
}

function renderTabRecorrentes(tab, lista) {
  const el = document.getElementById(`rec-${tab}`);
  if (!el) return;
  if (!lista.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">
        ${tab==='fixos'?'📅':'📊'}</div>
      <div class="empty-state-text">
        Nenhum recorrente ${tab==='fixos'?'fixo':'variável'}
        cadastrado</div>
      <button class="btn btn-primary btn-sm"
        style="margin-top:12px"
        onclick="abrirModalRecorrente()">
        + Cadastrar agora</button>
    </div>`;
    return;
  }
  let itens = [...lista];
  if (_recSortDesc) {
    itens.sort((a, b) => parseFloat(b.valor||0) - parseFloat(a.valor||0));
  }
  const mes = getMesAtual();
  const sortBtn = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button id="btn-sort-rec"
        onclick="toggleSortRec()"
        style="background:rgba(255,255,255,0.06);border:1px solid var(--border);
        color:var(--text);border-radius:8px;padding:6px 12px;font-size:12px;
        cursor:pointer;display:flex;align-items:center;gap:6px">
        <span id="sort-rec-icon">${_recSortDesc ? '↓' : '↕'}</span>
        <span id="sort-rec-label">${_recSortDesc ? 'Maior → menor' : 'Ordenar por valor'}</span>
      </button>
    </div>`;
  el.innerHTML = sortBtn + `<div class="card" style="padding:0;overflow:hidden">` +
    itens.map(r => {
      const pago = _isPago(r, mes);
      const btnPago = `
        <button
          onclick="togglePagamentoRec('${r.id}', '${mes}')"
          title="${pago ? 'Clique para desmarcar' : 'Marcar como pago'}"
          style="
            width:34px;height:34px;border-radius:8px;border:none;
            cursor:pointer;font-size:16px;
            background:${pago ? 'rgba(48,209,88,0.18)' : 'rgba(255,255,255,0.06)'};
            color:${pago ? 'var(--green)' : 'var(--text3)'};
            transition:all 0.15s;flex-shrink:0
          ">
          ${pago ? '✅' : '○'}
        </button>`;
      return `
      <div style="display:flex;align-items:center;gap:12px;
        padding:14px 16px;border-bottom:1px solid var(--border)">
        <span style="width:10px;height:10px;border-radius:50%;
          background:${CORES[r.categoria]||'#8E8E93'};
          flex-shrink:0"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:500">
            ${r.descricao}</div>
          <div style="font-size:11px;color:var(--text3)">
            ${r.categoria}
            ${r.subcategoria?' · '+r.subcategoria:''}
            · Vence dia ${r.diaVencimento}
            · ${r.conta}
            ${r.variavel?
              ' · <span style="color:var(--orange)">variável</span>':''}
          </div>
        </div>
        <div style="text-align:right;margin-right:8px">
          <div class="mono" style="font-size:15px;color:var(--red)">
            ${fmtBRL(r.variavel?r.ultimoValor||r.valor:r.valor)}</div>
          ${r.variavel?
            `<div style="font-size:10px;color:var(--text3)">
              estimado</div>`:''}
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn btn-secondary btn-sm"
            onclick="editarRecorrente('${r.id}')">Editar</button>
          ${btnPago}
        </div>
      </div>`;
    }).join('') + `</div>`;
}

function switchTabRec(tab) {
  ['fixos','variaveis','sugestoes'].forEach(t => {
    document.getElementById(`rec-${t}`)
      ?.classList.toggle('hidden', t!==tab);
    document.getElementById(`tab-${t}`)
      ?.classList.toggle('active', t===tab);
  });
  if (tab==='sugestoes') renderSugestoesRecorrentes();
}

function renderSugestoesRecorrentes() {
  const sugestoes = detectarRecorrentes().filter(s=>!s.jaRegistrado);
  const el = document.getElementById('rec-sugestoes');
  if (!el) return;
  if (!sugestoes.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">✅</div>
      <div class="empty-state-text">
        Todos os recorrentes detectados já estão cadastrados
      </div></div>`;
    return;
  }
  el.innerHTML =
    `<div style="font-size:13px;color:var(--text2);margin-bottom:12px">
      ${sugestoes.length} gastos detectados como recorrentes
      nos últimos 3 meses.</div>` +
    `<div class="card" style="padding:0;overflow:hidden">` +
    sugestoes.map(s=>`
      <div style="display:flex;align-items:center;gap:12px;
        padding:12px 16px;border-bottom:1px solid var(--border)">
        <span style="width:10px;height:10px;border-radius:50%;
          background:${CORES[s.categoria]||'#8E8E93'};
          flex-shrink:0"></span>
        <div style="flex:1">
          <div style="font-size:13px">${s.descricao}</div>
          <div style="font-size:11px;color:var(--text3)">
            ${s.categoria} · ${s.ocorrencias}x em 3 meses
            · ${s.variavel?'valor variável':'valor fixo'}</div>
        </div>
        <span class="mono" style="font-size:13px;color:var(--orange)">
          ~${fmtBRL(s.valor)}</span>
        <button class="btn btn-primary btn-sm"
          onclick='cadastrarSugestao(${JSON.stringify(s)
            .replace(/'/g,"&#39;")})'>
          Cadastrar</button>
      </div>`).join('') + `</div>`;
}

/* ============================================================
   MÊS SELECTOR
   ============================================================ */
function initMesSelect() {
  const sel = document.getElementById('mes-select');
  if (!sel) return;
  const meses = S._mesesDisponiveis.length > 0
    ? S._mesesDisponiveis
    : mesesToDisplay();
  sel.innerHTML = meses.map(m => `
    <option value="${m}" ${m===S.mesAtual?'selected':''}>
      ${mesAnoLabel(m)}${S._mesesCarregados.has(m) ? '' : ' ⏳'}
    </option>`).join('');
}

async function onMesChange(mesAno) {
  S._secaoCache  = {};
  S._lastRenderedMes = null;
  S.mesAtual     = mesAno;
  S.paginaLancamentos = 1;

  if (!S._index || !S._index[mesAno]) {
    showLoading(true, `Carregando ${mesAnoLabel(mesAno)}...`);
    await loadMesHistorico(mesAno);
    showLoading(false);
  }

  const secAtiva = document.querySelector('.section.active');
  const secId = secAtiva?.id?.replace('sec-','') || 'home';
  renderSection(secId);
  updateHeaderBalance();
}

/* ============================================================
   HEADER
   ============================================================ */
function initHeader() {
  const hora = new Date().getHours();
  let saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('header-greeting').textContent = `${saudacao}, Rafael`;
  updateHeaderBalance();
}

function updateHeaderBalance() {
  const { saldo } = resumoMes(S.mesAtual);
  const el = document.getElementById('header-balance');
  el.textContent = fmtBRL(saldo);
  el.style.color = saldo >= 0 ? 'var(--green)' : 'var(--red)';
}

/* ============================================================
   DEBOUNCE
   ============================================================ */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const renderLancamentosDebounced = debounce(renderLancamentos, 250);
