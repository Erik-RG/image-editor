const $ = (id) => document.getElementById(id);

const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const empty = $('empty');
const file = $('file');
const status = $('status');
const view = $('view');
const download = $('export');
const sizeInput = $('size');
const strengthInput = $('strength');
const sizeOut = $('sizeOut');
const strengthOut = $('strengthOut');
const layerList = $('layersList');
const zoomLabel = $('zoomLabel');
const optionButtons = [...document.querySelectorAll('.option-button')];
const addLayerButton = $('addLayer');

const ids = [
  'exposure', 'brightness', 'contrast', 'highlights', 'shadows',
  'temperature', 'tint', 'saturation', 'vibrance', 'hue'
];

const controls = Object.fromEntries(ids.map((id) => [id, $(id)]));
const outputs = Object.fromEntries(ids.map((id) => [id, $(`${id}Out`)]));
const layerDefinitions = [
  { id: 'base', name: 'Background', type: 'image', visible: true, active: false },
  { id: 'filter-layer', name: 'Filter layer', type: 'filter', visible: true, active: true }
];

let source = null;
let zoom = 1;
let queued = 0;
let drawing = false;
let currentMode = 'whole';
let strokePoints = [];
let layerCounter = 1;

function labels() {
  ids.forEach((id) => {
    outputs[id].textContent = id === 'hue' ? `${controls[id].value}°` : controls[id].value;
  });

  sizeOut.textContent = `${sizeInput.value}px`;
  strengthOut.textContent = `${strengthInput.value}%`;
}

function loaded(on) {
  empty.hidden = on;
  canvas.style.visibility = on ? 'visible' : 'hidden';
  view.disabled = !on;
  download.disabled = !on;
}

function updateZoom() {
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function fit() {
  if (!source) return;
  zoom = Math.max(
    0.05,
    Math.min(
      1,
      (stage.clientWidth - 48) / source.width,
      (stage.clientHeight - 48) / source.height
    )
  );
  updateZoom();
  render(true);
}

function schedule() {
  if (queued) return;
  queued = requestAnimationFrame(() => {
    queued = 0;
    render(true);
  });
}

function clamp(v) {
  return Math.max(0, Math.min(255, v));
}

function process(raw, filter = false) {
  const d = new Uint8ClampedArray(raw);

  const ex = 2 ** ((Number(controls.exposure.value) + (filter ? 22 : 0)) / 100);
  const br = Number(controls.brightness.value) + (filter ? 10 : 0);
  const co = Number(controls.contrast.value) + (filter ? 15 : 0);
  const cf = (259 * (co + 255)) / (255 * (259 - co));
  const hi = Number(controls.highlights.value);
  const sh = Number(controls.shadows.value);
  const temp = Number(controls.temperature.value);
  const tint = Number(controls.tint.value);
  const sat = Number(controls.saturation.value) / 100 + (filter ? 0.15 : 0);
  const vib = Number(controls.vibrance.value) / 100;
  const hue = Number(controls.hue.value) * Math.PI / 180;
  const cos = Math.cos(hue);
  const sin = Math.sin(hue);

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    r = clamp((r * ex) + br);
    g = clamp((g * ex) + br);
    b = clamp((b * ex) + br);

    r = clamp(cf * (r - 128) + 128);
    g = clamp(cf * (g - 128) + 128);
    b = clamp(cf * (b - 128) + 128);

    const lum = (r + g + b) / 3;
    const highlightBoost = hi / 100;
    const shadowBoost = sh / 100;

    const lift = lum < 128 ? shadowBoost * (128 - lum) : highlightBoost * (lum - 128);
    r = clamp(r + lift * 2.5);
    g = clamp(g + lift * 2.5);
    b = clamp(b + lift * 2.5);

    r = clamp(r + temp * 0.7);
    g = clamp(g + temp * 0.2);
    b = clamp(b - temp * 0.5 + tint * 0.3);

    const avg = (r + g + b) / 3;
    const satFactor = 1 + sat + (vib * (1 - Math.abs(avg - 128) / 128));

    r = clamp(avg + (r - avg) * satFactor);
    g = clamp(avg + (g - avg) * satFactor);
    b = clamp(avg + (b - avg) * satFactor);

    const rr = r * cos + g * sin * 0.7;
    const gg = g * cos - r * sin * 0.7;
    const bb = b * cos + (1 - Math.abs(sin)) * 25;

    d[i] = clamp(rr);
    d[i + 1] = clamp(gg);
    d[i + 2] = clamp(bb);
  }

  return d;
}

function drawInkStroke(points, radius) {
  if (!points.length) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = radius;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.shadowColor = 'rgba(255,255,255,0.7)';
  ctx.shadowBlur = radius * 1.2;

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, radius * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.stroke();
  ctx.restore();
}

function drawMaskStroke(points, radius) {
  if (!points.length) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = radius * 1.5;
  ctx.strokeStyle = 'rgba(125, 130, 255, 0.6)';
  ctx.shadowColor = 'rgba(125, 130, 255, 0.9)';
  ctx.shadowBlur = 18;

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();
  ctx.restore();
}

function point(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * canvas.width / rect.width,
    y: (e.clientY - rect.top) * canvas.height / rect.height
  };
}

function render(previewMode) {
  if (!source) {
    loaded(false);
    return;
  }

  const processed = new ImageData(process(source.data, true), source.width, source.height);

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = source.width;
  baseCanvas.height = source.height;

  const baseCtx = baseCanvas.getContext('2d');
  baseCtx.putImageData(processed, 0, 0);

  canvas.width = source.width;
  canvas.height = source.height;
  canvas.style.width = `${source.width * zoom}px`;
  canvas.style.height = `${source.height * zoom}px`;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseCanvas, 0, 0, canvas.width, canvas.height);

  if (currentMode === 'brush' && strokePoints.length) {
    drawInkStroke(strokePoints, Number(sizeInput.value));
  }

  if (currentMode === 'mask' && strokePoints.length) {
    drawMaskStroke(strokePoints, Number(sizeInput.value));
  }

  loaded(true);
}

