// ============================================================
// DATA.JS — Parsing, cálculos e utilitários de dados
// Depende de: config.js
// ============================================================
'use strict';

/* ============================================================
   UTILITÁRIOS DE DADOS
   ============================================================ */
function parseValorBR(str) {
  if (typeof str === 'number') return Math.abs(str);
  if (!str) return 0;
  const s = String(str).trim();
  // "110,80" → 110.80  |  "1.234,56" → 1234.56
  const clean = s.replace(/\./g, '').replace(',', '.');
  return Math.abs(parseFloat(clean) || 0);
}

function reconstructDate(colA, mesAno) {
  try {
    if (!colA || !mesAno) return new Date();
    const partsA = String(colA).split('/');
    if (partsA.length < 2) return new Date();
    const day   = partsA[0].padStart(2,'0');
    const partsMes = String(mesAno).split('-');
    if (partsMes.length < 2) return new Date();
    const year  = partsMes[0];
    const month = partsMes[1].padStart(2,'0');
    if (!day || !year || !month) return new Date();
    const d = new Date(`${year}-${month}-${day}T00:00:00`);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch {
    return new Date();
  }
}

function mapCartao(num) {
  return 'itau-cartao'; // 2812 e 4141 são ambos Itaú cartão
}

function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
}

function fmtData(d) {
  if (!d) return '';
  if (typeof d === 'string') d = new Date(d);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

function mesAnoLabel(mesAno) {
  if (!mesAno) return '';
  const [y, m] = mesAno.split('-');
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${nomes[parseInt(m)-1]} ${y}`;
}

function categorizar(desc) {
  const u = desc.toUpperCase();
  for (const r of REGRAS) {
    if (r.kw.some(k => u.includes(k))) return { cat: r.cat, sub: r.sub };
  }
  return { cat: 'Outros', sub: 'Não categorizado' };
}

/* ============================================================
   PARSING DE DADOS DO EXCEL
   ============================================================ */
function parseDados(raw) {
  if (!raw || raw.length < 2) return [];
  const txs = [];
  let idCount = 1;
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.every(c => c === null || c === '' || c === undefined)) continue;

    const colA = r[0];   // ID
    const colB = r[1];   // Data (formato Date object ou string)
    const colC = r[2];   // Descrição
    const colD = r[3];   // Valor (número com sinal — negativo = despesa)
    const colE = r[4];   // Tipo (receita/despesa)
    const colF = r[5];   // Categoria
    const colG = r[6];   // Subcategoria
    const colH = r[7];   // Conta
    const colI = r[8];   // Origem
    const colJ = r[9];   // Observação
    const colK = r[10];  // Mês/Ano

    // Detectar linha no formato antigo (GPS nas colunas 5 e 6)
    const possivelGPS = (typeof r[5] === 'number' && Math.abs(r[5]) > 20) ||
                        (typeof r[6] === 'number' && Math.abs(r[6]) > 20);
    if (possivelGPS) {
      console.warn('Linha ignorada — formato antigo com GPS:', r[2]);
      continue;
    }

    const id       = colA || idCount++;
    const valor    = parseValorBR(colD);
    const tipo     = colE || (valor < 0 ? 'despesa' : 'receita');
    const cat      = colF ? String(colF) : categorizar(String(colC||'')).cat;
    const sub      = colG ? String(colG) : categorizar(String(colC||'')).sub;
    const conta    = colH ? String(colH) : 'itau-cartao';
    const origem   = colI ? String(colI) : 'manual';
    const obs      = colJ ? String(colJ) : '';
    const mesAno   = colK ? String(colK) : getMesAtual();
    let data;
    const colData = r[1];
    if (!colData) {
      data = new Date();
    } else if (typeof colData === 'number') {
      // Número serial do Excel → Date
      data = new Date((colData - 25569) * 86400 * 1000);
    } else {
      const s = String(colData);
      if (s.includes('/')) {
        const p = s.split('/');
        if (p.length === 3) {
          data = new Date(`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}T00:00:00`);
        } else if (p.length === 2) {
          const ma = String(r[10] || getMesAtual()).split('-');
          data = new Date(`${ma[0]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}T00:00:00`);
        }
      } else {
        data = new Date(s);
      }
      if (isNaN(data?.getTime())) data = new Date();
    }

    txs.push({
      id, rowIndex: i + 1,
      data, descricao: String(colC || ''),
      valor: Math.abs(valor),
      valorSigned: tipo === 'receita' ? Math.abs(valor) : -Math.abs(valor),
      tipo, categoria: cat, subcategoria: sub,
      conta, origem, observacao: obs,
      mesAno, idNF: '', hora: '',
      categorizadoNoExcel: !!colF
    });
  }
  return txs;
}

function parseMetas(raw) {
  const m = {};
  if (!raw || raw.length < 2) return m;
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0]) continue;
    m[String(r[0])] = { teto: parseFloat(r[1]) || 0, alerta: parseFloat(r[2]) || 80 };
  }
  return m;
}

function parseCfg(raw) {
  const c = {};
  if (!raw || raw.length < 2) return c;
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0]) continue;
    c[String(r[0])] = r[1];
  }
  return c;
}

/* ============================================================
   COMPUTED / ANALYTICS
   ============================================================ */
function txsMes(mesAno) {
  return S.transactions.filter(t => t.mesAno === mesAno);
}

function resumoMes(mesAno) {
  const txs = txsMes(mesAno);
  const receitas  = txs.filter(t=>t.tipo==='receita').reduce((s,t)=>s+t.valor,0);
  const despesas  = txs.filter(t=>t.tipo==='despesa').reduce((s,t)=>s+t.valor,0);
  const saldo     = receitas - despesas;
  const renda     = parseFloat(S.config.renda_mensal_estimada) || (receitas || 1);
  const maiorGasto= txs.filter(t=>t.tipo==='despesa').sort((a,b)=>b.valor-a.valor)[0];
  return { receitas, despesas, saldo, renda, comprometimento:(despesas/renda)*100, maiorGasto };
}

function gastosPorCategoria(mesAno) {
  const map = {};
  txsMes(mesAno).filter(t=>t.tipo==='despesa').forEach(t => {
    map[t.categoria] = (map[t.categoria]||0) + t.valor;
  });
  return Object.entries(map).sort((a,b)=>b[1]-a[1]);
}

function mesesToDisplay() {
  const set = new Set(S.transactions.map(t=>t.mesAno).filter(Boolean));
  if (!set.has(S.mesAtual)) set.add(S.mesAtual);
  return [...set].sort().reverse();
}
