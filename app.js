const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const stage = $('stage');
const empty = $('empty');
const fileInput = $('file');
const status = $('status');
const viewButton = $('view');
const downloadButton = $('export');

const customControls = {};
const controlOrder = ['exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'temperature', 'tint', 'saturation', 'vibrance', 'hue'];

let source = null;
let previewSource = null;
let zoom = 1;
let renderQueued = false;
let tool = 'select';
let drawing = false;
let strokes = [];
let texts = [];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateZoomLabel() {
  $('zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
}

function setLoaded(loaded) {
  empty.hidden = loaded;
  canvas.style.visibility = loaded ? 'visible' : 'hidden';
  viewButton.disabled = !loaded;
  downloadButton.disabled = !loaded;
}

function getControlValue(id) {
  return Number(customControls[id].value);
}

function setControlValue(id, rawValue) {
  const control = customControls[id];
  const min = control.min;
  const max = control.max;
  const value = clamp(rawValue, min, max);
  control.value = value;
  const progress = ((value - min) / (max - min || 1)) * 100;
  control.fill.style.width = `${progress}%`;
  control.thumb.style.left = `${progress}%`;
  control.output.textContent = `${value}${id === 'hue' ? '°' : ''}`;
}

function makeCustomControls() {
  document.querySelectorAll('.adjust').forEach((el) => {
    const id = el.dataset.id;
    const min = Number(el.dataset.min);
    const max = Number(el.dataset.max);
    const initial = Number(el.dataset.value);

    const head = document.createElement('div');
    head.className = 'adjust-head';
    const label = document.createElement('span');
    label.textContent = el.dataset.label;
    const output = document.createElement('output');
    output.className = 'adjust-value';
    output.textContent = `${initial}${id === 'hue' ? '°' : ''}`;
    head.append(label, output);

    const track = document.createElement('div');
    track.className = 'adjust-track';
    track.tabIndex = 0;

    const fill = document.createElement('span');
    fill.className = 'adjust-fill';

    const thumb = document.createElement('span');
    thumb.className = 'adjust-thumb';

    track.append(fill, thumb);
    el.innerHTML = '';
    el.append(head, track);

    customControls[id] = {
      el,
      min,
      max,
      value: initial,
      output,
      track,
      fill,
      thumb,
      label
    };

    const updateFromPointer = (clientX) => {
      const rect = track.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const nextValue = min + ratio * (max - min);
      setControlValue(id, nextValue);
      queueRender();
    };

    track.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      track.setPointerCapture(event.pointerId);
      updateFromPointer(event.clientX);
    });

    track.addEventListener('pointermove', (event) => {
      if (track.hasPointerCapture(event.pointerId)) {
        updateFromPointer(event.clientX);
      }
    });

    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        setControlValue(id, getControlValue(id) - 1);
        queueRender();
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        setControlValue(id, getControlValue(id) + 1);
        queueRender();
      }
    });

    setControlValue(id, initial);
  });
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render(true);
  });
}

function fitImage() {
  if (!source) return;
  const maxW = Math.max(120, stage.clientWidth - 48);
  const maxH = Math.max(120, stage.clientHeight - 48);
  zoom = Math.min(1, maxW / source.width, maxH / source.height);
  zoom = Number(zoom.toFixed(3));
  updateZoomLabel();
}