function loadImage(fileObj) {
  if (!fileObj || !fileObj.type.startsWith('image/')) {
    status.textContent = 'Please choose an image file.';
    return;
  }

  const url = URL.createObjectURL(fileObj);
  const img = new Image();
  status.textContent = 'Loading…';

  img.onload = () => {
    const temp = document.createElement('canvas');
    temp.width = img.naturalWidth;
    temp.height = img.naturalHeight;
    const tempCtx = temp.getContext('2d');
    tempCtx.drawImage(img, 0, 0);

    source = {
      width: temp.width,
      height: temp.height,
      data: tempCtx.getImageData(0, 0, temp.width, temp.height).data
    };

    fit();
    status.textContent = `Loaded: ${fileObj.name}`;
    URL.revokeObjectURL(url);
  };

  img.onerror = () => {
    status.textContent = 'The image could not be loaded.';
    URL.revokeObjectURL(url);
  };

  img.src = url;
}

function exportPNG() {
  if (!source) return;
  render(false);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pixelforge-edited.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

function renderLayerList() {
  layerList.innerHTML = layerDefinitions.map((layer, index) => {
    const activeClass = layer.active ? 'active' : '';
    const hiddenClass = layer.visible ? '' : 'hidden';
    const swatch = layer.type === 'mask' ? 'mask' : 'filter';

    return `
      <li class="layer-item ${activeClass} ${hiddenClass}" data-index="${index}">
        <span class="layer-swatch ${swatch}"></span>
        <span class="layer-name">${layer.name}</span>
        <button class="layer-toggle" type="button" data-toggle="${index}">
          ${layer.visible ? '◉' : '○'}
        </button>
      </li>
    `;
  }).join('');

  layerList.querySelectorAll('.layer-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      if (event.target.matches('.layer-toggle')) return;

      const index = Number(item.dataset.index);
      layerDefinitions.forEach((layer, layerIndex) => {
        layer.active = layerIndex === index;
      });

      renderLayerList();
      status.textContent = `${layerDefinitions[index].name} selected`;
    });
  });

  layerList.querySelectorAll('.layer-toggle').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const index = Number(button.dataset.toggle);
      layerDefinitions[index].visible = !layerDefinitions[index].visible;
      renderLayerList();
    });
  });
}

function addLayer() {
  layerCounter += 1;
  const type = layerCounter % 2 === 0 ? 'filter' : 'mask';
  const name = type === 'mask' ? `Mask ${layerCounter}` : `Filter ${layerCounter}`;

  layerDefinitions.push({
    id: `layer-${layerCounter}`,
    name,
    type,
    visible: true,
    active: false
  });

  layerDefinitions.forEach((layer) => {
    layer.active = false;
  });

  layerDefinitions[layerDefinitions.length - 1].active = true;
  renderLayerList();
  status.textContent = `${name} added`;
}

function setToolMode(mode) {
  currentMode = mode;

  optionButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.target === mode);
  });

  const messages = {
    whole: 'Whole image mode: apply adjustments across the full image.',
    brush: 'Brush mode: paint a soft round ink effect.',
    mask: 'Mask mode: paint a masking stroke for local control.'
  };

  status.textContent = messages[mode] || 'Ready';
}

$('open').onclick = () => file.click();
file.onchange = (e) => {
  loadImage(e.target.files?.[0]);
  e.target.value = '';
};

download.onclick = exportPNG;
view.onclick = () => {
  render(false);
  window.open(canvas.toDataURL('image/png'), '_blank');
};

$('zoomIn').onclick = () => {
  zoom = Math.min(4, zoom + 0.25);
  updateZoom();
  render(true);
};

$('zoomOut').onclick = () => {
  zoom = Math.max(0.25, zoom - 0.25);
  updateZoom();
  render(true);
};

$('fit').onclick = () => {
  fit();
};

$('reset').onclick = () => {
  ids.forEach((id) => {
    controls[id].value = 0;
  });

  sizeInput.value = 12;
  strengthInput.value = 80;
  labels();
  strokePoints = [];
  render(true);
};

optionButtons.forEach((button) => {
  button.addEventListener('click', () => setToolMode(button.dataset.target));
});

ids.forEach((id) => {
  controls[id].oninput = () => {
    labels();
    schedule();
  };
});

sizeInput.oninput = () => {
  labels();
  schedule();
};

strengthInput.oninput = () => {
  labels();
  schedule();
};

stage.ondragover = (e) => {
  e.preventDefault();
  stage.classList.add('dragging');
};

stage.ondragleave = () => {
  stage.classList.remove('dragging');
};

stage.ondrop = (e) => {
  e.preventDefault();
  stage.classList.remove('dragging');
  if (e.dataTransfer?.files?.[0]) {
    loadImage(e.dataTransfer.files[0]);
  }
};

canvas.onpointerdown = (e) => {
  if (!source) return;

  drawing = true;
  strokePoints = [point(e)];
  canvas.setPointerCapture?.(e.pointerId);
  render(true);
};

canvas.onpointermove = (e) => {
  if (!drawing || !source) return;
  strokePoints.push(point(e));
  render(true);
};

canvas.onpointerup = () => {
  drawing = false;
};

canvas.onpointercancel = () => {
  drawing = false;
};

window.onresize = () => {
  if (source) fit();
};

addLayerButton.onclick = addLayer;
labels();
renderLayerList();
updateZoom();
setToolMode('whole');
loaded(false);

if (source) {
  render(true);
}
