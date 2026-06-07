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
    const parts = String(colA).split('/');
    const day   = parts[0]?.padStart(2,'0');
    const [year, month] = String(mesAno).split('-');
    if (!day || !year || !month) return new Date();
    return new Date(`${year}-${month}-${day}T00:00:00`);
  } catch { return new Date(); }
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

    const colA = r[0],  colB = r[1],  colC = r[2],  colD = r[3];
    const colE = r[4],  colH = r[7];
    const colI = r[8],  colJ = r[9],  colK = r[10], colL = r[11];
    const colM = r[12], colN = r[13], colO = r[14], colP = r[15];

    const valor = parseValorBR(colD);
    const { cat, sub } = colJ
      ? { cat: String(colJ), sub: String(colK || '') }
      : categorizar(String(colC || ''));
    const tipo  = colI || (cat === 'Receitas' ? 'receita' : 'despesa');
    const conta = colL || mapCartao(colE);
    const mesAno = colN ? String(colN) : S.mesAtual;
    const data   = reconstructDate(colA, mesAno);
    const id     = colP || idCount++;

    txs.push({
      id, rowIndex: i + 1,
      data, hora: colB || '',
      descricao: String(colC || ''),
      valor, valorSigned: tipo === 'despesa' ? -valor : valor,
      tipo, categoria: cat, subcategoria: sub,
      conta, origem: String(colM || 'cartao-automatico'),
      observacao: String(colH || ''),
      mesAno, idNF: String(colO || ''),
      categorizadoNoExcel: !!colJ
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
