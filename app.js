const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const empty = $('empty');
const fileInput = $('file');
const status = $('status');
const viewButton = $('view');
const downloadButton = $('export');
const controlIds = ['exposure','brightness','contrast','highlights','shadows','temperature','tint','saturation','vibrance','hue'];
const controls = Object.fromEntries(controlIds.map((id) => [id, $(id)]));
const outputs = Object.fromEntries([...controlIds, 'size'].map((id) => [id, $(`${id}Out`)]));
let source = null;
let previewSource = null;
let zoom = 1;
let renderQueued = false;
let drawing = false;
let tool = 'select';
let strokes = [];
let texts = [];

const outputStyle = document.createElement('style');
outputStyle.textContent = '.adjustment-output{float:none!important;display:inline-block;margin-left:.45rem;min-width:3em;text-align:left}.editor-toolbar output{float:none!important}';
document.head.appendChild(outputStyle);
Object.values(outputs).forEach((output) => output && output.classList.add('adjustment-output'));

function num(id) { return Number(controls[id].value); }
function clamp(value) { return Math.max(0, Math.min(255, value)); }
function updateLabels() {
  controlIds.forEach((id) => { if (outputs[id]) outputs[id].textContent = id === 'hue' ? `${controls[id].value}°` : controls[id].value; });
  outputs.size.textContent = `${$('size').value}px`;
}
function setLoaded(loaded) {
  empty.hidden = loaded;
  canvas.style.visibility = loaded ? 'visible' : 'hidden';
  viewButton.disabled = !loaded;
  downloadButton.disabled = !loaded;
}
function updateZoom() { $('zoomLabel').textContent = `${Math.round(zoom * 100)}%`; }
function fitImage() {
  if (!source) return;
  zoom = Math.max(.05, Math.min(1, (stage.clientWidth - 48) / source.width, (stage.clientHeight - 48) / source.height));
  updateZoom();
}
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(true); });
}
function processPixels(raw) {
  const pixels = new Uint8ClampedArray(raw);
  const exposure = 2 ** (num('exposure') / 100);
  const brightness = num('brightness') * 1.8;
  const contrast = (259 * (num('contrast') + 255)) / (255 * (259 - num('contrast')));
  const highlights = num('highlights');
  const shadows = num('shadows');
  const temperature = num('temperature');
  const tint = num('tint');
  const saturation = num('saturation') / 100;
  const vibrance = num('vibrance') / 100;
  const hue = num('hue') * Math.PI / 180;
  const cos = Math.cos(hue), sin = Math.sin(hue);
  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i] * exposure, g = pixels[i + 1] * exposure, b = pixels[i + 2] * exposure;
    const lum = .2126 * r + .7152 * g + .0722 * b;
    const shadowsWeight = Math.max(0, 1 - lum / 128);
    const highlightsWeight = Math.max(0, (lum - 128) / 127);
    const offset = brightness + shadows * shadowsWeight * 1.5 + highlights * highlightsWeight * 1.5;
    r = contrast * (r + offset - 128) + 128;
    g = contrast * (g + offset - 128) + 128;
    b = contrast * (b + offset - 128) + 128;
    const average = (r + g + b) / 3;
    const range = Math.max(r, g, b) - Math.min(r, g, b);
    const amount = saturation + vibrance * (1 - range / 255);
    r = average + (r - average) * (1 + amount);
    g = average + (g - average) * (1 + amount);
    b = average + (b - average) * (1 + amount);
    pixels[i] = clamp(r * (.213 + cos * .787 - sin * .213) + g * (.715 - cos * .715 - sin * .715) + b * (.072 - cos * .072 + sin * .928) + temperature * .7 + tint * .2);
    pixels[i + 1] = clamp(r * (.213 - cos * .213 + sin * .143) + g * (.715 + cos * .285 + sin * .14) + b * (.072 - cos * .072 - sin * .283) - tint * .35);
    pixels[i + 2] = clamp(r * (.213 - cos * .213 - sin * .787) + g * (.715 - cos * .715 + sin * .715) + b * (.072 + cos * .928 + sin * .072) - temperature * .7 + tint * .2);
  }
  return pixels;
}
function drawOverlays(target) {
  target.save();
  strokes.forEach((stroke) => { if (!stroke.points.length) return; target.strokeStyle = stroke.color; target.lineWidth = stroke.size; target.lineCap = 'round'; target.lineJoin = 'round'; target.beginPath(); stroke.points.forEach((p, i) => i ? target.lineTo(p.x, p.y) : target.moveTo(p.x, p.y)); target.stroke(); });
  texts.forEach((item) => { target.fillStyle = item.color; target.font = '32px system-ui'; target.fillText(item.text, item.x, item.y); });
  target.restore();
}
function render(preview) {
  if (!source) { setLoaded(false); return; }
  const working = preview ? previewSource : source;
  const processed = document.createElement('canvas');
  processed.width = working.width; processed.height = working.height;
  processed.getContext('2d').putImageData(new ImageData(processPixels(working.data), working.width, working.height), 0, 0);
  canvas.width = source.width; canvas.height = source.height;
  canvas.style.width = `${source.width * zoom}px`; canvas.style.height = `${source.height * zoom}px`;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(processed, 0, 0, canvas.width, canvas.height);
  drawOverlays(ctx);
  setLoaded(true);
}
function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) { status.textContent = 'Please choose an image file.'; return; }
  const url = URL.createObjectURL(file); const img = new Image(); status.textContent = 'Loading…';
  img.onload = () => {
    const full = document.createElement('canvas'); full.width = img.naturalWidth; full.height = img.naturalHeight;
    const fullCtx = full.getContext('2d'); fullCtx.drawImage(img, 0, 0);
    source = { width: full.width, height: full.height, data: fullCtx.getImageData(0, 0, full.width, full.height).data };
    const scale = Math.min(1, 900 / full.width, 650 / full.height);
    const small = document.createElement('canvas'); small.width = Math.max(1, Math.round(full.width * scale)); small.height = Math.max(1, Math.round(full.height * scale));
    const smallCtx = small.getContext('2d'); smallCtx.drawImage(img, 0, 0, small.width, small.height);
    previewSource = { width: small.width, height: small.height, data: smallCtx.getImageData(0, 0, small.width, small.height).data };
    strokes = []; texts = []; fitImage(); render(true); status.textContent = `Loaded: ${file.name}`; URL.revokeObjectURL(url);
  };
  img.onerror = () => { status.textContent = 'The image could not be loaded.'; URL.revokeObjectURL(url); };
  img.src = url;
}
function canvasPoint(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; }
function exportPNG() { if (!source) return; render(false); canvas.toBlob((blob) => { if (!blob) return; const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'pixelforge-edited.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); render(true); }, 'image/png'); }

$('open').onclick = () => fileInput.click();
fileInput.onchange = (event) => { loadImage(event.target.files && event.target.files[0]); event.target.value = ''; };
controlIds.concat('size').forEach((id) => controls[id] ? controls[id].addEventListener('input', () => { updateLabels(); scheduleRender(); }) : null);
$('color').addEventListener('input', updateLabels);
viewButton.onclick = () => { if (!source) return; render(false); window.open(canvas.toDataURL('image/png'), '_blank', 'noopener,noreferrer'); render(true); };
downloadButton.onclick = exportPNG;
$('zoomIn').onclick = () => { zoom = Math.min(4, +(zoom + .25).toFixed(2)); updateZoom(); scheduleRender(); };
$('zoomOut').onclick = () => { zoom = Math.max(.05, +(zoom - .25).toFixed(2)); updateZoom(); scheduleRender(); };
$('fit').onclick = () => { fitImage(); scheduleRender(); };
$('reset').onclick = () => { controlIds.forEach((id) => controls[id].value = 0); $('size').value = 12; $('color').value = '#ff5d73'; strokes = []; texts = []; updateLabels(); fitImage(); scheduleRender(); };
document.querySelectorAll('.tool').forEach((button) => button.onclick = () => { tool = button.dataset.tool; document.querySelectorAll('.tool').forEach((item) => item.classList.toggle('active', item === button)); });
stage.ondragover = (event) => { event.preventDefault(); stage.classList.add('dragging'); };
stage.ondragleave = () => stage.classList.remove('dragging');
stage.ondrop = (event) => { event.preventDefault(); stage.classList.remove('dragging'); loadImage(event.dataTransfer && event.dataTransfer.files[0]); };
canvas.onpointerdown = (event) => { if (!source) return; const point = canvasPoint(event); if (tool === 'brush') { drawing = true; canvas.setPointerCapture?.(event.pointerId); strokes.push({ color: $('color').value, size: Number($('size').value), points: [point] }); render(true); } else if (tool === 'text') { const text = window.prompt('Add text:', 'Your text'); if (text) { texts.push({ text, x: point.x, y: point.y, color: $('color').value }); render(true); } } };
canvas.onpointermove = (event) => { if (!drawing) return; strokes[strokes.length - 1].points.push(canvasPoint(event)); scheduleRender(); };
canvas.onpointerup = () => { drawing = false; }; canvas.onpointercancel = () => { drawing = false; };
window.onresize = () => { if (source && zoom < 1) { fitImage(); scheduleRender(); } };
updateLabels(); updateZoom(); setLoaded(false);