function processPixels(raw, width, height) {
  const pixels = new Uint8ClampedArray(raw);
  const exposure = getControlValue('exposure');
  const brightness = getControlValue('brightness');
  const contrast = getControlValue('contrast');
  const highlights = getControlValue('highlights');
  const shadows = getControlValue('shadows');
  const temperature = getControlValue('temperature');
  const tint = getControlValue('tint');
  const saturation = getControlValue('saturation');
  const vibrance = getControlValue('vibrance');
  const hue = getControlValue('hue') * Math.PI / 180;
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const exposureFactor = Math.pow(2, exposure / 100);

  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i] * exposureFactor;
    let g = pixels[i + 1] * exposureFactor;
    let b = pixels[i + 2] * exposureFactor;

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const shadowWeight = Math.max(0, 1 - luminance / 128);
    const highlightWeight = Math.max(0, (luminance - 128) / 127);
    const tonalOffset = brightness * 1.8 + shadows * shadowWeight * 1.5 + highlights * highlightWeight * 1.5;

    r += tonalOffset;
    g += tonalOffset;
    b += tonalOffset;

    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    const avg = (r + g + b) / 3;
    const minRGB = Math.min(r, g, b);
    const maxRGB = Math.max(r, g, b);
    const colorfulness = (maxRGB - minRGB) / 255;
    const amount = saturation / 100 + (vibrance / 100) * (1 - colorfulness);

    r = avg + (r - avg) * (1 + amount);
    g = avg + (g - avg) * (1 + amount);
    b = avg + (b - avg) * (1 + amount);

    const c = Math.cos(hue);
    const s = Math.sin(hue);
    const rr = r * (0.213 + c * 0.787 - s * 0.213) + g * (0.715 - c * 0.715 - s * 0.715) + b * (0.072 - c * 0.072 + s * 0.928);
    const gg = r * (0.213 - c * 0.213 + s * 0.143) + g * (0.715 + c * 0.285 + s * 0.140) + b * (0.072 - c * 0.072 - s * 0.283);
    const bb = r * (0.213 - c * 0.213 - s * 0.787) + g * (0.715 - c * 0.715 + s * 0.715) + b * (0.072 + c * 0.928 + s * 0.072);

    pixels[i] = clamp(rr + temperature * 0.7 + tint * 0.2, 0, 255);
    pixels[i + 1] = clamp(gg - tint * 0.35, 0, 255);
    pixels[i + 2] = clamp(bb - temperature * 0.7 + tint * 0.2, 0, 255);
  }

  return pixels;
}

function drawOverlays(targetCtx) {
  targetCtx.save();
  strokes.forEach((stroke) => {
    if (!stroke.points.length) return;
    targetCtx.strokeStyle = stroke.color;
    targetCtx.lineWidth = stroke.size;
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.beginPath();
    stroke.points.forEach((point, index) => {
      if (index === 0) targetCtx.moveTo(point.x, point.y);
      else targetCtx.lineTo(point.x, point.y);
    });
    targetCtx.stroke();
  });
  texts.forEach((item) => {
    targetCtx.fillStyle = item.color;
    targetCtx.font = '32px system-ui';
    targetCtx.fillText(item.text, item.x, item.y);
  });
  targetCtx.restore();
}

function render(isPreview) {
  if (!source) {
    setLoaded(false);
    return;
  }

  const working = isPreview ? previewSource : source;
  const out = processPixels(working.data.slice(), working.width, working.height);
  const imageData = new ImageData(out, working.width, working.height);

  const temp = document.createElement('canvas');
  temp.width = working.width;
  temp.height = working.height;
  const tempCtx = temp.getContext('2d');
  tempCtx.putImageData(imageData, 0, 0);

  canvas.width = source.width;
  canvas.height = source.height;
  canvas.style.width = `${source.width * zoom}px`;
  canvas.style.height = `${source.height * zoom}px`;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(temp, 0, 0, canvas.width, canvas.height);
  drawOverlays(ctx);
  setLoaded(true);
}

