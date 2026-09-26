(() => {
  const editorCanvas = document.querySelector('#editorCanvas');
  const overlayCanvas = document.querySelector('#overlayCanvas');
  const status = document.querySelector('#status');
  const pointerInfo = document.querySelector('#pointerInfo');
  const layerInfo = document.querySelector('#layerInfo');
  const toolName = document.querySelector('#toolName');
  const toolOptions = document.querySelector('#toolOptions');
  const fileInput = document.querySelector('#fileInput');
  const openBtn = document.querySelector('#openBtn');
  const saveBtn = document.querySelector('#saveBtn');
  const fgColor = document.querySelector('#fgColor');
  const bgColor = document.querySelector('#bgColor');
  const toolButtons = [...document.querySelectorAll('.tool')];

  if (!editorCanvas || !overlayCanvas) return;

  const ctx = editorCanvas.getContext('2d');
  const overlayCtx = overlayCanvas.getContext('2d');

  const state = {
    width: 900,
    height: 600,
    tool: 'move',
    fg: fgColor?.value || '#111111',
    bg: bgColor?.value || '#ffffff',
    selection: null,
    drawing: false,
    lastPoint: null,
    layers: []
  };

  const makeLayer = (name = 'Layer') => {
    const canvas = document.createElement('canvas');
    canvas.width = state.width;
    canvas.height = state.height;
    const layer = { id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), name, visible: true, locked: false, canvas };
    const c = canvas.getContext('2d');
    c.fillStyle = state.bg;
    c.fillRect(0, 0, canvas.width, canvas.height);
    return layer;
  };

  const getLayer = () => state.layers[0] || null;

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  const setToolName = (tool) => {
    if (toolName) {
      const labels = {
        move: 'Move Tool',
        marquee: 'Marquee Tool',
        lasso: 'Lasso Tool',
        wand: 'Magic Wand',
        crop: 'Crop Tool',
        eyedropper: 'Eyedropper',
        brush: 'Brush Tool',
        eraser: 'Eraser',
        bucket: 'Bucket Fill',
        text: 'Text Tool',
        zoom: 'Zoom Tool',
        hand: 'Hand Tool',
        rotate: 'Rotate Tool'
      };
      toolName.textContent = labels[tool] || 'Tool';
    }
    if (toolOptions) {
      toolOptions.innerHTML = '';
    }
  };

  const setTool = (tool) => {
    state.tool = tool;
    toolButtons.forEach((button) => {
      const active = button.dataset.tool === tool;
      button.classList.toggle('active', active);
    });
    setToolName(tool);
    setStatus(`${tool.charAt(0).toUpperCase() + tool.slice(1)} selected`);
  };

  const updateLayerInfo = () => {
    const layer = getLayer();
    if (layerInfo) layerInfo.textContent = layer ? `Layer: ${layer.name}` : 'Layer: —';
  };

  const resizeCanvas = () => {
    const width = state.width || 900;
    const height = state.height || 600;
    editorCanvas.width = width;
    editorCanvas.height = height;
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    editorCanvas.style.width = `${width}px`;
    editorCanvas.style.height = `${height}px`;
    overlayCanvas.style.width = `${width}px`;
    overlayCanvas.style.height = `${height}px`;
  };

  const drawBackground = () => {
    ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    ctx.fillStyle = '#f5f7fb';
    ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);
    const layer = getLayer();
    if (layer) {
      ctx.drawImage(layer.canvas, 0, 0);
    }
  };

  const drawSelection = () => {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!state.selection) return;

    const { x, y, w, h } = state.selection;
    overlayCtx.save();
    overlayCtx.setLineDash([6, 4]);
    overlayCtx.lineWidth = 1;
    overlayCtx.strokeStyle = '#ffffff';
    overlayCtx.strokeRect(x + 0.5, y + 0.5, w, h);
    overlayCtx.setLineDash([2, 6]);
    overlayCtx.strokeStyle = '#111111';
    overlayCtx.strokeRect(x + 0.5, y + 0.5, w, h);
    overlayCtx.restore();
  };

  const render = () => {
    resizeCanvas();
    drawBackground();
    drawSelection();
    updateLayerInfo();
  };

  const pointFromEvent = (event) => {
    const rect = editorCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * editorCanvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * editorCanvas.height;
    return { x, y };
  };

  const applyBrushStroke = (from, to) => {
    const layer = getLayer();
    if (!layer || layer.locked) return;

    const layerCtx = layer.canvas.getContext('2d');
    layerCtx.save();
    layerCtx.lineCap = 'round';
    layerCtx.lineJoin = 'round';
    layerCtx.lineWidth = 8;
    layerCtx.strokeStyle = state.fg;
    layerCtx.beginPath();
    layerCtx.moveTo(from.x, from.y);
    layerCtx.lineTo(to.x, to.y);
    layerCtx.stroke();
    layerCtx.restore();
  };

  const handlePointerDown = (event) => {
    const point = pointFromEvent(event);
    state.drawing = true;
    state.lastPoint = point;

    if (state.tool === 'brush' || state.tool === 'eraser' || state.tool === 'move') {
      if (state.tool === 'eraser') {
        const layer = getLayer();
        if (!layer || layer.locked) return;
        const layerCtx = layer.canvas.getContext('2d');
        layerCtx.save();
        layerCtx.globalCompositeOperation = 'destination-out';
        layerCtx.beginPath();
        layerCtx.arc(point.x, point.y, 12, 0, Math.PI * 2);
        layerCtx.fill();
        layerCtx.restore();
      } else if (state.tool === 'move') {
        state.selection = { x: point.x, y: point.y, w: 0, h: 0 };
      }
      render();
      return;
    }

    if (state.tool === 'marquee') {
      state.selection = { x: point.x, y: point.y, w: 0, h: 0 };
      render();
    }
  };

  const handlePointerMove = (event) => {
    const point = pointFromEvent(event);
    if (pointerInfo) {
      pointerInfo.textContent = `x: ${Math.round(point.x)} y: ${Math.round(point.y)}`;
    }

    if (!state.drawing || !state.lastPoint) return;

    if (state.tool === 'brush') {
      applyBrushStroke(state.lastPoint, point);
      state.lastPoint = point;
      render();
      return;
    }

    if (state.tool === 'marquee' && state.selection) {
      const start = state.selection;
      state.selection = {
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        w: Math.abs(point.x - start.x),
        h: Math.abs(point.y - start.y)
      };
      render();
    }
  };

  const handlePointerUp = () => {
    if (!state.drawing) return;
    state.drawing = false;
    state.lastPoint = null;
    if (state.tool === 'marquee' && state.selection && (state.selection.w < 2 || state.selection.h < 2)) {
      state.selection = null;
    }
    render();
  };

  const loadImage = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setStatus('Please choose an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const layer = makeLayer(file.name || 'Imported image');
        const layerCtx = layer.canvas.getContext('2d');
        layer.canvas.width = image.naturalWidth;
        layer.canvas.height = image.naturalHeight;
        layerCtx.drawImage(image, 0, 0);
        state.width = layer.canvas.width;
        state.height = layer.canvas.height;
        state.layers = [layer];
        render();
        setStatus('Image loaded');
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const exportImage = () => {
    const link = document.createElement('a');
    link.download = 'pixelforge-export.png';
    link.href = editorCanvas.toDataURL('image/png');
    link.click();
    setStatus('Exported PNG');
  };

  openBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) loadImage(file);
    event.target.value = '';
  });
  saveBtn?.addEventListener('click', exportImage);

  fgColor?.addEventListener('input', (event) => {
    state.fg = event.target.value;
  });
  bgColor?.addEventListener('input', (event) => {
    state.bg = event.target.value;
  });

  toolButtons.forEach((button) => {
    button.addEventListener('click', () => setTool(button.dataset.tool));
  });

  editorCanvas.addEventListener('pointerdown', handlePointerDown);
  editorCanvas.addEventListener('pointermove', handlePointerMove);
  editorCanvas.addEventListener('pointerup', handlePointerUp);
  editorCanvas.addEventListener('pointerleave', handlePointerUp);

  state.layers = [makeLayer('Background')];
  render();
  setTool('move');
  setStatus('Ready');
})();
