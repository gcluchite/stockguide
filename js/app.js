const DEFAULT_LIMITS = {
  x: { min: 0, max: 2.0 },
  y: { min: 0, max: 26 }
};

const FILTER_CONFIG = {
  segmentos: {
    containerId: 'seg-pills',
    datasetKey: 'seg',
    resetDatasetKey: 'segAll',
    resetLabel: 'Todos',
    getOptions: () => getActiveSegments(FIIS_DATA).map(seg => ({
      key: seg,
      label: seg,
      dotColor: getSegmentColor(seg).stroke
    })),
    autoZoom: true
  },
  tamanhos: {
    containerId: 'tam-pills',
    datasetKey: 'tam',
    resetDatasetKey: 'tamAll',
    resetLabel: 'Todos',
    getOptions: () => [
      { key: 'pequeno', label: 'Pequeno\n(<R$ 500 MM)' },
      { key: 'medio', label: 'Medio\n(R$ 500 MM a R$ 2 bi)' },
      { key: 'grande', label: 'Grande\n(> R$ 2 bi)' }
    ],
    autoZoom: false
  },
  ifixes: {
    containerId: 'ifix-pills',
    datasetKey: 'ifix',
    resetDatasetKey: 'ifixAll',
    resetLabel: 'Todos',
    getOptions: () => [
      { key: 'ifix', label: 'Somente IFIX' },
      { key: 'fora', label: 'Fora do IFIX' }
    ],
    autoZoom: false
  }
};

const state = {
  segmentos: new Set(),
  tamanhos: new Set(),
  ifixes: new Set(),
  gestora: 'todas',
  hiddenSegs: new Set(),
  chart: null,
  activeData: []
};

document.addEventListener('DOMContentLoaded', () => {
  initRadiusScale(FIIS_DATA);
  buildAllFilters();
  buildGestoraFilter();
  buildLegend();
  renderChart();
  updateStats();
  bindModalClose();
});

function buildAllFilters() {
  Object.entries(FILTER_CONFIG).forEach(([stateKey, config]) => {
    buildFilterGroup(stateKey, config);
  });
}

function buildGestoraFilter() {
  const select = document.getElementById('gestora-select');
  if (!select) return;

  getActiveGestoras(FIIS_DATA).forEach(gestora => {
    const option = document.createElement('option');
    option.value = gestora;
    option.textContent = gestora;
    select.appendChild(option);
  });

  select.addEventListener('change', event => {
    state.gestora = event.target.value;
    refresh({ autoZoom: hasSegmentSelection() });
  });
}

function buildFilterGroup(stateKey, config) {
  const container = document.getElementById(config.containerId);
  if (!container) return;

  const resetPill = makePill(`${config.containerId}-all`, config.resetLabel, null, true);
  resetPill.dataset[config.resetDatasetKey] = 'true';
  resetPill.addEventListener('click', () => resetFilterGroup(stateKey));
  container.appendChild(resetPill);

  config.getOptions().forEach(option => {
    const pill = makePill(`${config.containerId}-${option.key}`, option.label, option.dotColor || null, false);
    pill.dataset[config.datasetKey] = option.key;
    pill.addEventListener('click', () => toggleFilterValue(stateKey, option.key, config.autoZoom));
    container.appendChild(pill);
  });
}

function makePill(id, label, dotColor, active) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  button.className = `pill${active ? ' active' : ''}`;

  if (dotColor) {
    const dot = document.createElement('span');
    dot.className = 'pill-dot';
    dot.style.background = dotColor;
    button.appendChild(dot);
  }

  button.appendChild(document.createTextNode(label));
  return button;
}

function toggleFilterValue(stateKey, value, autoZoom) {
  const set = state[stateKey];
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }

  syncFilterPills(stateKey);
  refresh({ autoZoom: autoZoom || hasSegmentSelection() });
}

function resetFilterGroup(stateKey) {
  state[stateKey].clear();
  syncFilterPills(stateKey);
  refresh({ autoZoom: stateKey === 'segmentos' ? false : hasSegmentSelection() });
}

function syncFilterPills(stateKey) {
  const config = FILTER_CONFIG[stateKey];
  const selected = state[stateKey];
  const hasSelected = selected.size > 0;

  document.querySelectorAll(`[data-${camelToKebab(config.datasetKey)}]`).forEach(el => {
    el.classList.toggle('active', selected.has(el.dataset[config.datasetKey]));
  });

  document.querySelectorAll(`[data-${camelToKebab(config.resetDatasetKey)}]`).forEach(el => {
    el.classList.toggle('active', !hasSelected);
  });
}

