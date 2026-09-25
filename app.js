const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const empty = $('empty');
const fileInput = $('file');
const status = $('status');
const viewButton = $('view');
const downloadButton = $('export');

const ids = ['exposure','brightness','contrast','highlights','shadows','temperature','tint','saturation','vibrance','hue','size','color'];
const controls = Object.fromEntries(ids.map((id) => [id, $(id)]));
const outputs = Object.fromEntries(ids.filter((id) => id !== 'color').map((id) => [id, $(`${id}Out`)]));

let source = null;
let previewSource = null;
let zoom = 1;
let renderFrame = 0;
let tool = 'select';
let drawing = false;
let strokes = [];
let texts = [];

function updateLabels() {
  Object.keys(outputs).forEach((id) => {
    outputs[id].textContent = id === 'hue' ? `${controls[id].value}°` : id === 'size' ? `${controls[id].value}px` : controls[id].value;
  });
}

function setLoaded(loaded) {
  empty.hidden = loaded;
  canvas.style.visibility = loaded ? 'visible' : 'hidden';
  viewButton.disabled = !loaded;
  downloadButton.disabled = !loaded;
}

function updateZoom() {
  $('zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
}

function fitImage() {
  if (!source) return;
  zoom = Math.min(1, Math.max(120, stage.clientWidth - 48) / source.width, Math.max(120, stage.clientHeight - 48) / source.height);
  zoom = Math.max(0.05, Number(zoom.toFixed(3)));
  updateZoom();
}

function clamp(value) { return Math.max(0, Math.min(255, value)); }

function processPixels(input, width, height) {
  const data = new Uint8ClampedArray(input);
  const exposure = Number(controls.exposure.value);
  const brightness = Number(controls.brightness.value);
  const contrast = Number(controls.contrast.value);
  const highlights = Number(controls.highlights.value);
  const shadows = Number(controls.shadows.value);
  const temperature = Number(controls.temperature.value);
  const tint = Number(controls.tint.value);
  const saturation = Number(controls.saturation.value);
  const vibrance = Number(controls.vibrance.value);
  const hue = Number(controls.hue.value) * Math.PI / 180;
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const exposureFactor = Math.pow(2, exposure / 100);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * exposureFactor;
    let g = data[i + 1] * exposureFactor;
    let b = data[i + 2] * exposureFactor;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const shadowWeight = Math.max(0, 1 - luminance / 128);
    const highlightWeight = Math.max(0, (luminance - 128) / 127);
    const tonal = brightness * 1.8 + shadows * shadowWeight * 1.5 + highlights * highlightWeight * 1.5;
    r += tonal; g += tonal; b += tonal;
    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    const average = (r + g + b) / 3;
    const minimum = Math.min(r, g, b);
    const maximum = Math.max(r, g, b);
    const colorfulness = (maximum - minimum) / 255;
    const amount = saturation / 100 + (vibrance / 100) * (1 - colorfulness);
    r = average + (r - average) * (1 + amount);
    g = average + (g - average) * (1 + amount);
    b = average + (b - average) * (1 + amount);

    const angle = hue;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rr = r * (0.213 + cos * 0.787 - sin * 0.213) + g * (0.715 - cos * 0.715 - sin * 0.715) + b * (0.072 - cos * 0.072 + sin * 0.928);
    const gg = r * (0.213 - cos * 0.213 + sin * 0.143) + g * (0.715 + cos * 0.285 + sin * 0.140) + b * (0.072 - cos * 0.072 - sin * 0.283);
    const bb = r * (0.213 - cos * 0.213 - sin * 0.787) + g * (0.715 - cos * 0.715 + sin * 0.715) + b * (0.072 + cos * 0.928 + sin * 0.072);
    data[i] = clamp(rr + temperature * 0.7 + tint * 0.2);
    data[i + 1] = clamp(gg - tint * 0.35);
    data[i + 2] = clamp(bb - temperature * 0.7 + tint * 0.2);
  }
  return data;
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
    stroke.points.forEach((point, index) => index ? targetCtx.lineTo(point.x, point.y) : targetCtx.moveTo(point.x, point.y));
    targetCtx.stroke();
  });
  texts.forEach((text) => {
    targetCtx.fillStyle = text.color;
    targetCtx.font = '32px system-ui';
    targetCtx.fillText(text.text, text.x, text.y);
  });
  targetCtx.restore();
}

