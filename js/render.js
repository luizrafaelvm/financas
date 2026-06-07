// ============================================================
// RENDER.JS — Renderização de todas as seções do dashboard
// Depende de: config.js, data.js
// ============================================================
'use strict';

/* ============================================================
   NAVEGAÇÃO
   ============================================================ */
function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .bnav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`sec-${id}`)?.classList.add('active');
  if (btn) btn.classList.add('active');
  // Sync sidebar & bottom nav
  document.querySelectorAll(`[data-section="${id}"]`).forEach(b=>b.classList.add('active'));
  renderSection(id);
}

function renderSection(id) {
  switch(id) {
    case 'home':         renderHome();         break;
    case 'lancamentos':  renderLancamentos();   break;
    case 'analise':      renderAnalise();       break;
    case 'diagnostico':  renderDiagnostico();   break;
    case 'metas':        renderMetas();         break;
    case 'assistente':   /* chat keeps state */ break;
    case 'importar':     /* drop zone static */ break;
  }
}

function renderAll() {
  initMesSelect();
  renderHome();
  initCatFilter();
}

/* ============================================================
   HOME
   ============================================================ */
function renderHome() {
  const mes = S.mesAtual;
  const { receitas, despesas, saldo, renda, comprometimento, maiorGasto } = resumoMes(mes);

  // Saldo central
  const saldoEl = document.getElementById('saldo-value');
  saldoEl.textContent = fmtBRL(saldo);
  saldoEl.style.color = saldo >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('saldo-sub').textContent = `${mesAnoLabel(mes)} · ${comprometimento.toFixed(0)}% da renda comprometido`;

  // Summary grid
  const grid = document.getElementById('summary-grid');
  grid.innerHTML = `
    ${summaryCard('RECEITAS','var(--green)',fmtBRL(receitas),'do mês')}
    ${summaryCard('DESPESAS','var(--red)',fmtBRL(despesas),'do mês')}
    ${summaryCard('MAIOR GASTO','var(--yellow)',maiorGasto ? fmtBRL(maiorGasto.valor) : '—', maiorGasto ? maiorGasto.descricao.substring(0,20) : 'nenhum')}
    ${summaryCard('RENDA COMPROMETIDA','var(--orange)',comprometimento.toFixed(1)+'%',`de ${fmtBRL(renda)}`)}
  `;

  // Cartões de crédito
  const secaoCartoes = document.getElementById('wallet-cards');
  const txsCartaoItau = txsMes(mes).filter(t =>
    t.conta === 'itau-cartao' || t.conta === 'itau-2812' || t.conta === 'itau-4141'
  );
  const txsCartaoDiners = txsMes(mes).filter(t =>
    t.conta && (t.conta.toLowerCase().includes('diners') ||
                t.conta.toLowerCase().includes('caixa'))
  );
  const totalItau   = txsCartaoItau.filter(t=>t.tipo==='despesa').reduce((s,t)=>s+t.valor,0);
  const totalDiners = txsCartaoDiners.filter(t=>t.tipo==='despesa').reduce((s,t)=>s+t.valor,0);

  secaoCartoes.innerHTML = `
    <div class="wallet-card" style="background:linear-gradient(135deg,#E67E22,#D35400)">
      <div class="wallet-card-bank">Itaú · Cartão de Crédito</div>
      <div class="wallet-card-num">•••• 2812 / 4141</div>
      <div class="wallet-card-label">FATURA DO MÊS</div>
      <div class="wallet-card-balance">${fmtBRL(totalItau)}</div>
    </div>
    ${totalDiners > 0 || txsCartaoDiners.length > 0 ? `
    <div class="wallet-card" style="background:linear-gradient(135deg,#1A237E,#283593)">
      <div class="wallet-card-bank">Caixa · Diners Club</div>
      <div class="wallet-card-num">•••• Diners</div>
      <div class="wallet-card-label">FATURA DO MÊS</div>
      <div class="wallet-card-balance">${fmtBRL(totalDiners)}</div>
    </div>` : ''}
  `;

  // Contas bancárias
  const txsItauCC = txsMes(mes).filter(t =>
    t.conta === 'itau-corrente' || (t.conta && t.conta.includes('corrente'))
  );
  const txsBradesco = txsMes(mes).filter(t =>
    t.conta && t.conta.toLowerCase().includes('bradesco')
  );
  const saldoItauCC   = txsItauCC.reduce((s,t)=>s+(t.tipo==='receita'?t.valor:-t.valor),0);
  const saldoBradesco = txsBradesco.reduce((s,t)=>s+(t.tipo==='receita'?t.valor:-t.valor),0);

  const contaCards = document.getElementById('conta-cards');
  if (contaCards) {
    contaCards.innerHTML = `
      <div class="wallet-card" style="background:linear-gradient(135deg,#1565C0,#1976D2)">
        <div class="wallet-card-bank">Itaú · Conta Corrente</div>
        <div class="wallet-card-num">Conta Corrente</div>
        <div class="wallet-card-label">SALDO ESTIMADO</div>
        <div class="wallet-card-balance">${fmtBRL(saldoItauCC)}</div>
      </div>
      ${saldoBradesco !== 0 || txsBradesco.length > 0 ? `
      <div class="wallet-card" style="background:linear-gradient(135deg,#B71C1C,#C62828)">
        <div class="wallet-card-bank">Bradesco · Conta Corrente</div>
        <div class="wallet-card-num">Conta Corrente</div>
        <div class="wallet-card-label">SALDO ESTIMADO</div>
        <div class="wallet-card-balance">${fmtBRL(saldoBradesco)}</div>
      </div>` : ''}
    `;
  }

  // Destroy old charts before recreating
  destroyChart('donut'); destroyChart('area');

  // Donut chart
  const catData = gastosPorCategoria(mes);
  const ctx1 = document.getElementById('chart-donut').getContext('2d');
  S.charts.donut = new Chart(ctx1, {
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
      cutout: '65%',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            color: '#AEAEB2',
            font: { size: 11, family: "'DM Sans'" },
            padding: 12,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyleWidth: 10,
            generateLabels: (chart) => {
              const data = chart.data;
              return data.labels.map((label, i) => ({
                text: `${label}  ${fmtBRL(data.datasets[0].data[i])}`,
                fillStyle: data.datasets[0].backgroundColor[i],
                strokeStyle: 'transparent',
                pointStyle: 'circle',
                index: i
              }));
            }
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${fmtBRL(ctx.raw)}`
          }
        }
      }
    }
  });

  // Evolução do Patrimônio por ano
  destroyChart('area');
  const patrimonioAno = {};
  (S.patrimonio || []).forEach(p => {
    if (!patrimonioAno[p.ano]) patrimonioAno[p.ano] = 0;
    patrimonioAno[p.ano] += p.valor;
  });
  const anosLabels = Object.keys(patrimonioAno).sort();
  const anosValues = anosLabels.map(a => patrimonioAno[a]);

  const ctx2 = document.getElementById('chart-area').getContext('2d');
  const hasPatrimonio = anosLabels.length > 0;

  if (hasPatrimonio) {
    const grad2 = ctx2.createLinearGradient(0,0,0,200);
    grad2.addColorStop(0,'rgba(10,132,255,.3)');
    grad2.addColorStop(1,'rgba(0,0,0,0)');
    S.charts.area = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: anosLabels,
        datasets: [{
          label: 'Patrimônio Total',
          data: anosValues,
          borderColor: 'var(--blue)',
          backgroundColor: grad2,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: 'var(--blue)',
          fill: true, tension: 0.3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label: ctx => `Patrimônio: ${fmtBRL(ctx.raw)}`
          }}
        },
        scales: {
          x: { grid:{color:'rgba(255,255,255,.04)'},
               ticks:{color:'#636366',font:{size:10}} },
          y: { grid:{color:'rgba(255,255,255,.04)'},
               ticks:{color:'#636366',font:{size:10},
               callback: v => 'R$'+v.toLocaleString('pt-BR')}}
        }
      }
    });
  } else {
    ctx2.clearRect(0,0,ctx2.canvas.width,ctx2.canvas.height);
    const areaCard = ctx2.canvas.closest('.chart-card');
    if (areaCard && !areaCard.querySelector('.chart-empty')) {
      areaCard.insertAdjacentHTML('beforeend',
        '<div class="chart-empty" style="text-align:center;padding:24px 16px;color:var(--text3);font-size:13px">' +
        '📊 Importe dados do Imposto de Renda ou<br>extratos de investimentos para ver a evolução do patrimônio.' +
        '</div>');
    }
  }

  // Alertas
  renderAlertas(mes);
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
  if (S.charts[key]) { S.charts[key].destroy(); delete S.charts[key]; }
}

/* ============================================================
   LANÇAMENTOS
   ============================================================ */
function renderLancamentos() {
  const search  = (document.getElementById('search-input')?.value||'').toLowerCase();
  const tipo    = document.getElementById('filter-tipo')?.value||'';
  const cat     = document.getElementById('filter-cat')?.value||'';
  const conta   = document.getElementById('filter-conta')?.value||'';

  let txs = txsMes(S.mesAtual);
  if (search)  txs = txs.filter(t=>t.descricao.toLowerCase().includes(search));
  if (tipo)    txs = txs.filter(t=>t.tipo===tipo);
  if (cat)     txs = txs.filter(t=>t.categoria===cat);
  if (conta)   txs = txs.filter(t=>t.conta===conta);
  txs = txs.sort((a,b)=>b.data-a.data);

  const body = document.getElementById('lancamentos-body');
  if (!txs.length) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text3)">Nenhum lançamento encontrado</td></tr>`;
    document.getElementById('lancamentos-count').textContent = '';
    return;
  }

  body.innerHTML = txs.map(t => {
    const cor   = t.tipo==='receita' ? 'var(--green)' : 'var(--red)';
    const sinal = t.tipo==='receita' ? '+' : '-';
    const origMap = {
      'cartao-automatico': '🤖 Auto',
      'manual':            '✍️ Manual',
      'csv-import':        '📄 CSV',
      'ofx-import':        '📄 OFX',
      'sms-automatico':    '📱 SMS'
    };
    const origLabel = origMap[t.origem] || '• ' + (t.origem || 'desconhecido');
    const dot   = `<span class="cat-dot" style="background:${CORES[t.categoria]||'#8E8E93'}"></span>`;
    return `<tr>
      <td style="color:var(--text2);font-size:12px;white-space:nowrap">${fmtData(t.data)}</td>
      <td>
        <div style="font-size:13px">${t.descricao}</div>
        ${t.subcategoria && !t.subcategoria.includes('-') && t.subcategoria !== 'Não categorizado'
          ? `<div style="font-size:11px;color:var(--text3)">${t.subcategoria}</div>`
          : ''}
      </td>
      <td><div style="display:flex;align-items:center;gap:6px">${dot}<span style="font-size:12px">${t.categoria}</span></div></td>
      <td><span class="badge badge-gray" style="font-size:10px">${t.conta}</span></td>
      <td style="font-size:12px;color:var(--text2)">${origLabel}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace;color:${cor};font-size:14px;white-space:nowrap">
        ${sinal}${fmtBRL(t.valor)}
      </td>
    </tr>`;
  }).join('');
  document.getElementById('lancamentos-count').textContent = `${txs.length} lançamento${txs.length!==1?'s':''} · ${fmtBRL(txs.reduce((s,t)=>s+t.valorSigned,0))} no período`;
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
   DIAGNÓSTICO
   ============================================================ */
function renderDiagnostico() {
  const mes = S.mesAtual;
  const { receitas, despesas, saldo, renda, comprometimento } = resumoMes(mes);
  const txs = txsMes(mes);

  // Score 0-100
  let score = 100;
  if (comprometimento > 80) score -= 40;
  else if (comprometimento > 60) score -= 20;
  if (saldo < 0) score -= 30;
  const txsSuperf = txs.filter(t=>SUPERFLUOUS.includes(t.categoria)&&t.tipo==='despesa');
  const totalSuperf = txsSuperf.reduce((s,t)=>s+t.valor,0);
  if (totalSuperf/renda > 0.2) score -= 15;
  score = Math.max(0, Math.min(100, score));

  let emoji, cls, titulo, desc;
  if (score >= 70) {
    emoji='🟢'; cls='verde'; titulo='Saúde financeira boa';
    desc=`Você manteve ${comprometimento.toFixed(0)}% da renda comprometida. Continue assim.`;
  } else if (score >= 40) {
    emoji='🟡'; cls='amarelo'; titulo='Atenção nos gastos';
    desc=`${comprometimento.toFixed(0)}% da renda comprometida. Há oportunidades de melhoria.`;
  } else {
    emoji='🔴'; cls='vermelho'; titulo='Gastos acima do ideal';
    desc=`${comprometimento.toFixed(0)}% da renda comprometida${saldo<0?' — saldo negativo!':''}.`;
  }

  document.getElementById('semaforo').textContent = emoji;
  document.getElementById('semaforo').className = `semaforo ${cls}`;
  document.getElementById('score-titulo').textContent = `${titulo} · Score ${score}/100`;
  document.getElementById('score-desc').textContent = desc;

  // Top 10
  const top10 = txs.filter(t=>t.tipo==='despesa').sort((a,b)=>b.valor-a.valor).slice(0,10);
  document.getElementById('top-gastos').innerHTML = top10.map((t,i) => `
    <li class="top-gasto-item">
      <div class="top-gasto-rank">${i+1}</div>
      <div>
        <div class="top-gasto-desc">${t.descricao}</div>
        <div class="top-gasto-cat">${fmtData(t.data)} · ${t.categoria}</div>
      </div>
      <div class="top-gasto-val">${fmtBRL(t.valor)}</div>
    </li>`).join('');

  // Supérfluos
  const catsSuperf = {};
  txsSuperf.forEach(t=>{catsSuperf[t.categoria]=(catsSuperf[t.categoria]||0)+t.valor;});
  const superEl = document.getElementById('superfluous-list');
  if (!Object.keys(catsSuperf).length) {
    superEl.innerHTML = `<div style="color:var(--text3);font-size:13px">Nenhum gasto supérfluo identificado este mês. 👏</div>`;
  } else {
    superEl.innerHTML = Object.entries(catsSuperf).map(([c,v])=>`
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:14px">${c}</div>
          <div style="font-size:12px;color:var(--text2)">Reduzir 50% economizaria ${fmtBRL(v*0.5)}/mês</div>
        </div>
        <span class="badge badge-red">${fmtBRL(v)}</span>
      </div>`).join('') +
      `<div style="margin-top:10px;font-size:13px;color:var(--text2)">Total supérfluo: <strong style="color:var(--red)">${fmtBRL(totalSuperf)}</strong> · ${(totalSuperf/renda*100).toFixed(1)}% da renda</div>`;
  }

  // Essenciais
  const txsEss = txs.filter(t=>ESSENCIAIS.includes(t.categoria)&&t.tipo==='despesa');
  const catEss = {};
  txsEss.forEach(t=>{catEss[t.categoria]=(catEss[t.categoria]||0)+t.valor;});
  document.getElementById('essential-list').innerHTML = Object.keys(catEss).length
    ? Object.entries(catEss).map(([c,v])=>`
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:14px">${c} <span style="font-size:11px">🛡️ protegido</span></div>
          </div>
          <span class="badge badge-blue">${fmtBRL(v)}</span>
        </div>`).join('')
    : `<div style="color:var(--text3);font-size:13px">Nenhum gasto essencial registrado este mês.</div>`;
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
}

/* ============================================================
   MÊS SELECTOR
   ============================================================ */
function initMesSelect() {
  const sel = document.getElementById('mes-select');
  if (!sel) return;
  const meses = mesesToDisplay();
  sel.innerHTML = meses.map(m =>
    `<option value="${m}" ${m===S.mesAtual?'selected':''}>${mesAnoLabel(m)}</option>`
  ).join('');
}

function onMesChange(mesAno) {
  S.mesAtual = mesAno;
  const active = document.querySelector('.section.active');
  const secId  = active?.id?.replace('sec-','');
  if (secId) renderSection(secId);
  if (secId !== 'home') renderHome();
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