function camelToKebab(value) {
  return value.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

function hasSegmentSelection() {
  return state.segmentos.size > 0;
}

function buildLegend() {
  const container = document.getElementById('legend');
  const activeSegs = getActiveSegments(FIIS_DATA);

  activeSegs.forEach(seg => {
    const color = getSegmentColor(seg);
    const count = FIIS_DATA.filter(f => f.segmento === seg).length;
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.dataset.legSeg = seg;

    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = color.stroke;

    const countEl = document.createElement('span');
    countEl.className = 'legend-count';
    countEl.textContent = `(${count})`;

    item.append(dot, document.createTextNode(seg), countEl);
    item.addEventListener('click', () => toggleSegmentVisibility(seg));
    container.appendChild(item);
  });
}

function toggleSegmentVisibility(seg) {
  if (state.hiddenSegs.has(seg)) {
    state.hiddenSegs.delete(seg);
  } else {
    state.hiddenSegs.add(seg);
  }

  document.querySelectorAll('[data-leg-seg]').forEach(el => {
    if (el.dataset.legSeg === seg) {
      el.classList.toggle('hidden', state.hiddenSegs.has(seg));
    }
  });

  refresh({ autoZoom: hasSegmentSelection() });
}

function getSelectedValues(set) {
  return set.size ? Array.from(set) : null;
}

function getFilteredData() {
  const base = filterFiisByGestora(
    filterFiis(
      FIIS_DATA,
      getSelectedValues(state.segmentos),
      getSelectedValues(state.tamanhos),
      getSelectedValues(state.ifixes)
    ),
    state.gestora
  );

  return base.filter(f => !state.hiddenSegs.has(f.segmento));
}

function buildChartDatasets(fiis) {
  const bySegment = fiis.reduce((acc, fii) => {
    if (!acc[fii.segmento]) acc[fii.segmento] = [];
    acc[fii.segmento].push(fii);
    return acc;
  }, {});

  return ALL_SEGMENTS
    .filter(seg => bySegment[seg])
    .map(seg => {
      const color = getSegmentColor(seg);
      const items = bySegment[seg];
      return {
        label: seg,
        data: items.map(fii => ({
          x: fii.pvp,
          y: getYieldPonta(fii),
          r: calcRadius(fii.valorPatrimonial),
          _fii: fii
        })),
        backgroundColor: items.map(() => color.fill),
        borderColor: items.map(() => color.stroke),
        borderWidth: 1.4,
        hoverBorderWidth: 2.4,
        hoverBorderColor: items.map(() => color.stroke),
        hoverBackgroundColor: items.map(() => color.fill.replace('0.72', '0.92'))
      };
    });
}

function getLabelTargets(chart) {
  const visiblePoints = [];

  chart.data.datasets.forEach((dataset, datasetIndex) => {
    const meta = chart.getDatasetMeta(datasetIndex);
    meta.data.forEach((element, index) => {
      const raw = dataset.data[index];
      if (!raw?._fii || raw.x == null || raw.y == null) return;
      visiblePoints.push({ element, raw, radius: raw.r || 0 });
    });
  });

  if (!visiblePoints.length) return [];
  if (hasSegmentSelection() || visiblePoints.length <= 22) return visiblePoints;

  return [...visiblePoints]
    .sort((a, b) => b.radius - a.radius)
    .slice(0, 16);
}

const referenceLinesPlugin = {
  id: 'referenceLines',
  afterDraw(chart) {
    const { ctx, scales: { x, y } } = chart;
    const weighted = calcWeightedAverages(state.activeData);
    const pvpOneX = x.getPixelForValue(1);
    const top = y.top;
    const bottom = y.bottom;

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.moveTo(pvpOneX, top);
    ctx.lineTo(pvpOneX, bottom);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.textAlign = 'center';
    ctx.fillText('P/VP = 1x', pvpOneX, top - 8);

    if (weighted.pvp != null) {
      const weightedX = x.getPixelForValue(weighted.pvp);
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(220,165,58,0.92)';
      ctx.lineWidth = 1.2;
      ctx.moveTo(weightedX, top);
      ctx.lineTo(weightedX, bottom);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(241,195,107,0.98)';
      ctx.textAlign = 'center';
      ctx.fillText(`P/VP medio pond. ${fmtPVP(weighted.pvp)}`, weightedX, top + 14);
    }

    if (weighted.yieldPonta != null) {
      const weightedY = y.getPixelForValue(weighted.yieldPonta);
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(74,213,154,0.88)';
      ctx.lineWidth = 1.2;
      ctx.moveTo(x.left, weightedY);
      ctx.lineTo(x.right, weightedY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(126,242,194,0.98)';
      ctx.textAlign = 'left';
      ctx.fillText(`Yield medio pond. ${fmtPct(weighted.yieldPonta)}`, x.left + 10, weightedY - 6);
    }

    ctx.restore();
  }
};

const pointLabelPlugin = {
  id: 'pointLabelPlugin',
  afterDatasetsDraw(chart) {
    const points = getLabelTargets(chart);
    if (!points.length) return;

    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.font = '10.5px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    points.forEach(({ element, raw }) => {
      const labelX = element.x;
      const labelY = element.y - raw.r - 5;
      if (labelX < chartArea.left || labelX > chartArea.right || labelY < chartArea.top || labelY > chartArea.bottom) return;

      ctx.strokeStyle = 'rgba(7, 16, 25, 0.96)';
      ctx.lineWidth = 3.5;
      ctx.strokeText(raw._fii.ticker, labelX, labelY);
      ctx.fillStyle = '#edf3fb';
      ctx.fillText(raw._fii.ticker, labelX, labelY);
    });

    ctx.restore();
  }
};

function createChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 260 },
    layout: { padding: { top: 26, right: 16, bottom: 4, left: 6 } },
    scales: {
      x: {
        min: DEFAULT_LIMITS.x.min,
        max: DEFAULT_LIMITS.x.max,
        title: {
          display: true,
          text: 'P/VP',
          color: '#8fa4bb',
          font: { size: 12, weight: '600' },
          padding: { top: 8 }
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: {
          color: '#8fa4bb',
          font: { size: 10.5 },
          callback: value => `${Number(value).toFixed(2)}x`
        }
      },
      y: {
        min: DEFAULT_LIMITS.y.min,
        max: DEFAULT_LIMITS.y.max,
        title: {
          display: true,
          text: 'Yield Ponta (%)',
          color: '#8fa4bb',
          font: { size: 12, weight: '600' },
          padding: { bottom: 8 }
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: {
          color: '#8fa4bb',
          font: { size: 10.5 },
          callback: value => `${Number(value).toFixed(1)}%`
        }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f1825',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        titleColor: '#f1f5f9',
        bodyColor: '#a7b6c7',
        padding: 12,
        cornerRadius: 10,
        titleFont: { size: 13, weight: '700' },
        bodyFont: { size: 12 },
        callbacks: {
          title(items) {
            const fii = items[0]?.raw?._fii;
            return fii ? fii.ticker : '';
          },
          label(item) {
            const fii = item.raw._fii;
            if (!fii) return '';
            return [
              fii.nome.length > 48 ? `${fii.nome.slice(0, 46)}...` : fii.nome,
              `Yield ponta: ${fmtPct(getYieldPonta(fii))} | P/VP: ${fmtPVP(fii.pvp)}`,
              `DY LTM: ${fmtPct(fii.dyLTM)} | PL: ${fmtMM(fii.valorPatrimonial)}`
            ];
          },
          afterLabel() {
            return ['', 'Clique para detalhes'];
          }
        }
      },
      zoom: {
        zoom: {
          wheel: { enabled: true, speed: 0.08 },
          pinch: { enabled: true },
          mode: 'xy'
        },
        pan: {
          enabled: true,
          mode: 'xy'
        }
      }
    }
  };
}

function renderChart() {
  state.activeData = getFilteredData();
  const ctx = document.getElementById('bubbleChart').getContext('2d');

  Chart.defaults.color = '#8fa4bb';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';

  state.chart = new Chart(ctx, {
    type: 'bubble',
    data: { datasets: buildChartDatasets(state.activeData) },
    options: createChartOptions(),
    plugins: [referenceLinesPlugin, pointLabelPlugin]
  });

  bindChartInteractions(ctx.canvas);
}

function bindChartInteractions(canvas) {
  canvas.addEventListener('click', event => {
    const points = state.chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
    if (!points.length) return;

    const { datasetIndex, index } = points[0];
    const raw = state.chart.data.datasets[datasetIndex].data[index];
    if (raw?._fii) openModal(raw._fii);
  });

  canvas.addEventListener('mousemove', event => {
    const points = state.chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
    canvas.style.cursor = points.length ? 'pointer' : 'grab';
  });

  canvas.addEventListener('mouseleave', () => {
    canvas.style.cursor = 'default';
  });
}

function applyDefaultScaleLimits() {
  state.chart.options.scales.x.min = DEFAULT_LIMITS.x.min;
  state.chart.options.scales.x.max = DEFAULT_LIMITS.x.max;
  state.chart.options.scales.y.min = DEFAULT_LIMITS.y.min;
  state.chart.options.scales.y.max = DEFAULT_LIMITS.y.max;
}

