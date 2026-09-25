const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const fileInput = $('file');
const empty = $('empty');
const status = $('status');

const controls = {
  brightness: $('brightness'),
  contrast: $('contrast'),
  saturation: $('saturation'),
  grayscale: $('grayscale'),
  sepia: $('sepia'),
  hue: $('hue'),
  size: $('size'),
  color: $('color')
};

const outputs = {
  brightness: $('brightnessOut'),
  contrast: $('contrastOut'),
  saturation: $('saturationOut'),
  grayscale: $('grayscaleOut'),
  sepia: $('sepiaOut'),
  hue: $('hueOut'),
  size: $('sizeOut')
};

let image = null;
let baseCanvas = document.createElement('canvas');
let baseCtx = baseCanvas.getContext('2d');
let strokes = [];
let texts = [];
let zoom = 1;
let drawing = false;
let tool = 'select';

function setEmpty(showPlaceholder) {
  empty.hidden = !showPlaceholder;
  canvas.style.visibility = showPlaceholder ? 'hidden' : 'visible';
}

function updateLabels() {
  outputs.brightness.textContent = `${controls.brightness.value}%`;
  outputs.contrast.textContent = `${controls.contrast.value}%`;
  outputs.saturation.textContent = `${controls.saturation.value}%`;
  outputs.grayscale.textContent = `${controls.grayscale.value}%`;
  outputs.sepia.textContent = `${controls.sepia.value}%`;
  outputs.hue.textContent = `${controls.hue.value}°`;
  outputs.size.textContent = `${controls.size.value}px`;
}

function updateZoom() {
  $('zoomOutLabel').textContent = `${Math.round(zoom * 100)}%`;
}

function getFilterString() {
  return [
    `brightness(${controls.brightness.value}%)`,
    `contrast(${controls.contrast.value}%)`,
    `saturate(${controls.saturation.value}%)`,
    `grayscale(${controls.grayscale.value}%)`,
    `sepia(${controls.sepia.value}%)`,
    `hue-rotate(${controls.hue.value}deg)`
  ].join(' ');
}

function fitImage() {
  if (!image) return;
  const maxW = Math.max(120, stage.clientWidth - 48);
  const maxH = Math.max(120, stage.clientHeight - 48);
  zoom = Math.min(1, maxW / baseCanvas.width, maxH / baseCanvas.height);
  zoom = Number(zoom.toFixed(3));
  updateZoom();
}

function render() {
  if (!image) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    return;
  }

  const filteredCanvas = document.createElement('canvas');
  filteredCanvas.width = baseCanvas.width;
  filteredCanvas.height = baseCanvas.height;
  const filteredCtx = filteredCanvas.getContext('2d');
  filteredCtx.filter = getFilterString();
  filteredCtx.drawImage(baseCanvas, 0, 0);

  canvas.width = filteredCanvas.width;
  canvas.height = filteredCanvas.height;
  canvas.style.width = `${Math.max(1, filteredCanvas.width * zoom)}px`;
  canvas.style.height = `${Math.max(1, filteredCanvas.height * zoom)}px`;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(filteredCanvas, 0, 0, canvas.width, canvas.height);

  for (const stroke of strokes) {
    if (!stroke.points || stroke.points.length === 0) continue;
    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    stroke.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  for (const item of texts) {
    ctx.save();
    ctx.fillStyle = item.color;
    ctx.font = '32px system-ui';
    ctx.fillText(item.text, item.x, item.y);
    ctx.restore();
  }

  setEmpty(false);
}

function getPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height
  };
}

function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    status.textContent = 'Please choose a valid image file.';
    return;
  }

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    image = img;
    baseCanvas.width = img.naturalWidth;
    baseCanvas.height = img.naturalHeight;
    baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
    baseCtx.drawImage(img, 0, 0, baseCanvas.width, baseCanvas.height);
    strokes = [];
    texts = [];
    fitImage();
    status.textContent = `Loaded: ${file.name}`;
    render();
    URL.revokeObjectURL(url);
  };

  img.onerror = () => {
    status.textContent = 'The image could not be loaded.';
    URL.revokeObjectURL(url);
  };

  img.src = url;
}

function resetEditor() {
  controls.brightness.value = 100;
  controls.contrast.value = 100;
  controls.saturation.value = 100;
  controls.grayscale.value = 0;
  controls.sepia.value = 0;
  controls.hue.value = 0;
  controls.size.value = 12;
  controls.color.value = '#ff5d73';
  strokes = [];
  texts = [];
  if (image) fitImage();
  updateLabels();
  render();
}

$('open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  loadImage(file);
  fileInput.value = '';
});

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

Object.keys(controls).forEach((key) => {
  controls[key].addEventListener('input', () => {
    updateLabels();
    render();
  });
});

document.querySelectorAll('.tool').forEach((button) => {
  button.addEventListener('click', () => {
    tool = button.dataset.tool;
    document.querySelectorAll('.tool').forEach((node) => node.classList.toggle('active', node === button));
  });
});

canvas.addEventListener('pointerdown', (event) => {
  if (!image) return;

  const point = getPoint(event);

  if (tool === 'brush') {
    drawing = true;
    strokes.push({
      color: controls.color.value,
      size: Number(controls.size.value),
      points: [point]
    });
    render();
    return;
  }

  if (tool === 'text') {
    const text = window.prompt('Add text:', 'Your text');
    if (!text) return;
    texts.push({ text, x: point.x, y: point.y, color: controls.color.value });
    render();
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (!drawing) return;
  const point = getPoint(event);
  const lastStroke = strokes[strokes.length - 1];
  if (lastStroke) {
    lastStroke.points.push(point);
    render();
  }
});

canvas.addEventListener('pointerup', () => {
  drawing = false;
});

canvas.addEventListener('pointerleave', () => {
  drawing = false;
});

canvas.addEventListener('dblclick', () => {
  if (!image) return;
  zoom = zoom === 1 ? 2 : 1;
  updateZoom();
  render();
});

$('zoomIn').addEventListener('click', () => {
  zoom = Math.min(4, Number((zoom + 0.25).toFixed(2)));
  updateZoom();
  render();
});

$('zoomOut').addEventListener('click', () => {
  zoom = Math.max(0.25, Number((zoom - 0.25).toFixed(2)));
  updateZoom();
  render();
});

$('fit').addEventListener('click', () => {
  fitImage();
  render();
});

$('reset').addEventListener('click', resetEditor);
$('export').addEventListener('click', () => {
  if (!image) return;
  const link = document.createElement('a');
  link.download = 'edited-image.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

window.addEventListener('resize', () => {
  if (image && zoom < 1) {
    fitImage();
    render();
  }
});

updateLabels();
updateZoom();
setEmpty(true);
render();
