// ============================================================
// DATA.JS — Parsing, cálculos e utilitários de dados
// Depende de: config.js
// ============================================================
'use strict';

function parseValorBR(str) {
  if (typeof str === 'number') return Math.abs(str);
  if (!str) return 0;
  const s = String(str).trim();
  const clean = s.replace(/\./g, '').replace(',', '.');
  return Math.abs(parseFloat(clean) || 0);
}

function reconstructDate(colA, mesAno) {
  try {
    if (!colA || !mesAno) return new Date();
    const partsA = String(colA).split('/');
    if (partsA.length < 2) return new Date();
    const day = partsA[0].padStart(2,'0');
    const partsMes = String(mesAno).split('-');
    if (partsMes.length < 2) return new Date();
    const year = partsMes[0];
    const month = partsMes[1].padStart(2,'0');
    const d = new Date(`${year}-${month}-${day}T00:00:00`);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch { return new Date(); }
}

function parseDataFlexivel(colData, mesAno) {
  if (!colData) return new Date();
  if (typeof colData === 'number') {
    // Serial do Excel: dias desde 1900-01-01
    const d = new Date((colData - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  const s = String(colData).trim();
  if (s.includes('/')) {
    const p = s.split('/');
    if (p.length === 3) {
      const d = new Date(`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}T00:00:00`);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    if (p.length === 2) {
      const ma = String(mesAno || getMesAtual()).split('-');
      const d = new Date(`${ma[0]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}T00:00:00`);
      return isNaN(d.getTime()) ? new Date() : d;
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

function mapCartao(num) { return 'itau-cartao'; }

function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);
}

function fmtData(d) {
  if (!d) return '';
  if (typeof d === 'string') d = new Date(d);
  if (isNaN(d?.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

function mesAnoLabel(mesAno) {
  if (!mesAno) return '';
  const [y, m] = mesAno.split('-');
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${nomes[parseInt(m)-1] || m} ${y}`;
}

function categorizar(desc) {
  const u = String(desc||'').toUpperCase();
  for (const r of REGRAS) {
    if (r.kw.some(k => u.includes(k))) return { cat: r.cat, sub: r.sub };
  }
  return { cat: 'Outros', sub: 'Não categorizado' };
}

function parseDados(raw) {
  if (!raw || raw.length < 2) return [];
  const txs = [];
  let idCount = 1;

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];

    // Pular linhas completamente vazias
    if (!r || r.every(c => c === null || c === '' || c === undefined)) continue;

    let id, data, descricao, valor, tipo, cat, sub, conta, origem, obs, mesAno;

    // Detectar formato:
    // FORMATO GPS (GastosCartao antigo, 16 colunas):
    //   col0=Date col1=Time col2=Descricao col3=Valor col4=Cartao
    //   col5=Latitude col6=Longitude col7=Obs col8=Tipo col9=Cat
    //   col10=Sub col11=Conta col12=Origem col13=MesAno col14=ID_NF col15=ID
    // Detectar: col5 é número com valor absoluto > 20 (coordenada GPS)
    //
    // FORMATO LANÇAMENTOS (correto, 11 colunas):
    //   col0=ID col1=Data col2=Descrição col3=Valor col4=Tipo
    //   col5=Categoria col6=Subcategoria col7=Conta col8=Origem
    //   col9=Observação col10=Mês/Ano

    const col5 = r[5];
    const isGPS = typeof col5 === 'number' && Math.abs(col5) > 20;

    if (isGPS) {
      // ---- FORMATO GPS (GastosCartao) ----
      mesAno    = r[13] ? String(r[13]) : getMesAtual();
      descricao = String(r[2] || '');
      valor     = parseValorBR(r[3]);
      obs       = String(r[7] || '');
      tipo      = r[8] ? String(r[8]) : 'despesa';
      id        = r[15] || (idCount++);

      // Categoria: usar col9 se existir e não for número GPS
      const catRaw = r[9];
      const subRaw = r[10];
      if (catRaw && typeof catRaw === 'string') {
        cat = catRaw;
        sub = String(subRaw || '');
      } else {
        const c = categorizar(descricao);
        cat = c.cat; sub = c.sub;
      }

      conta  = r[11] ? String(r[11]) : 'itau-cartao';
      origem = r[12] ? String(r[12]) : 'cartao-automatico';

      // Reconstruir data a partir de col0 ("22/05") + mesAno
      const partsD = String(r[0] || '').split('/');
      if (partsD.length === 3) {
        data = new Date(`${partsD[2]}-${partsD[1].padStart(2,'0')}-${partsD[0].padStart(2,'0')}T00:00:00`);
      } else if (partsD.length === 2) {
        const [anoMA, mesMA] = mesAno.split('-');
        data = new Date(`${anoMA}-${partsD[1].padStart(2,'0')}-${partsD[0].padStart(2,'0')}T00:00:00`);
      } else {
        data = new Date();
      }
      if (!data || isNaN(data.getTime())) data = new Date();

    } else {
      // ---- FORMATO LANÇAMENTOS (correto) ----
      id        = r[0] || (idCount++);
      descricao = String(r[2] || '');
      mesAno    = r[10] ? String(r[10]) : getMesAtual();
      obs       = String(r[9] || '');
      tipo      = r[4] ? String(r[4]) : 'despesa';

      // Categoria
      if (r[5] && typeof r[5] === 'string') {
        cat = String(r[5]);
        sub = String(r[6] || '');
      } else {
        const c = categorizar(descricao);
        cat = c.cat; sub = c.sub;
      }

      conta  = r[7] ? String(r[7]) : 'itau-cartao';
      origem = r[8] ? String(r[8]) : 'manual';

      // Valor: respeitar sinal para determinar tipo
      const valorRaw = r[3];
      if (typeof valorRaw === 'number') {
        valor = Math.abs(valorRaw);
        if (valorRaw < 0) tipo = 'despesa';
        else if (String(r[4]).toLowerCase().includes('receita')) tipo = 'receita';
      } else {
        valor = parseValorBR(valorRaw);
      }

      data = parseDataFlexivel(r[1], mesAno);
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
      categorizadoNoExcel: !!(cat && cat !== 'Outros')
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

function parsePatrimonio(raw) {
  if (!raw || raw.length < 2) return [];
  const itens = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0]) continue;
    itens.push({
      data:      r[0] ? new Date(r[0]) : new Date(),
      tipo:      String(r[1] || 'Investimento'),
      descricao: String(r[2] || ''),
      valor:     parseFloat(r[3]) || 0,
      fonte:     String(r[4] || ''),
      ano:       parseInt(r[5]) || new Date().getFullYear()
    });
  }
  return itens;
}

function parseRecorrentes(raw) {
  if (!raw || raw.length < 2) return [];
  const lista = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[1]) continue;
    lista.push({
      id:              r[0] || i,
      descricao:       String(r[1] || ''),
      categoria:       String(r[2] || 'Outros'),
      subcategoria:    String(r[3] || ''),
      conta:           String(r[4] || 'itau-corrente'),
      tipo:            String(r[5] || 'despesa'),
      valor:           parseFloat(r[6]) || 0,
      diaVencimento:   parseInt(r[7]) || 1,
      variavel:        String(r[8] || 'nao').toLowerCase() === 'sim',
      ativo:           String(r[9] || 'sim').toLowerCase() !== 'nao',
      observacao:      String(r[10] || ''),
      ultimoValor:     parseFloat(r[11]) || 0,
      ultimoPagamento: r[12] ? String(r[12]) : ''
    });
  }
  return lista;
}

function detectarRecorrentes() {
  const mesesRecentes = mesesToDisplay().slice(0, 3);
  const contagem = {};

  mesesRecentes.forEach(mes => {
    txsMes(mes).filter(t => t.tipo === 'despesa').forEach(t => {
      const chave = t.descricao.toUpperCase().trim().substring(0, 30);
      if (!contagem[chave]) {
        contagem[chave] = {
          descricao: t.descricao,
          categoria: t.categoria,
          subcategoria: t.subcategoria,
          conta: t.conta,
          ocorrencias: [],
          valores: []
        };
      }
      contagem[chave].ocorrencias.push(mes);
      contagem[chave].valores.push(t.valor);
    });
  });

  return Object.values(contagem)
    .filter(c => c.ocorrencias.length >= 2)
    .map(c => {
      const valorMedio = c.valores.reduce((s,v)=>s+v,0) / c.valores.length;
      const variavel   = Math.max(...c.valores) - Math.min(...c.valores) > 5;
      return {
        descricao:    c.descricao,
        categoria:    c.categoria,
        subcategoria: c.subcategoria,
        conta:        c.conta,
        valor:        parseFloat(valorMedio.toFixed(2)),
        variavel,
        ocorrencias:  c.ocorrencias.length,
        jaRegistrado: S.recorrentes.some(r =>
          r.descricao.toUpperCase().includes(c.descricao.toUpperCase().substring(0,15))
        )
      };
    })
    .sort((a,b) => b.valor - a.valor);
}

function buildIndex() {
  S._index = {};
  S.transactions.forEach(t => {
    if (!t.mesAno) return;
    if (!S._index[t.mesAno]) S._index[t.mesAno] = [];
    S._index[t.mesAno].push(t);
  });
  Object.keys(S._index).forEach(mes => {
    S._index[mes].sort((a,b) => {
      const da = a.data instanceof Date ? a.data : new Date(a.data||0);
      const db = b.data instanceof Date ? b.data : new Date(b.data||0);
      return db - da;
    });
  });
}

function txsMes(mesAno) {
  if (S._index && S._index[mesAno]) return S._index[mesAno];
  return S.transactions.filter(t => t.mesAno === mesAno);
}

function resumoMes(mesAno) {
  const cacheKey = `resumo_${mesAno}_${S.transactions.length}`;
  if (S._cache[cacheKey]) return S._cache[cacheKey];
  const txs = txsMes(mesAno);
  const receitas   = txs.filter(t=>t.tipo==='receita').reduce((s,t)=>s+t.valor,0);
  const despesas   = txs.filter(t=>t.tipo==='despesa').reduce((s,t)=>s+t.valor,0);
  const saldo      = receitas - despesas;
  const renda      = parseFloat(S.config?.renda_mensal_estimada)||(receitas||1);
  const maiorGasto = txs.filter(t=>t.tipo==='despesa')
    .sort((a,b)=>b.valor-a.valor)[0];
  const result = { receitas, despesas, saldo, renda,
    comprometimento:(despesas/renda)*100, maiorGasto };
  S._cache[cacheKey] = result;
  return result;
}

function gastosPorCategoria(mesAno) {
  const cacheKey = `cats_${mesAno}_${S.transactions.length}`;
  if (S._cache[cacheKey]) return S._cache[cacheKey];
  const map = {};
  txsMes(mesAno).filter(t=>t.tipo==='despesa').forEach(t => {
    map[t.categoria] = (map[t.categoria]||0) + t.valor;
  });
  const result = Object.entries(map).sort((a,b)=>b[1]-a[1]);
  S._cache[cacheKey] = result;
  return result;
}

function mesesToDisplay() {
  const set = new Set(S.transactions.map(t=>t.mesAno).filter(Boolean));
  const atual = getMesAtual();
  if (!set.has(atual)) set.add(atual);
  return [...set].sort().reverse();
}