function fitChartToData(data) {
  if (!state.chart) return;

  const points = data
    .map(fii => ({ x: fii.pvp, y: getYieldPonta(fii) }))
    .filter(point => point.x != null && point.y != null && Number.isFinite(point.x) && Number.isFinite(point.y));

  if (!points.length) {
    state.chart.resetZoom();
    applyDefaultScaleLimits();
    return;
  }

  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = Math.max((maxX - minX) * 0.18, 0.04);
  const padY = Math.max((maxY - minY) * 0.18, 0.55);

  state.chart.resetZoom();
  state.chart.options.scales.x.min = Math.max(0, minX - padX);
  state.chart.options.scales.x.max = Math.min(DEFAULT_LIMITS.x.max, maxX + padX);
  state.chart.options.scales.y.min = Math.max(0, minY - padY);
  state.chart.options.scales.y.max = Math.min(Math.max(DEFAULT_LIMITS.y.max, maxY + padY), maxY + padY);
}

function refresh({ autoZoom = false } = {}) {
  state.activeData = getFilteredData();
  state.chart.data.datasets = buildChartDatasets(state.activeData);

  if (autoZoom) {
    fitChartToData(state.activeData);
  } else {
    applyDefaultScaleLimits();
  }

  state.chart.update('active');
  updateStats();
}

function updateStats() {
  const stats = calcStats(state.activeData);
  document.getElementById('stat-count').textContent = stats.count;
  document.getElementById('stat-dy').textContent = stats.dyMed != null ? fmtPct(stats.dyMed) : '—';
  document.getElementById('stat-pvp').textContent = stats.pvpMed != null ? fmtPVP(stats.pvpMed) : '—';
  document.getElementById('stat-pl').textContent = stats.plTotal != null ? fmtMM(stats.plTotal) : '—';
  document.getElementById('stat-vm').textContent = stats.vmTotal != null ? fmtMM(stats.vmTotal) : '—';
}

function openModal(fii) {
  const color = getSegmentColor(fii.segmento);
  const badge = document.getElementById('m-seg-badge');

  document.getElementById('m-ticker').textContent = fii.ticker;
  badge.textContent = fii.segmento;
  badge.style.background = color.fill;
  badge.style.color = color.stroke;
  badge.style.border = `1px solid ${color.stroke}`;

  document.getElementById('m-nome').textContent = fii.nome || fii.ticker;
  document.getElementById('m-gestores').textContent = [fii.gestor, fii.admin].filter(Boolean).join(' · ') || '—';

  setMetricValue('m-pvp', fmtPVP(fii.pvp), getPVPClass(fii.pvp));
  setMetricValue('m-dy-ponta', fmtPct(getYieldPonta(fii)), 'gold');
  setMetricValue('m-dy-ltm', fmtPct(fii.dyLTM));
  setMetricValue('m-cotacao', fmtBRL(fii.cotacao));
  setMetricValue('m-vm', fmtMM(fii.valorMercado));
  setMetricValue('m-vp', fmtMM(fii.valorPatrimonial));
  setMetricValue('m-vol', fii.volMedio3m != null ? fmtMM(fii.volMedio3m) : '—');
  setMetricValue('m-div-mes', fii.divMes != null ? `R$ ${fii.divMes.toFixed(4).replace('.', ',')}` : '—');
  setMetricValue('m-pct-max', fii.pctMax52s != null ? fmtPct(fii.pctMax52s) : '—');
  setPlainValue('m-ifix', fii.partIfix != null ? `${fii.partIfix.toFixed(2)}%` : '—');

  setReturnValue('m-ret-mes', fii.retMes);
  setReturnValue('m-ret-ano', fii.retAno);
  setReturnValue('m-ret-ltm', fii.retLTM);

  document.getElementById('modal-backdrop').classList.add('open');
}

function setMetricValue(id, value, extraClass = '') {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = value;
  element.className = `m-value${extraClass ? ` ${extraClass}` : ''}`;
}

function setPlainValue(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = value;
}

function setReturnValue(id, value) {
  const element = document.getElementById(id);
  if (!element) return;

  if (value == null) {
    element.textContent = '—';
    element.className = 'r-value neu';
    return;
  }

  element.textContent = fmtPctSigned(value);
  element.className = `r-value ${value > 0 ? 'pos' : value < 0 ? 'neg' : 'neu'}`;
}

function getPVPClass(pvp) {
  if (pvp == null) return '';
  if (pvp < 0.9) return 'green';
  if (pvp > 1.1) return 'red';
  return '';
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
}

function bindModalClose() {
  document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
  document.getElementById('modal-backdrop')?.addEventListener('click', event => {
    if (event.target.id === 'modal-backdrop') closeModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal();
  });
}

document.getElementById('btn-reset-zoom')?.addEventListener('click', () => {
  if (!state.chart) return;
  state.chart.resetZoom();
  applyDefaultScaleLimits();
  state.chart.update('none');
});