function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    status.textContent = 'Please choose an image file.';
    return;
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  status.textContent = 'Loading…';

  img.onload = () => {
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = img.naturalWidth;
    fullCanvas.height = img.naturalHeight;
    const fullCtx = fullCanvas.getContext('2d');
    fullCtx.drawImage(img, 0, 0);
    const fullImage = fullCtx.getImageData(0, 0, fullCanvas.width, fullCanvas.height);

    source = { width: fullCanvas.width, height: fullCanvas.height, data: fullImage.data.slice() };

    const scale = Math.min(1, 1200 / source.width, 900 / source.height);
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = Math.max(1, Math.round(source.width * scale));
    previewCanvas.height = Math.max(1, Math.round(source.height * scale));
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);
    const previewImage = previewCtx.getImageData(0, 0, previewCanvas.width, previewCanvas.height);
    previewSource = { width: previewCanvas.width, height: previewCanvas.height, data: previewImage.data.slice() };

    strokes = [];
    texts = [];
    fitImage();
    status.textContent = `Loaded: ${file.name}`;
    render(true);
    URL.revokeObjectURL(url);
  };

  img.onerror = () => {
    status.textContent = 'The image could not be loaded.';
    URL.revokeObjectURL(url);
  };

  img.src = url;
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height
  };
}

function exportPNG() {
  if (!source) return;
  render(false);
  canvas.toBlob((blob) => {
    if (!blob) {
      status.textContent = 'PNG export failed.';
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pixelforge-edited.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'PNG download started';
    render(true);
  }, 'image/png');
}

function viewCurrent() {
  if (!source) return;
  render(false);
  window.open(canvas.toDataURL('image/png'), '_blank', 'noopener,noreferrer');
  render(true);
}

$('open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  loadImage(file);
  fileInput.value = '';
});

$('zoomIn').addEventListener('click', () => {
  zoom = Math.min(4, Number((zoom + 0.25).toFixed(2)));
  updateZoomLabel();
  render(true);
});

$('zoomOut').addEventListener('click', () => {
  zoom = Math.max(0.05, Number((zoom - 0.25).toFixed(2)));
  updateZoomLabel();
  render(true);
});

$('fit').addEventListener('click', () => {
  fitImage();
  render(true);
});

$('reset').addEventListener('click', () => {
  controlOrder.forEach((id) => setControlValue(id, 0));
  $('size').value = 12;
  strokes = [];
  texts = [];
  if (source) fitImage();
  render(true);
});

viewButton.addEventListener('click', viewCurrent);
downloadButton.addEventListener('click', exportPNG);

stage.addEventListener('dragover', (event) => {
  event.preventDefault();
  stage.classList.add('dragging');
});

stage.addEventListener('dragleave', () => {
  stage.classList.remove('dragging');
});

stage.addEventListener('drop', (event) => {
  event.preventDefault();
  stage.classList.remove('dragging');
  const file = event.dataTransfer && event.dataTransfer.files[0];
  loadImage(file);
});

canvas.addEventListener('pointerdown', (event) => {
  if (!source) return;
  const point = getCanvasPoint(event);

  if (tool === 'brush') {
    drawing = true;
    canvas.setPointerCapture?.(event.pointerId);
    strokes.push({
      color: $('color').value,
      size: Number($('size').value),
      points: [point]
    });
    render(true);
    return;
  }

  if (tool === 'text') {
    const text = window.prompt('Add text:', 'Your text');
    if (!text) return;
    texts.push({ text, x: point.x, y: point.y, color: $('color').value });
    render(true);
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (!drawing) return;
  const point = getCanvasPoint(event);
  const newestStroke = strokes[strokes.length - 1];
  if (newestStroke) {
    newestStroke.points.push(point);
    render(true);
  }
});

canvas.addEventListener('pointerup', () => {
  drawing = false;
});

canvas.addEventListener('pointercancel', () => {
  drawing = false;
});

canvas.addEventListener('dblclick', () => {
  if (!source) return;
  zoom = zoom === 1 ? 2 : 1;
  updateZoomLabel();
  render(true);
});

document.querySelectorAll('.tool').forEach((button) => {
  button.addEventListener('click', () => {
    tool = button.dataset.tool;
    document.querySelectorAll('.tool').forEach((node) => node.classList.toggle('active', node === button));
  });
});

window.addEventListener('resize', () => {
  if (source && zoom < 1) {
    fitImage();
    render(true);
  }
});

makeCustomControls();
updateZoomLabel();
setLoaded(false);
render(true);