function render(preview = true) {
  if (!source) { setLoaded(false); return; }
  const working = preview ? previewSource : source;
  const pixels = processPixels(working.data, working.width, working.height);
  const output = new ImageData(pixels, working.width, working.height);
  const processed = document.createElement('canvas');
  processed.width = working.width;
  processed.height = working.height;
  const processedCtx = processed.getContext('2d');
  processedCtx.putImageData(output, 0, 0);

  canvas.width = source.width;
  canvas.height = source.height;
  canvas.style.width = `${source.width * zoom}px`;
  canvas.style.height = `${source.height * zoom}px`;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(processed, 0, 0, canvas.width, canvas.height);
  drawOverlays(ctx);
  setLoaded(true);
}

function scheduleRender() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0;
    render(true);
  });
}

function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) { status.textContent = 'Please choose an image file.'; return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  status.textContent = 'Loading…';
  img.onload = () => {
    const full = document.createElement('canvas');
    full.width = img.naturalWidth; full.height = img.naturalHeight;
    const fullCtx = full.getContext('2d');
    fullCtx.drawImage(img, 0, 0);
    source = { width: full.width, height: full.height, data: fullCtx.getImageData(0, 0, full.width, full.height).data };
    const scale = Math.min(1, 1200 / source.width, 900 / source.height);
    const preview = document.createElement('canvas');
    preview.width = Math.max(1, Math.round(source.width * scale));
    preview.height = Math.max(1, Math.round(source.height * scale));
    preview.getContext('2d').drawImage(img, 0, 0, preview.width, preview.height);
    previewSource = { width: preview.width, height: preview.height, data: preview.getContext('2d').getImageData(0, 0, preview.width, preview.height).data };
    strokes = []; texts = []; fitImage(); status.textContent = `Loaded ${file.name}`; render(true); URL.revokeObjectURL(url);
  };
  img.onerror = () => { status.textContent = 'Could not read image'; URL.revokeObjectURL(url); };
  img.src = url;
}

function point(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; }
function downloadPng() { if (!source) return; render(false); canvas.toBlob((blob) => { if (!blob) return; const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'pixelforge-edited.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); status.textContent = 'PNG download started'; render(true); }, 'image/png'); }

$('open').onclick = () => fileInput.click();
fileInput.onchange = (event) => { loadImage(event.target.files && event.target.files[0]); fileInput.value = ''; };
viewButton.onclick = () => { if (!source) return; render(false); window.open(canvas.toDataURL('image/png'), '_blank', 'noopener,noreferrer'); render(true); };
downloadButton.onclick = downloadPng;
stage.ondragover = (event) => { event.preventDefault(); stage.classList.add('dragging'); };
stage.ondragleave = () => stage.classList.remove('dragging');
stage.ondrop = (event) => { event.preventDefault(); stage.classList.remove('dragging'); loadImage(event.dataTransfer && event.dataTransfer.files[0]); };
ids.forEach((id) => { if (controls[id]) controls[id].oninput = () => { updateLabels(); scheduleRender(); }; });
document.querySelectorAll('.tool').forEach((button) => button.onclick = () => { tool = button.dataset.tool; document.querySelectorAll('.tool').forEach((item) => item.classList.toggle('active', item === button)); });
canvas.onpointerdown = (event) => { if (!source) return; const p = point(event); if (tool === 'brush') { drawing = true; canvas.setPointerCapture?.(event.pointerId); strokes.push({ color: controls.color.value, size: Number(controls.size.value), points: [p] }); scheduleRender(); } else if (tool === 'text') { const text = prompt('Text to add:'); if (text) { texts.push({ text, x: p.x, y: p.y, color: controls.color.value }); scheduleRender(); } } };
canvas.onpointermove = (event) => { if (drawing) { strokes[strokes.length - 1].points.push(point(event)); scheduleRender(); } };
canvas.onpointerup = () => { drawing = false; };
canvas.onpointercancel = () => { drawing = false; };
$('zoomIn').onclick = () => { zoom = Math.min(4, Number((zoom + .25).toFixed(2))); updateZoom(); scheduleRender(); };
$('zoomOut').onclick = () => { zoom = Math.max(.05, Number((zoom - .25).toFixed(2))); updateZoom(); scheduleRender(); };
$('fit').onclick = () => { fitImage(); scheduleRender(); };
$('reset').onclick = () => { ['exposure','brightness','contrast','highlights','shadows','temperature','tint','saturation','vibrance','hue'].forEach((id) => controls[id].value = 0); controls.size.value = 12; strokes = []; texts = []; fitImage(); updateLabels(); scheduleRender(); };
window.onresize = () => { if (source && zoom < 1) { fitImage(); scheduleRender(); } };
updateLabels(); updateZoom(); setLoaded(false);
