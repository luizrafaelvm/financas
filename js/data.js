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

    // Detectar formato pela coluna 5:
    // Formato GPS (antigo 16 col): col5 é número de coordenada GPS (valor absoluto > 20)
    // Formato correto (11 col): col5 é string de categoria
    const col5 = r[5];
    const isFormatoGPS = (typeof col5 === 'number' && Math.abs(col5) > 20);

    let id, data, descricao, valor, tipo, cat, sub, conta, origem, obs, mesAno;

    if (isFormatoGPS) {
      // ---- FORMATO ANTIGO GASTOSCARTAO (16 colunas) ----
      // 0:Date 1:Time 2:Descricao 3:Valor 4:Cartao
      // 5:Lat 6:Lng 7:Obs 8:Tipo 9:Cat 10:Sub
      // 11:Conta 12:Origem 13:MesAno 14:ID_NF 15:ID
      const colDate = r[0];
      const colObs  = r[7];
      mesAno    = r[13] ? String(r[13]) : getMesAtual();
      descricao = String(r[2] || '');
      valor     = parseValorBR(r[3]);
      cat       = r[9]  ? String(r[9])  : categorizar(descricao).cat;
      sub       = r[10] ? String(r[10]) : categorizar(descricao).sub;
      conta     = r[11] ? String(r[11]) : 'itau-cartao';
      origem    = r[12] ? String(r[12]) : 'cartao-automatico';
      obs       = String(colObs || '');
      tipo      = r[8]  ? String(r[8])  : 'despesa';
      id        = r[15] || idCount++;

      // Reconstruir data: colDate pode ser "22/05" ou "22/05/2025"
      const partsD = String(colDate || '').split('/');
      if (partsD.length === 3) {
        data = new Date(`${partsD[2]}-${partsD[1].padStart(2,'0')}-${partsD[0].padStart(2,'0')}T00:00:00`);
      } else if (partsD.length === 2) {
        const [anoMA, mesMA] = mesAno.split('-');
        data = new Date(`${anoMA}-${partsD[1].padStart(2,'0')}-${partsD[0].padStart(2,'0')}T00:00:00`);
      } else {
        data = new Date();
      }
      if (isNaN(data.getTime())) data = new Date();

    } else {
      // ---- FORMATO CORRETO LANÇAMENTOS (11 colunas) ----
      // 0:ID 1:Data 2:Descrição 3:Valor 4:Tipo
      // 5:Categoria 6:Subcategoria 7:Conta 8:Origem
      // 9:Observação 10:Mês/Ano
      id        = r[0] || idCount++;
      descricao = String(r[2] || '');
      mesAno    = r[10] ? String(r[10]) : getMesAtual();
      cat       = r[5] ? String(r[5]) : categorizar(descricao).cat;
      sub       = r[6] ? String(r[6]) : categorizar(descricao).sub;
      conta     = r[7] ? String(r[7]) : 'itau-cartao';
      origem    = r[8] ? String(r[8]) : 'manual';
      obs       = String(r[9] || '');
      tipo      = r[4] ? String(r[4]) : 'despesa';

      // Valor: pode ser negativo (despesa) ou positivo (receita)
      const valorRaw = r[3];
      if (typeof valorRaw === 'number') {
        valor = Math.abs(valorRaw);
        if (valorRaw < 0) tipo = 'despesa';
        if (valorRaw > 0 && String(r[4]).includes('receita')) tipo = 'receita';
      } else {
        valor = parseValorBR(valorRaw);
      }

      // Parse de data — vários formatos possíveis
      const colData = r[1];
      if (!colData) {
        data = new Date();
      } else if (typeof colData === 'number') {
        // Serial do Excel
        data = new Date((colData - 25569) * 86400 * 1000);
      } else {
        const s = String(colData);
        if (s.includes('/')) {
          const p = s.split('/');
          if (p.length === 3) {
            data = new Date(`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}T00:00:00`);
          } else {
            const [anoMA, mesMA] = mesAno.split('-');
            data = new Date(`${anoMA}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}T00:00:00`);
          }
        } else {
          data = new Date(s);
        }
      }
      if (!data || isNaN(data.getTime())) data = new Date();
    }

    idCount++;
    txs.push({
      id, rowIndex: i + 1,
      data, hora: '',
      descricao,
      valor: Math.abs(valor),
      valorSigned: tipo === 'receita' ? Math.abs(valor) : -Math.abs(valor),
      tipo, categoria: cat, subcategoria: sub,
      conta, origem, observacao: obs,
      mesAno, idNF: '',
      categorizadoNoExcel: !!cat && cat !== 'Outros'
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
