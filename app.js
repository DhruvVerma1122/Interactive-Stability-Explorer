/* Interactive Stability Explorer — user interface and visualization layer. */
(function () {
  'use strict';

  const DOMAIN_MIN = -6;
  const DOMAIN_MAX = 6;
  const VIEW_MIN = -5;
  const VIEW_MAX = 5;
  const PRESETS = {
    'stable-linear': {
      expression: '-2*x',
      label: 'Stable linear',
      description: 'A linear restoring system. Every non-equilibrium trajectory moves toward x = 0; the exact solution is x(t) = x₀e⁻²ᵗ.'
    },
    'unstable-linear': {
      expression: '2*x',
      label: 'Unstable linear',
      description: 'The origin repels nearby states. The exact solution is x(t) = x₀e²ᵗ, so every nonzero trajectory moves away from zero.'
    },
    'logistic': {
      expression: 'x*(1-x)',
      label: 'Logistic nonlinear',
      description: 'This logistic model has equilibria at 0 and 1. The origin is unstable, while positive initial states approach the asymptotically stable equilibrium x = 1.'
    },
    'two-roots': {
      expression: 'x^2-1',
      label: 'Two equilibria',
      description: 'The system has two equilibria: x = −1 attracts trajectories from both sides, while x = 1 repels them. The phase line changes direction at each root.'
    },
    'three-roots': {
      expression: 'x*(x-1)*(x+1)',
      label: 'Three equilibria',
      description: 'Three equilibria divide the real line into four flow regions. The origin is asymptotically stable; the equilibria at −1 and 1 are unstable.'
    }
  };

  const $ = (id) => document.getElementById(id);
  const elements = {
    preset: $('preset-select'), equation: $('equation-input'), apply: $('apply-equation'), error: $('equation-error'),
    initial: $('initial-input'), duration: $('duration-input'), step: $('step-input'),
    initialValue: $('initial-value'), durationValue: $('duration-value'), stepValue: $('step-value'),
    run: $('run-button'), pause: $('pause-button'), reset: $('reset-button'),
    progress: $('progress-fill'), progressState: $('progress-state'), progressTime: $('progress-time'),
    currentState: $('current-state'), readoutTime: $('readout-time'),
    equationChip: $('equation-chip-value'), modelStat: $('stat-model'), rootsStat: $('stat-roots'), profileStat: $('stat-profile'), statusStat: $('stat-status'),
    presetDescription: $('preset-description'), equilibriumGrid: $('equilibrium-grid'), noEquilibria: $('no-equilibria'),
    phase: $('phase-line'), direction: $('direction-field'), rootDomain: $('root-domain'),
    educationalToggle: $('educational-toggle'), learningContent: $('learning-content'), learningDisabled: $('learning-disabled'),
    compareA: $('compare-a'), compareB: $('compare-b'), compareButton: $('compare-button'), compareSummary: $('compare-summary'),
    compareRootsA: $('compare-roots-a'), compareRootsB: $('compare-roots-b'), toast: $('toast')
  };

  let activeModel = null;
  let activePreset = 'stable-linear';
  let trajectory = null;
  let currentIndex = 0;
  let animationTimer = null;
  let animationStart = 0;
  let elapsedBeforePause = 0;
  let playbackDuration = 5000;
  let solutionChart = null;
  let comparisonChart = null;
  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2300);
  }

  function format(value, digits) { return StabilityMath.formatNumber(value, digits); }

  class CanvasChartFallback {
    constructor(context, config) {
      this.ctx = context;
      this.canvas = context.canvas;
      this.data = config.data || { datasets: [] };
      this.options = config.options || {};
      this.update();
    }
    update() {
      const canvas = this.canvas;
      const ctx = this.ctx;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(260, canvas.clientWidth || 600);
      const height = Math.max(150, canvas.clientHeight || 230);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const left = 49, right = width - 14, top = 12, bottom = height - 34;
      const xMax = Number(this.options.scales && this.options.scales.x && this.options.scales.x.max) || 8;
      const allPoints = (this.data.datasets || []).flatMap((ds) => (ds.data || []).filter((p) => p && Number.isFinite(p.y)));
      let yMin = allPoints.length ? Math.min(...allPoints.map((p) => p.y)) : -1;
      let yMax = allPoints.length ? Math.max(...allPoints.map((p) => p.y)) : 1;
      if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) { yMin = -1; yMax = 1; }
      if (Math.abs(yMax - yMin) < 1e-9) { yMin -= 1; yMax += 1; }
      const pad = (yMax - yMin) * .12;
      yMin -= pad; yMax += pad;
      const xMap = (x) => left + (x / xMax) * (right - left);
      const yMap = (y) => bottom - ((y - yMin) / (yMax - yMin)) * (bottom - top);
      ctx.font = '9px "DM Mono", monospace';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= 5; i++) {
        const x = left + (right - left) * i / 5;
        const value = xMax * i / 5;
        ctx.strokeStyle = 'rgba(144,169,204,.11)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
        ctx.fillStyle = '#7187a2'; ctx.textAlign = 'center'; ctx.fillText(format(value, 2), x, bottom + 13);
      }
      for (let i = 0; i <= 4; i++) {
        const y = top + (bottom - top) * i / 4;
        const value = yMax - (yMax - yMin) * i / 4;
        ctx.strokeStyle = 'rgba(144,169,204,.10)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
        ctx.fillStyle = '#7187a2'; ctx.textAlign = 'right'; ctx.fillText(format(value, 2), left - 7, y);
      }
      ctx.strokeStyle = 'rgba(144,169,204,.34)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
      ctx.fillStyle = '#7187a2'; ctx.font = '9px "DM Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('TIME (t)', (left + right) / 2, height - 7);
      ctx.save(); ctx.translate(11, (top + bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('STATE  x(t)', 0, 0); ctx.restore();

      // Render reference lines first, then trajectories, then state markers.
      const sets = this.data.datasets || [];
      sets.filter((ds) => ds.borderDash && ds.data && ds.data.length > 1).forEach((ds) => this.drawLine(ds, xMap, yMap));
      sets.filter((ds) => !ds.borderDash && ds.showLine !== false && ds.data && ds.data.length > 1).forEach((ds) => this.drawLine(ds, xMap, yMap));
      sets.filter((ds) => ds.showLine === false || (ds.pointRadius && ds.pointRadius > 0)).forEach((ds) => this.drawPoints(ds, xMap, yMap));
    }
    drawLine(ds, xMap, yMap) {
      const ctx = this.ctx;
      ctx.save(); ctx.strokeStyle = ds.borderColor || '#35d7e9'; ctx.lineWidth = ds.borderWidth || 1.5;
      ctx.setLineDash(ds.borderDash || []); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      let started = false; ctx.beginPath();
      for (const p of (ds.data || [])) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) { started = false; continue; }
        const x = xMap(p.x), y = yMap(p.y);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.restore();
    }
    drawPoints(ds, xMap, yMap) {
      const ctx = this.ctx;
      const radius = ds.pointRadius || 3;
      ctx.save();
      for (const p of (ds.data || [])) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        ctx.beginPath(); ctx.arc(xMap(p.x), yMap(p.y), radius, 0, Math.PI * 2);
        ctx.fillStyle = Array.isArray(ds.pointBackgroundColor) ? ds.pointBackgroundColor[0] : (ds.pointBackgroundColor || '#ffcc75'); ctx.fill();
        if (ds.pointBorderWidth) { ctx.lineWidth = ds.pointBorderWidth; ctx.strokeStyle = ds.pointBorderColor || '#fff'; ctx.stroke(); }
      }
      ctx.restore();
    }
  }

  function createCharts() {
    const ChartConstructor = window.Chart || CanvasChartFallback;
    $('chart-fallback').hidden = true;
    const gridColor = 'rgba(144, 169, 204, 0.10)';
    const tickColor = '#7187a2';
    const sharedScales = {
      x: {
        type: 'linear', min: 0,
        title: { display: true, text: 'TIME  (t)', color: '#7187a2', font: { family: 'DM Mono', size: 9, weight: '400' } },
        grid: { color: gridColor }, ticks: { color: tickColor, font: { family: 'DM Mono', size: 8 }, maxTicksLimit: 9 }
      },
      y: {
        title: { display: true, text: 'STATE  x(t)', color: '#7187a2', font: { family: 'DM Mono', size: 9, weight: '400' } },
        grid: { color: gridColor }, ticks: { color: tickColor, font: { family: 'DM Mono', size: 8 }, maxTicksLimit: 7 }
      }
    };
    const baseOptions = {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { intersect: false, mode: 'nearest' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0a1524', borderColor: 'rgba(145,173,210,.23)', borderWidth: 1,
          titleColor: '#9db2cc', bodyColor: '#e5f4ff', padding: 9,
          titleFont: { family: 'DM Mono', size: 9 }, bodyFont: { family: 'DM Mono', size: 10 },
          callbacks: { label: (context) => ` ${context.dataset.label || 'x(t)'}: ${format(context.parsed.y, 5)}` }
        }
      },
      scales: sharedScales
    };
    solutionChart = new ChartConstructor($('solution-chart').getContext('2d'), {
      type: 'line', data: { datasets: [] }, options: JSON.parse(JSON.stringify(baseOptions))
    });
    const compareOptions = JSON.parse(JSON.stringify(baseOptions));
    compareOptions.scales.y.title.text = 'STATE  x(t)';
    comparisonChart = new ChartConstructor($('comparison-chart').getContext('2d'), {
      type: 'line', data: { datasets: [] }, options: compareOptions
    });
  }

  function stopTimer() {
    if (animationTimer !== null) clearInterval(animationTimer);
    animationTimer = null;
  }

  function setStatus(status) {
    elements.statusStat.textContent = status;
  }

  function getSettings() {
    return {
      initial: Number(elements.initial.value),
      duration: Number(elements.duration.value),
      step: Number(elements.step.value)
    };
  }

  function syncControlLabels() {
    elements.initialValue.textContent = Number(elements.initial.value).toFixed(2);
    elements.durationValue.textContent = Number(elements.duration.value).toFixed(1);
    elements.stepValue.textContent = Number(elements.step.value).toFixed(3);
    $('chart-step-label').textContent = `Δt = ${Number(elements.step.value).toFixed(3)}`;
  }

  function makeEquilibriumDatasets() {
    if (!activeModel) return [];
    const duration = getSettings().duration;
    return activeModel.equilibria.map((eq, index) => ({
      label: `Equilibrium x* = ${format(eq.x)}`,
      data: [{ x: 0, y: eq.x }, { x: duration, y: eq.x }],
      parsing: false, borderColor: eq.key === 'unstable' ? 'rgba(255,113,139,.62)' : (eq.key === 'semistable' ? 'rgba(255,204,117,.65)' : 'rgba(155,124,255,.60)'),
      borderWidth: 1, borderDash: [5, 5], pointRadius: 0, fill: false, tension: 0, order: 3 + index
    }));
  }

  function calculateTrajectory() {
    const settings = getSettings();
    trajectory = StabilityMath.integrateRK4(activeModel.f, settings.initial, settings.duration, settings.step);
    currentIndex = 0;
    elapsedBeforePause = 0;
    playbackDuration = Math.max(1800, Math.min(8500, settings.duration * 170));
    updateSolutionChart();
    updatePlaybackUI();
    if (trajectory.stopped) showToast(trajectory.message);
  }

  function updateSolutionChart() {
    if (!solutionChart || !trajectory) return;
    const points = trajectory.points.slice(0, currentIndex + 1).map((p) => ({ x: p.t, y: p.x }));
    const last = trajectory.points[Math.min(currentIndex, trajectory.points.length - 1)];
    const duration = getSettings().duration;
    const base = [
      ...makeEquilibriumDatasets(),
      {
        label: 'Numerical solution x(t)', data: points, parsing: false,
        borderColor: '#35d7e9', backgroundColor: 'rgba(53,215,233,.08)', borderWidth: 2.1,
        pointRadius: 0, pointHitRadius: 5, tension: 0, fill: false, order: 1
      },
      {
        label: 'Current state', data: last && Number.isFinite(last.x) ? [{ x: last.t, y: last.x }] : [], parsing: false,
        showLine: false, pointRadius: 5, pointHoverRadius: 7, pointBackgroundColor: '#ffcc75',
        pointBorderColor: '#fff0d4', pointBorderWidth: 1.5, order: 0
      },
      {
        label: 'Initial condition', data: [{ x: 0, y: getSettings().initial }], parsing: false,
        showLine: false, pointRadius: 3.2, pointHoverRadius: 5, pointBackgroundColor: '#9b7cff',
        pointBorderColor: '#e4dcff', pointBorderWidth: 1, order: 0
      }
    ];
    solutionChart.data.datasets = base;
    solutionChart.options.scales.x.min = 0;
    solutionChart.options.scales.x.max = duration;
    solutionChart.update('none');
  }

  function updatePlaybackUI() {
    const total = trajectory ? trajectory.points.length - 1 : 0;
    const point = trajectory ? trajectory.points[Math.min(currentIndex, total)] : null;
    const t = point ? point.t : 0;
    const x = point ? point.x : getSettings().initial;
    const fraction = total ? currentIndex / total : 0;
    elements.progress.style.width = `${Math.max(0, Math.min(100, fraction * 100))}%`;
    elements.progressTime.textContent = `t = ${format(t, 2)}`;
    elements.readoutTime.textContent = `t = ${format(t, 2)}`;
    elements.currentState.textContent = Number.isFinite(x) ? format(x, 5) : 'diverged';
    elements.progressState.textContent = animationTimer !== null ? 'RUNNING' : (fraction >= 1 ? 'COMPLETE' : (elapsedBeforePause > 0 ? 'PAUSED' : 'READY'));
    elements.run.disabled = animationTimer !== null || fraction >= 1;
    elements.run.innerHTML = elapsedBeforePause > 0 && fraction < 1 ? '<span>▶</span> Resume' : '<span>▶</span> Start';
    elements.pause.disabled = animationTimer === null;
    if (solutionChart) updateSolutionChart();
    renderPhaseLine();
    renderDirectionField();
  }

  function updateAnimation() {
    if (!trajectory) return;
    const elapsed = elapsedBeforePause + (performance.now() - animationStart);
    const fraction = Math.min(1, elapsed / playbackDuration);
    const maxIndex = trajectory.points.length - 1;
    const nextIndex = Math.min(maxIndex, Math.floor(fraction * maxIndex));
    if (nextIndex !== currentIndex) {
      currentIndex = nextIndex;
      updatePlaybackUI();
    }
    if (fraction >= 1 || currentIndex >= maxIndex) {
      currentIndex = maxIndex;
      stopTimer();
      elapsedBeforePause = playbackDuration;
      updatePlaybackUI();
      setStatus(trajectory.stopped ? 'Stopped at limit' : 'Completed');
      elements.progressState.textContent = 'COMPLETE';
      elements.run.disabled = true;
      elements.pause.disabled = true;
    }
  }

  function startSimulation() {
    if (!trajectory) return;
    if (currentIndex >= trajectory.points.length - 1) {
      currentIndex = 0;
      elapsedBeforePause = 0;
      updatePlaybackUI();
    }
    if (animationTimer !== null) return;
    animationStart = performance.now();
    animationTimer = setInterval(updateAnimation, 35);
    setStatus('Running');
    elements.progressState.textContent = 'RUNNING';
    elements.run.disabled = true;
    elements.pause.disabled = false;
  }

  function pauseSimulation() {
    if (animationTimer === null) return;
    elapsedBeforePause += performance.now() - animationStart;
    stopTimer();
    setStatus('Paused');
    updatePlaybackUI();
    elements.progressState.textContent = 'PAUSED';
    elements.run.disabled = false;
    elements.pause.disabled = true;
  }

  function resetSimulation() {
    stopTimer();
    currentIndex = 0;
    elapsedBeforePause = 0;
    if (trajectory) updatePlaybackUI();
    setStatus('Ready to run');
    elements.progressState.textContent = 'READY';
    elements.run.disabled = false;
    elements.run.innerHTML = '<span>▶</span> Start';
    elements.pause.disabled = true;
  }

  function renderEquilibria() {
    const equilibria = activeModel.equilibria;
    elements.equilibriumGrid.innerHTML = '';
    elements.noEquilibria.hidden = equilibria.length !== 0;
    if (!equilibria.length) return;
    equilibria.forEach((eq, index) => {
      const card = document.createElement('article');
      card.className = `equilibrium-card ${eq.key}`;
      const derivativeText = Number.isFinite(eq.derivative) ? format(eq.derivative, 5) : 'undefined';
      card.innerHTML = `
        <div class="equilibrium-top"><span class="equilibrium-label">EQUILIBRIUM ${String(index + 1).padStart(2, '0')}</span><span class="equilibrium-status">${eq.type.toUpperCase()}</span></div>
        <div class="equilibrium-value">x* = ${format(eq.x, 6)}</div>
        <div class="equilibrium-derivative">f′(x*) ≈ ${derivativeText}</div>
        <p class="equilibrium-explanation">${eq.explanation}</p>`;
      elements.equilibriumGrid.appendChild(card);
    });
  }

  function svgText(x, y, text, fill, anchor, size) {
    return `<text x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor || 'middle'}" font-family="DM Mono, monospace" font-size="${size || 8}">${text}</text>`;
  }

  function yFromState(x, height, top, bottom) {
    const clipped = Math.max(VIEW_MIN, Math.min(VIEW_MAX, x));
    return bottom - ((clipped - VIEW_MIN) / (VIEW_MAX - VIEW_MIN)) * (bottom - top);
  }

  function renderPhaseLine() {
    if (!activeModel || !elements.phase) return;
    const width = Math.max(250, elements.phase.clientWidth || 300);
    const height = 176;
    const axisX = width * 0.56;
    const arrowX = axisX - 55;
    const top = 14, bottom = 150;
    const y = (x) => yFromState(x, height, top, bottom);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Phase line with equilibrium markers and flow arrows"><defs><marker id="phase-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#35d7e9"/></marker><marker id="phase-arrow-down" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#9b7cff"/></marker></defs>`;
    svg += `<line x1="${axisX}" y1="${top}" x2="${axisX}" y2="${bottom}" stroke="rgba(148,177,216,.45)" stroke-width="1.2"/>`;
    [-5, 0, 5].forEach((v) => { const yy = y(v); svg += `<line x1="${axisX - 4}" y1="${yy}" x2="${axisX + 4}" y2="${yy}" stroke="#6e829d"/>${svgText(axisX + 11, yy + 3, String(v), '#7085a0', 'start', 7)}`; });
    const rootsInView = activeModel.equilibria.filter((eq) => eq.x >= VIEW_MIN && eq.x <= VIEW_MAX);
    const limits = [VIEW_MIN, ...rootsInView.map((eq) => eq.x), VIEW_MAX];
    for (let i = 0; i < limits.length - 1; i++) {
      const a = limits[i], b = limits[i + 1];
      if (b - a < 1e-5) continue;
      const mid = (a + b) / 2;
      const sign = StabilityMath.directionAt(activeModel.f, mid);
      if (!sign) continue;
      const state = (a + b) / 2;
      const yy = y(state);
      const up = sign > 0;
      const fromY = up ? yy + 11 : yy - 11;
      const toY = up ? yy - 11 : yy + 11;
      const marker = up ? 'url(#phase-arrow)' : 'url(#phase-arrow-down)';
      const stroke = up ? '#35d7e9' : '#9b7cff';
      svg += `<line x1="${arrowX}" y1="${fromY}" x2="${arrowX}" y2="${toY}" stroke="${stroke}" stroke-width="1.9" stroke-linecap="round" marker-end="${marker}" opacity=".95"/>`;
      svg += svgText(arrowX - 11, yy + 3, sign > 0 ? '+' : '−', stroke, 'end', 8);
    }
    rootsInView.forEach((eq) => {
      const yy = y(eq.x);
      const color = eq.key === 'unstable' ? '#ff718b' : (eq.key === 'semistable' ? '#ffcc75' : (eq.key === 'stable' ? '#35d7e9' : '#51e2be'));
      const fill = eq.key === 'unstable' ? '#111d2e' : color;
      svg += `<line x1="${axisX - 13}" y1="${yy}" x2="${axisX + 13}" y2="${yy}" stroke="${color}" stroke-width="1.1" opacity=".7"/>`;
      svg += `<circle cx="${axisX}" cy="${yy}" r="5.1" fill="${fill}" stroke="${color}" stroke-width="2"/>`;
      svg += svgText(axisX + 23, yy + 3, `x*=${format(eq.x, 3)}`, color, 'start', 8);
    });
    const current = trajectory && trajectory.points[Math.min(currentIndex, trajectory.points.length - 1)] ? trajectory.points[Math.min(currentIndex, trajectory.points.length - 1)].x : getSettings().initial;
    if (Number.isFinite(current)) {
      const cy = y(current);
      svg += `<circle cx="${axisX}" cy="${cy}" r="8" fill="none" stroke="#ffcc75" stroke-width="1.2" opacity=".55"/><circle cx="${axisX}" cy="${cy}" r="3.4" fill="#ffcc75" stroke="#fff0d2" stroke-width="1"/>`;
      svg += svgText(axisX - 16, Math.max(9, cy - 8), 'x(t)', '#ffcc75', 'end', 7);
    }
    svg += `${svgText(arrowX, 165, 'FLOW', '#7085a0', 'middle', 7)}${svgText(axisX, 165, 'STATE x', '#7085a0', 'middle', 7)}</svg>`;
    elements.phase.innerHTML = svg;
  }

  function renderDirectionField() {
    if (!activeModel || !elements.direction) return;
    const width = Math.max(250, elements.direction.clientWidth || 300);
    const height = 176;
    const left = 18, right = width - 17, baseline = 88;
    const sx = (x) => left + ((x - VIEW_MIN) / (VIEW_MAX - VIEW_MIN)) * (right - left);
    const sampleValues = [];
    for (let i = 0; i <= 50; i++) {
      const x = VIEW_MIN + (VIEW_MAX - VIEW_MIN) * i / 50;
      const v = activeModel.f(x);
      if (Number.isFinite(v)) sampleValues.push(Math.abs(v));
    }
    const maxMagnitude = Math.max(1e-8, ...sampleValues);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Direction field showing arrows in the direction of f of x"><defs><marker id="field-right" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#35d7e9"/></marker><marker id="field-left" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto"><path d="M6,0 L0,3 L6,6 z" fill="#9b7cff"/></marker></defs>`;
    [-5, -2.5, 0, 2.5, 5].forEach((v) => {
      const xx = sx(v);
      svg += `<line x1="${xx}" y1="17" x2="${xx}" y2="153" stroke="rgba(133,160,198,.11)" stroke-dasharray="2 4"/>`;
      svg += svgText(xx, 166, format(v, 1), '#7085a0', 'middle', 7);
    });
    svg += `<line x1="${left}" y1="${baseline}" x2="${right}" y2="${baseline}" stroke="rgba(148,177,216,.42)" stroke-width="1.1"/>`;
    const rowYs = [37, 88, 139];
    for (const rowY of rowYs) {
      for (let i = 0; i <= 10; i++) {
        const x = VIEW_MIN + i;
        const value = activeModel.f(x);
        if (!Number.isFinite(value) || Math.abs(value) < maxMagnitude * 0.0005) continue;
        const sign = value > 0 ? 1 : -1;
        const center = sx(x);
        const magnitude = Math.min(1, Math.abs(value) / maxMagnitude);
        const length = 12 + 25 * magnitude;
        let x1 = sign > 0 ? center - length / 2 : center + length / 2;
        let x2 = sign > 0 ? center + length / 2 : center - length / 2;
        x1 = Math.max(left + 1, x1); x2 = Math.min(right - 1, x2);
        const stroke = sign > 0 ? '#35d7e9' : '#9b7cff';
        const marker = sign > 0 ? 'url(#field-right)' : 'url(#field-left)';
        svg += `<line x1="${x1}" y1="${rowY}" x2="${x2}" y2="${rowY}" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" marker-end="${marker}" opacity="${0.55 + magnitude * 0.4}"/>`;
      }
    }
    activeModel.equilibria.filter((eq) => eq.x >= VIEW_MIN && eq.x <= VIEW_MAX).forEach((eq) => {
      const xx = sx(eq.x);
      const color = eq.key === 'unstable' ? '#ff718b' : (eq.key === 'semistable' ? '#ffcc75' : (eq.key === 'stable' ? '#35d7e9' : '#51e2be'));
      svg += `<line x1="${xx}" y1="12" x2="${xx}" y2="154" stroke="${color}" stroke-width="1" stroke-dasharray="3 4" opacity=".35"/><circle cx="${xx}" cy="${baseline}" r="4.7" fill="#101a2a" stroke="${color}" stroke-width="2"/>`;
    });
    const current = trajectory && trajectory.points[Math.min(currentIndex, trajectory.points.length - 1)] ? trajectory.points[Math.min(currentIndex, trajectory.points.length - 1)].x : getSettings().initial;
    if (Number.isFinite(current) && current >= VIEW_MIN && current <= VIEW_MAX) {
      const xx = sx(current);
      svg += `<line x1="${xx}" y1="11" x2="${xx}" y2="155" stroke="#ffcc75" stroke-width="1.1" stroke-dasharray="2 3" opacity=".7"/><circle cx="${xx}" cy="${baseline}" r="2.5" fill="#ffcc75"/>`;
    }
    svg += '</svg>';
    elements.direction.innerHTML = svg;
  }

  function updateQuickStats() {
    const eqs = activeModel.equilibria;
    elements.equationChip.textContent = activeModel.expression;
    elements.modelStat.textContent = `dx/dt = ${activeModel.expression}`;
    elements.rootsStat.textContent = `${eqs.length} ${eqs.length === 1 ? 'point' : 'points'}`;
    if (!eqs.length) elements.profileStat.textContent = 'No roots in interval';
    else {
      const stable = eqs.filter((eq) => eq.key === 'asymptotically-stable' || eq.key === 'stable').length;
      const unstable = eqs.filter((eq) => eq.key === 'unstable').length;
      const semi = eqs.filter((eq) => eq.key === 'semistable').length;
      const pieces = [];
      if (stable) pieces.push(`${stable} attracting`);
      if (unstable) pieces.push(`${unstable} repelling`);
      if (semi) pieces.push(`${semi} semi`);
      elements.profileStat.textContent = pieces.join(' · ') || 'See phase line';
    }
  }

  function updateModelDescription() {
    const presetInfo = PRESETS[activePreset];
    elements.presetDescription.textContent = presetInfo ? presetInfo.description : 'Custom model: the application will numerically locate equilibrium points in the displayed interval, test local flow directions, and integrate the solution from the chosen initial condition.';
  }

  function signMarkup(sign, side) {
    if (sign > 0) return `<span>${side} of x*</span><b class="sign-positive">f(x) &gt; 0 · →</b>`;
    if (sign < 0) return `<span>${side} of x*</span><b class="sign-negative">f(x) &lt; 0 · ←</b>`;
    return `<span>${side} of x*</span><b class="sign-neutral">f(x) ≈ 0</b>`;
  }

  function updateLearningPanel() {
    const eqs = activeModel.equilibria;
    if (!eqs.length) {
      $('learning-step-1').textContent = `Solve f(x) = 0 for f(x) = ${activeModel.expression}. No equilibrium was detected in the current interval [−6, 6].`;
      $('learning-derivative').textContent = 'not available';
      $('learning-step-2').textContent = 'The derivative test is performed at equilibrium points, so it cannot be evaluated here.';
      $('learning-signs').innerHTML = '<span>No equilibrium</span><b class="sign-neutral">No sign test</b>';
      $('learning-step-3').textContent = 'Inspect the direction field and consider whether an equilibrium exists outside the current search interval.';
      $('learning-conclusion').innerHTML = '<span class="conclusion-check">i</span><div><b>No detected equilibrium</b><p>There is no equilibrium to classify within the selected interval.</p></div>';
      return;
    }
    const eq = eqs[0];
    const d = eq.derivative;
    const gapLeft = eqs.length > 1 ? Math.abs(eqs[1].x - eq.x) : 1;
    const delta = Math.max(1e-4, Math.min(.01 * Math.max(1, Math.abs(eq.x)), gapLeft * .16));
    const leftVal = activeModel.f(eq.x - delta);
    const rightVal = activeModel.f(eq.x + delta);
    const leftSign = !Number.isFinite(leftVal) ? 0 : (leftVal > 0 ? 1 : (leftVal < 0 ? -1 : 0));
    const rightSign = !Number.isFinite(rightVal) ? 0 : (rightVal > 0 ? 1 : (rightVal < 0 ? -1 : 0));
    const rootsText = eqs.map((item) => format(item.x, 5)).join(', ');
    $('learning-step-1').textContent = `Solve ${activeModel.expression} = 0. The numerical search detects equilibrium point(s) at x* = ${rootsText}. We will inspect x* = ${format(eq.x, 5)}.`;
    $('learning-derivative').textContent = format(d, 5);
    $('learning-step-2').textContent = Math.abs(d) < 1e-5
      ? `The derivative is approximately zero, so the linearization test is inconclusive. Use the signs of f(x) just to the left and right of x*.`
      : `The numerical derivative is f′(x*) ≈ ${format(d, 5)}. ${d < 0 ? 'Since it is negative, the linearized flow is restoring.' : 'Since it is positive, the linearized flow pushes nearby states away.'}`;
    $('learning-signs').innerHTML = `${signMarkup(leftSign, 'Left')}${signMarkup(rightSign, 'Right')}`;
    if (leftSign > 0 && rightSign < 0) {
      $('learning-step-3').textContent = 'On the left, f(x) is positive so x increases. On the right, f(x) is negative so x decreases. Both trajectories move toward x*.';
    } else if (leftSign < 0 && rightSign > 0) {
      $('learning-step-3').textContent = 'On the left, x decreases; on the right, x increases. The flow points away from x* on both sides.';
    } else if (leftSign === rightSign && leftSign !== 0) {
      $('learning-step-3').textContent = 'The flow has the same sign on both sides. It approaches the equilibrium from one side and departs from the other.';
    } else {
      $('learning-step-3').textContent = 'The sampled signs are inconclusive or close to zero. Inspect the phase line and consider a smaller neighborhood or a symbolic argument.';
    }
    const conclusionDescriptions = {
      'asymptotically-stable': 'Nearby states approach x* as time increases.',
      unstable: 'A small disturbance can move the state away from x*.',
      semistable: 'The equilibrium attracts from one side and repels from the other.',
      stable: 'The local motion does not move nearby states away in this test.'
    };
    const icon = eq.key === 'unstable' ? '↗' : (eq.key === 'semistable' ? '↔' : '✓');
    $('learning-conclusion').innerHTML = `<span class="conclusion-check">${icon}</span><div><b>${eq.type}</b><p>${conclusionDescriptions[eq.key]}</p></div>`;
  }

  function updateEducationalVisibility() {
    const on = elements.educationalToggle.checked;
    elements.learningContent.hidden = !on;
    elements.learningDisabled.hidden = on;
  }

  function applyExpression(expression, notify) {
    try {
      const newModel = StabilityMath.analyze(expression, DOMAIN_MIN, DOMAIN_MAX);
      activeModel = newModel;
      elements.error.hidden = true;
      elements.error.textContent = '';
      elements.equation.value = newModel.expression;
      renderEquilibria();
      updateQuickStats();
      updateModelDescription();
      updateLearningPanel();
      elements.rootDomain.textContent = '−6 ≤ x ≤ 6';
      syncControlLabels();
      stopTimer();
      calculateTrajectory();
      setStatus('Ready to run');
      renderPhaseLine();
      renderDirectionField();
      if (notify) showToast('Equation updated and stability analysis refreshed.');
      return true;
    } catch (error) {
      elements.error.textContent = error.message || 'Invalid equation. Check the expression and try again.';
      elements.error.hidden = false;
      showToast('Equation could not be applied.');
      return false;
    }
  }

  function rebuildFromControls() {
    if (!activeModel) return;
    stopTimer();
    syncControlLabels();
    calculateTrajectory();
    setStatus('Ready to run');
  }

  function createCompareRoots(model, target, label) {
    const chips = model.equilibria.map((eq) => `<span class="compare-root-chip ${eq.key}">x*=${format(eq.x, 4)} · ${eq.type}</span>`).join('');
    target.innerHTML = `<div class="compare-root-head">${label} · ${model.expression}</div><div class="compare-root-list">${chips || '<span class="compare-empty">No equilibrium detected in [−6, 6]</span>'}</div>`;
  }

  function compareSystems() {
    try {
      const presetA = PRESETS[elements.compareA.value];
      const presetB = PRESETS[elements.compareB.value];
      const modelA = StabilityMath.analyze(presetA.expression, DOMAIN_MIN, DOMAIN_MAX);
      const modelB = StabilityMath.analyze(presetB.expression, DOMAIN_MIN, DOMAIN_MAX);
      const settings = getSettings();
      const pathA = StabilityMath.integrateRK4(modelA.f, settings.initial, settings.duration, settings.step);
      const pathB = StabilityMath.integrateRK4(modelB.f, settings.initial, settings.duration, settings.step);
      const mapPoints = (path) => path.points.map((point) => ({ x: point.t, y: point.x }));
      if (comparisonChart) {
        comparisonChart.data.datasets = [
          { label: `System A · ${modelA.expression}`, data: mapPoints(pathA), parsing: false, borderColor: '#35d7e9', borderWidth: 2.1, pointRadius: 0, tension: 0, spanGaps: false },
          { label: `System B · ${modelB.expression}`, data: mapPoints(pathB), parsing: false, borderColor: '#a58aff', borderWidth: 2.1, pointRadius: 0, tension: 0, spanGaps: false }
        ];
        comparisonChart.options.scales.x.min = 0;
        comparisonChart.options.scales.x.max = settings.duration;
        comparisonChart.update('none');
      }
      createCompareRoots(modelA, elements.compareRootsA, 'SYSTEM A');
      createCompareRoots(modelB, elements.compareRootsB, 'SYSTEM B');
      $('compare-chart-legend').innerHTML = `<span><i class="compare-line compare-line-a"></i>System A · ${modelA.expression}</span><span><i class="compare-line compare-line-b"></i>System B · ${modelB.expression}</span>`;
      const typeList = (model) => model.equilibria.length ? model.equilibria.map((eq) => eq.type.toLowerCase()).join(', ') : 'no detected equilibria';
      elements.compareSummary.innerHTML = `<span class="compare-summary-icon">⇄</span><span>Both systems start at <b>x(0) = ${format(settings.initial, 3)}</b> and run to <b>T = ${format(settings.duration, 2)}</b>. A has ${modelA.equilibria.length} equilibrium point(s) (${typeList(modelA)}); B has ${modelB.equilibria.length} (${typeList(modelB)}).</span>`;
      if (pathA.stopped || pathB.stopped) showToast('One comparison trajectory reached the numerical safety limit.');
    } catch (error) {
      showToast(error.message || 'Comparison could not be generated.');
    }
  }

  function initializeEvents() {
    elements.preset.addEventListener('change', () => {
      if (elements.preset.value === 'custom') {
        activePreset = 'custom';
        elements.equation.focus();
        updateModelDescription();
        return;
      }
      activePreset = elements.preset.value;
      elements.equation.value = PRESETS[activePreset].expression;
      applyExpression(elements.equation.value, false);
    });
    const applyCustom = () => {
      activePreset = 'custom';
      elements.preset.value = 'custom';
      applyExpression(elements.equation.value, true);
    };
    elements.apply.addEventListener('click', applyCustom);
    elements.equation.addEventListener('keydown', (event) => { if (event.key === 'Enter') applyCustom(); });
    elements.equation.addEventListener('change', () => { if (elements.equation.value.trim()) applyCustom(); });
    elements.initial.addEventListener('input', rebuildFromControls);
    elements.duration.addEventListener('input', rebuildFromControls);
    elements.step.addEventListener('input', rebuildFromControls);
    elements.run.addEventListener('click', startSimulation);
    elements.pause.addEventListener('click', pauseSimulation);
    elements.reset.addEventListener('click', resetSimulation);
    elements.educationalToggle.addEventListener('change', updateEducationalVisibility);
    elements.compareButton.addEventListener('click', compareSystems);
    window.addEventListener('resize', () => { renderPhaseLine(); renderDirectionField(); });
  }

  function initialize() {
    createCharts();
    initializeEvents();
    syncControlLabels();
    updateEducationalVisibility();
    applyExpression(PRESETS['stable-linear'].expression, false);
    // Populate an initial comparison so the section is useful immediately.
    compareSystems();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
