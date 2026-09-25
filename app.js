(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const stage = $('stage');
  const empty = $('empty');
  const fileInput = $('file');
  const status = $('status');
  const view = $('view');
  const download = $('export');
  const ctx = canvas.getContext('2d');
  const toolButtons = [...document.querySelectorAll('.tool')];
  const sizeInput = $('size');
  const colorInput = $('color');
  const ids = ['exposure','brightness','contrast','highlights','shadows','temperature','tint','saturation','vibrance','hue'];
  const state = {
    width: 900, height: 600, zoom: 1, tool: 'select', fg: colorInput?.value || '#111111',
    layers: [], selectedId: null, selection: null, drawing: false, last: null,
    history: [], historyIndex: -1, ants: 0, panX: 0, panY: 0, panning: false
  };

  const overlay = document.createElement('canvas');
  overlay.id = 'selectionOverlay';
  overlay.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;visibility:hidden';
  stage.appendChild(overlay);
  const overlayContext = overlay.getContext('2d');

  const id = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const activeLayer = () => state.layers.find((layer) => layer.id === state.selectedId) || null;
  const canvasFor = (width = state.width, height = state.height) => { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; };

  function setStatus(message) { if (status) status.textContent = message; }
  function setLoaded(value) { empty.hidden = value; canvas.style.visibility = value ? 'visible' : 'hidden'; overlay.style.visibility = value ? 'visible' : 'hidden'; if (view) view.disabled = !value; if (download) download.disabled = !value; }
  function makeLayer(name = 'Layer') { return { id: id(), name, canvas: canvasFor(), x: 0, y: 0, width: state.width, height: state.height, opacity: 1, visible: true, locked: false, blend: 'source-over' }; }

  function normaliseRect(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }; }

  function screenPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * state.width / rect.width, y: (event.clientY - rect.top) * state.height / rect.height };
  }

  function selectedPoint(point) {
    const layer = activeLayer();
    return { x: point.x - (layer?.x || 0), y: point.y - (layer?.y || 0) };
  }

  function insideSelection(x, y) {
    const s = state.selection;
    return !s || (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
  }

  function composite() {
    const output = canvasFor();
    const out = output.getContext('2d');
    for (const layer of state.layers) {
      if (!layer.visible) continue;
      out.save(); out.globalAlpha = layer.opacity; out.globalCompositeOperation = layer.blend;
      out.drawImage(layer.canvas, layer.x, layer.y, layer.width, layer.height); out.restore();
    }
    return output;
  }

  function render() {
    canvas.width = state.width; canvas.height = state.height;
    canvas.style.width = `${state.width * state.zoom}px`; canvas.style.height = `${state.height * state.zoom}px`;
    overlay.width = state.width; overlay.height = state.height;
    overlay.style.width = canvas.style.width; overlay.style.height = canvas.style.height;
    ctx.clearRect(0, 0, state.width, state.height); ctx.drawImage(composite(), 0, 0);
    drawSelection();
    setLoaded(state.layers.length > 0);
  }

  function drawSelection() {
    overlayContext.clearRect(0, 0, state.width, state.height);
    if (!state.selection) return;
    const s = state.selection;
    overlayContext.save(); overlayContext.setLineDash([6, 4]); overlayContext.lineDashOffset = -state.ants;
    overlayContext.lineWidth = 1; overlayContext.strokeStyle = '#fff'; overlayContext.strokeRect(s.x + .5, s.y + .5, s.w, s.h);
    overlayContext.lineDashOffset = 3 - state.ants; overlayContext.strokeStyle = '#111'; overlayContext.strokeRect(s.x + .5, s.y + .5, s.w, s.h);
    overlayContext.restore();
  }

  function animateAnts() { state.ants = (state.ants + 0.5) % 10; drawSelection(); requestAnimationFrame(animateAnts); }

  function snapshot() {
    return { width: state.width, height: state.height, selectedId: state.selectedId, selection: state.selection && { ...state.selection }, layers: state.layers.map((layer) => ({ ...layer, canvas: layer.canvas.toDataURL() })) };
  }

  async function restore(saved) {
    state.width = saved.width; state.height = saved.height; state.selectedId = saved.selectedId; state.selection = saved.selection;
    state.layers = [];
    for (const data of saved.layers) {
      const layer = { ...data, canvas: canvasFor(state.width, state.height) };
      const image = new Image(); image.src = data.canvas;
      await new Promise((resolve) => { image.onload = () => { layer.canvas.getContext('2d').drawImage(image, 0, 0); resolve(); }; image.onerror = resolve; });
      state.layers.push(layer);
    }
    render(); renderLayerPanel();
  }

  function record(label) {
    const saved = snapshot();
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push({ label, saved }); state.historyIndex = state.history.length - 1;
    const history = document.querySelector('#history'); if (history) history.innerHTML = state.history.map((entry) => `<li>${entry.label}</li>`).join('');
    renderLayerPanel();
  }

  async function undo() { if (state.historyIndex <= 0) return; state.historyIndex--; await restore(state.history[state.historyIndex].saved); setStatus('Undo'); }
  async function redo() { if (state.historyIndex >= state.history.length - 1) return; state.historyIndex++; await restore(state.history[state.historyIndex].saved); setStatus('Redo'); }

  function drawSegment(from, to, erase = false) {
    const layer = activeLayer(); if (!layer || layer.locked) return;
    const a = selectedPoint(from); const b = selectedPoint(to); const brush = layer.canvas.getContext('2d');
    brush.save(); brush.globalAlpha = Math.max(0.01, Number(document.querySelector('#opacity')?.value || 100) / 100);
    brush.globalCompositeOperation = erase ? 'destination-out' : 'source-over'; brush.strokeStyle = state.fg;
    brush.lineWidth = Math.max(1, Number(sizeInput?.value || 12)); brush.lineCap = 'round'; brush.lineJoin = 'round';
    brush.beginPath(); brush.moveTo(a.x, a.y); brush.lineTo(b.x, b.y); brush.stroke(); brush.restore();
  }

  function startStroke(point) { state.drawing = true; state.last = point; canvas.setPointerCapture?.(event?.pointerId); drawSegment(point, point, state.tool === 'eraser'); }
  function continueStroke(point) { if (!state.drawing || !state.last) return; drawSegment(state.last, point, state.tool === 'eraser'); state.last = point; render(); }
  function finishStroke() { if (!state.drawing) return; state.drawing = false; state.last = null; record(state.tool === 'eraser' ? 'Erase stroke' : 'Brush stroke'); render(); }

  function renderLayerPanel() {
    const aside = document.querySelector('main > aside'); if (!aside) return;
    let panel = document.querySelector('#runtimeLayers');
    if (!panel) { panel = document.createElement('section'); panel.id = 'runtimeLayers'; panel.innerHTML = '<h2>Layers</h2><div class="runtime-layer-actions"><button data-action="add">＋</button><button data-action="duplicate">⧉</button><button data-action="delete">−</button></div><ul></ul>'; aside.appendChild(panel); panel.addEventListener('click', layerPanelClick); }
    const list = panel.querySelector('ul'); list.innerHTML = state.layers.slice().reverse().map((layer) => `<li data-id="${layer.id}" class="${layer.id === state.selectedId ? 'selected' : ''}"><button data-action="visibility">${layer.visible ? '◉' : '○'}</button><span>${layer.name}</span><button data-action="lock">${layer.locked ? '▣' : '□'}</button></li>`).join('');
  }

  function layerPanelClick(event) {
    const row = event.target.closest('li'); const action = event.target.dataset.action;
    if (action === 'add') { const layer = makeLayer(); state.layers.push(layer); state.selectedId = layer.id; record('Add layer'); render(); return; }
    if (action === 'duplicate') { const source = activeLayer(); if (!source) return; const layer = makeLayer(`${source.name} copy`); layer.canvas.getContext('2d').drawImage(source.canvas, 0, 0); state.layers.push(layer); state.selectedId = layer.id; record('Duplicate layer'); render(); return; }
    if (action === 'delete') { const index = state.layers.findIndex((item) => item.id === state.selectedId); if (index >= 0) { state.layers.splice(index, 1); state.selectedId = state.layers[Math.max(0, index - 1)]?.id || null; record('Delete layer'); render(); } return; }
    if (!row) return; const layer = state.layers.find((item) => item.id === row.dataset.id); if (!layer) return;
    if (action === 'visibility') layer.visible = !layer.visible; else if (action === 'lock') layer.locked = !layer.locked; else state.selectedId = layer.id;
    renderLayerPanel(); render();
  }

  function setTool(tool) { state.tool = tool === 'select' ? 'marquee' : tool; toolButtons.forEach((button) => button.classList.toggle('active', button.dataset.tool === tool)); setStatus(`${tool} tool`); }

  function loadImage(file) {
    if (!file || !file.type.startsWith('image/')) { setStatus('Please choose an image file.'); return; }
    setStatus('Loading…'); const reader = new FileReader();
    reader.onload = () => { const image = new Image(); image.onload = () => { state.width = image.naturalWidth; state.height = image.naturalHeight; const layer = makeLayer(file.name); layer.canvas = canvasFor(state.width, state.height); layer.width = state.width; layer.height = state.height; layer.canvas.getContext('2d').drawImage(image, 0, 0); state.layers = [layer]; state.selectedId = layer.id; state.zoom = Math.min((stage.clientWidth - 40) / state.width, (stage.clientHeight - 40) / state.height, 1); state.panX = state.panY = 0; state.history = []; state.historyIndex = -1; record('Open image'); render(); setStatus(`Loaded: ${file.name}`); }; image.onerror = () => setStatus('The image could not be loaded.'); image.src = reader.result; }; reader.onerror = () => setStatus('The image could not be read.'); reader.readAsDataURL(file);
  }

  function fit() { if (!state.layers.length) return; state.zoom = Math.min((stage.clientWidth - 40) / state.width, (stage.clientHeight - 40) / state.height); state.panX = state.panY = 0; render(); }

  $('open')?.addEventListener('click', () => fileInput.click()); fileInput?.addEventListener('change', (event) => { loadImage(event.target.files?.[0]); event.target.value = ''; });
  download?.addEventListener('click', () => { const out = composite(); out.toBlob((blob) => { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'pixelforge-edited.png'; link.click(); }, 'image/png'); });
  view?.addEventListener('click', () => { const out = composite(); window.open(out.toDataURL('image/png'), '_blank'); });
  $('reset')?.addEventListener('click', () => { state.selection = null; state.panX = state.panY = 0; fit(); });
  $('fit')?.addEventListener('click', fit); $('zoomIn')?.addEventListener('click', () => { state.zoom = Math.min(8, state.zoom * 1.2); render(); }); $('zoomOut')?.addEventListener('click', () => { state.zoom = Math.max(.1, state.zoom / 1.2); render(); });
  $('size')?.addEventListener('input', render); colorInput?.addEventListener('input', (event) => { state.fg = event.target.value; });
  toolButtons.forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
  canvas.addEventListener('pointerdown', (event) => { const point = screenPoint(event); if (state.tool === 'brush' || state.tool === 'pencil' || state.tool === 'eraser') { state.drawing = true; state.last = point; canvas.setPointerCapture(event.pointerId); drawSegment(point, point, state.tool === 'eraser'); render(); } else if (state.tool === 'marquee') { state.drawing = true; state.last = point; state.selection = { x: point.x, y: point.y, w: 0, h: 0 }; canvas.setPointerCapture(event.pointerId); } else if (state.tool === 'move') { state.drawing = true; state.last = point; canvas.setPointerCapture(event.pointerId); } });
  canvas.addEventListener('pointermove', (event) => { const point = screenPoint(event); if (!state.drawing) return; if (state.tool === 'brush' || state.tool === 'pencil' || state.tool === 'eraser') { drawSegment(state.last, point, state.tool === 'eraser'); state.last = point; render(); } else if (state.tool === 'marquee') { state.selection = normaliseRect(state.last, point); drawSelection(); } else if (state.tool === 'move') { const layer = activeLayer(); if (layer && !layer.locked) { layer.x += point.x - state.last.x; layer.y += point.y - state.last.y; state.last = point; render(); } } });
  canvas.addEventListener('pointerup', () => { if (!state.drawing) return; if (state.tool === 'marquee') record('Selection'); else if (state.tool === 'move') record('Move layer'); else if (['brush','pencil','eraser'].includes(state.tool)) record(state.tool === 'eraser' ? 'Erase stroke' : 'Brush stroke'); state.drawing = false; state.last = null; render(); }); canvas.addEventListener('pointercancel', () => { state.drawing = false; state.last = null; });
  stage.addEventListener('dragover', (event) => event.preventDefault()); stage.addEventListener('drop', (event) => { event.preventDefault(); loadImage(event.dataTransfer.files?.[0]); });
  document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); } else if (event.key.toLowerCase() === 'b') setTool('brush'); else if (event.key.toLowerCase() === 'e') setTool('eraser'); else if (event.key.toLowerCase() === 'm') setTool('select'); else if (event.key === 'Delete' && state.selection) { const layer = activeLayer(); if (layer) { const x = layer.canvas.getContext('2d'); x.clearRect(state.selection.x - layer.x, state.selection.y - layer.y, state.selection.w, state.selection.h); record('Delete selection'); render(); } } });
  window.addEventListener('resize', fit);
  state.layers = [makeLayer('Background')]; state.selectedId = state.layers[0].id; record('New document'); render(); animateAnts();
})();
