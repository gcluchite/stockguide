const SEGMENT_COLORS = {
  'Recebível': { fill: 'rgba(96, 165, 250, 0.72)', stroke: '#60a5fa' },
  'Galpão Logístico': { fill: 'rgba(167, 139, 250, 0.72)', stroke: '#a78bfa' },
  'Laje Corporativa': { fill: 'rgba(251, 191, 36, 0.72)', stroke: '#fbbf24' },
  'Shopping Center': { fill: 'rgba(52, 211, 153, 0.72)', stroke: '#34d399' },
  'Fundo de Fundos': { fill: 'rgba(248, 113, 113, 0.72)', stroke: '#f87171' },
  'FIAgro - FII': { fill: 'rgba(163, 230, 53, 0.72)', stroke: '#a3e635' },
  'FI-Infra': { fill: 'rgba(34, 211, 238, 0.72)', stroke: '#22d3ee' },
  'Hedge Fund': { fill: 'rgba(251, 146, 60, 0.72)', stroke: '#fb923c' },
  'Híbrido': { fill: 'rgba(244, 114, 182, 0.72)', stroke: '#f472b6' },
  'Renda Urbana': { fill: 'rgba(45, 212, 191, 0.72)', stroke: '#2dd4bf' },
  'Residencial': { fill: 'rgba(192, 132, 252, 0.72)', stroke: '#c084fc' },
  'Agência Bancária': { fill: 'rgba(148, 163, 184, 0.72)', stroke: '#94a3b8' },
  'Desenvolvimento': { fill: 'rgba(217, 119, 6, 0.72)', stroke: '#d97706' },
  'Educacional': { fill: 'rgba(16, 185, 129, 0.72)', stroke: '#10b981' },
  'Hospital': { fill: 'rgba(220, 38, 38, 0.72)', stroke: '#dc2626' },
  'Hotel': { fill: 'rgba(124, 58, 237, 0.72)', stroke: '#7c3aed' },
  'Outros': { fill: 'rgba(107, 114, 128, 0.72)', stroke: '#6b7280' },
  'Agronegócio': { fill: 'rgba(132, 204, 22, 0.72)', stroke: '#84cc16' },
  'FIAgro - FIDC': { fill: 'rgba(180, 218, 40, 0.72)', stroke: '#b4da28' }
};

function getSegmentColor(segmento) {
  return SEGMENT_COLORS[segmento] || { fill: 'rgba(150,150,150,0.72)', stroke: '#999' };
}

function fmtPct(v, decimals = 1) {
  if (v === null || v === undefined) return '—';
  return v.toFixed(decimals) + '%';
}

function fmtPctSigned(v, decimals = 1) {
  if (v === null || v === undefined) return '—';
  const sign = v >= 0 ? '+' : '';
  return sign + v.toFixed(decimals) + '%';
}

function fmtBRL(v) {
  if (v === null || v === undefined) return '—';
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMM(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 1000) return 'R$ ' + (v / 1000).toFixed(2).replace('.', ',') + ' bi';
  return 'R$ ' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' MM';
}

function fmtPVP(v) {
  if (v === null || v === undefined) return '—';
  return v.toFixed(2) + 'x';
}

const MIN_R = 6;
const MAX_R = 38;
let _sqrtMin = 0;
let _sqrtRange = 1;

function initRadiusScale(fiis) {
  const vps = fiis.map(f => f.valorPatrimonial).filter(v => v != null);
  if (!vps.length) return;
  _sqrtMin = Math.sqrt(Math.min(...vps));
  const sqrtMax = Math.sqrt(Math.max(...vps));
  _sqrtRange = sqrtMax - _sqrtMin || 1;
}

function calcRadius(vp) {
  if (vp === null || vp === undefined) return MIN_R;
  const norm = (Math.sqrt(vp) - _sqrtMin) / _sqrtRange;
  return MIN_R + norm * (MAX_R - MIN_R);
}

function getYieldPonta(fii) {
  if (fii?.dyPonta != null) return fii.dyPonta;
  if (fii?.divMes == null || fii?.cotacao == null || fii.cotacao === 0) return null;
  return (fii.divMes * 12 / fii.cotacao) * 100;
}

const TAMANHO_BOUNDS = {
  todos: [0, Infinity],
  pequeno: [0, 500],
  medio: [500, 2000],
  grande: [2000, Infinity]
};

function matchesIfixFilter(fii, ifixes) {
  if (!Array.isArray(ifixes) || !ifixes.length) return true;
  const inIfix = fii.partIfix != null && fii.partIfix > 0;
  return ifixes.some(ifix => {
    if (ifix === 'ifix') return inIfix;
    if (ifix === 'fora') return !inIfix;
    return false;
  });
}

function matchesTamanhoFilter(fii, tamanhos) {
  if (!Array.isArray(tamanhos) || !tamanhos.length) return true;
  const vp = fii.valorPatrimonial ?? 0;
  return tamanhos.some(tamanho => {
    const [lo, hi] = TAMANHO_BOUNDS[tamanho] || [0, Infinity];
    return vp >= lo && vp < hi;
  });
}

function filterFiis(data, segmentos, tamanhos, ifixes) {
  return data.filter(f => {
    if (Array.isArray(segmentos) && segmentos.length && !segmentos.includes(f.segmento)) return false;
    if (!matchesTamanhoFilter(f, tamanhos)) return false;
    if (!matchesIfixFilter(f, ifixes)) return false;
    return true;
  });
}

function filterFiisByGestora(data, gestora) {
  if (!gestora || gestora === 'todas') return data;
  return data.filter(f => (f.gestor || 'Sem gestora') === gestora);
}

function calcStats(fiis) {
  const n = fiis.length;
  if (!n) return { count: 0, dyMed: null, pvpMed: null, plTotal: null, vmTotal: null };

  const dys = fiis.map(getYieldPonta).filter(v => v != null);
  const pvps = fiis.map(f => f.pvp).filter(v => v != null);
  const vps = fiis.map(f => f.valorPatrimonial).filter(v => v != null);
  const vms = fiis.map(f => f.valorMercado).filter(v => v != null);
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    count: n,
    dyMed: dys.length ? mean(dys) : null,
    pvpMed: pvps.length ? mean(pvps) : null,
    plTotal: vps.length ? vps.reduce((a, b) => a + b, 0) : null,
    vmTotal: vms.length ? vms.reduce((a, b) => a + b, 0) : null
  };
}

function calcWeightedAverages(fiis) {
  const valid = fiis.filter(f => {
    const peso = f.valorPatrimonial;
    const yieldPonta = getYieldPonta(f);
    return peso != null && peso > 0 && f.pvp != null && yieldPonta != null;
  });

  if (!valid.length) {
    return { pvp: null, yieldPonta: null };
  }

  const totalPeso = valid.reduce((sum, f) => sum + f.valorPatrimonial, 0);
  if (!totalPeso) {
    return { pvp: null, yieldPonta: null };
  }

  const weightedPvp = valid.reduce((sum, f) => sum + (f.pvp * f.valorPatrimonial), 0) / totalPeso;
  const weightedYield = valid.reduce((sum, f) => sum + (getYieldPonta(f) * f.valorPatrimonial), 0) / totalPeso;

  return {
    pvp: weightedPvp,
    yieldPonta: weightedYield
  };
}

const ALL_SEGMENTS = [
  'Recebível',
  'Galpão Logístico',
  'Laje Corporativa',
  'Shopping Center',
  'Fundo de Fundos',
  'FIAgro - FII',
  'FI-Infra',
  'Hedge Fund',
  'Híbrido',
  'Renda Urbana',
  'Residencial',
  'Agência Bancária',
  'Desenvolvimento',
  'Educacional',
  'Hospital',
  'Hotel',
  'Outros',
  'Agronegócio',
  'FIAgro - FIDC'
];

function getActiveSegments(data) {
  const set = new Set(data.map(f => f.segmento));
  return ALL_SEGMENTS.filter(s => set.has(s));
}

function getActiveGestoras(data) {
  const grouped = new Map();

  data.forEach(f => {
    const gestora = f.gestor || 'Sem gestora';
    const atual = grouped.get(gestora) || 0;
    grouped.set(gestora, atual + (f.valorPatrimonial || 0));
  });

  return [...grouped.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], 'pt-BR');
    })
    .map(([gestora]) => gestora);
}
