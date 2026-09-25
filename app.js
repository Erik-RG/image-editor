const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('file');
const emptyMessage = document.getElementById('empty');
const openBtn = document.getElementById('open');
const exportBtn = document.getElementById('export');
const resetBtn = document.getElementById('reset');

const controls = {
  brightness: document.getElementById('brightness'),
  contrast: document.getElementById('contrast'),
  saturation: document.getElementById('saturation'),
  grayscale: document.getElementById('grayscale'),
  sepia: document.getElementById('sepia'),
  hue: document.getElementById('hue'),
  size: document.getElementById('size'),
  color: document.getElementById('color')
};

const valueOutputs = {
  brightness: document.getElementById('brightnessOut'),
  contrast: document.getElementById('contrastOut'),
  saturation: document.getElementById('saturationOut'),
  grayscale: document.getElementById('grayscaleOut'),
  sepia: document.getElementById('sepiaOut'),
  hue: document.getElementById('hueOut'),
  size: document.getElementById('sizeOut')
};

let image = null;
let tool = 'select';
let drawing = false;
let strokes = [];
let texts = [];
let rotation = 0;
let flipX = false;
let flipY = false;

function updateLabels() {
  valueOutputs.brightness.textContent = `${controls.brightness.value}%`;
  valueOutputs.contrast.textContent = `${controls.contrast.value}%`;
  valueOutputs.saturation.textContent = `${controls.saturation.value}%`;
  valueOutputs.grayscale.textContent = `${controls.grayscale.value}%`;
  valueOutputs.sepia.textContent = `${controls.sepia.value}%`;
  valueOutputs.hue.textContent = `${controls.hue.value}°`;
  valueOutputs.size.textContent = `${controls.size.value}px`;
}

function getFilter() {
  return `brightness(${controls.brightness.value}%) contrast(${controls.contrast.value}%) saturate(${controls.saturation.value}%) grayscale(${controls.grayscale.value}%) sepia(${controls.sepia.value}%) hue-rotate(${controls.hue.value}deg)`;
}

function drawStroke(stroke) {
  if (!stroke || stroke.points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  stroke.points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });

  ctx.stroke();
  ctx.restore();
}

function drawText(item) {
  if (!item) return;

  ctx.save();
  ctx.fillStyle = item.color;
  ctx.font = '32px system-ui';
  ctx.fillText(item.text, item.x, item.y);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!image) {
    emptyMessage.hidden = false;
    return;
  }

  emptyMessage.hidden = true;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.filter = getFilter();
  ctx.drawImage(image, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  ctx.restore();

  strokes.forEach(drawStroke);
  texts.forEach(drawText);
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height
  };
}

function loadImage(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      image = img;
      canvas.width = img.width;
      canvas.height = img.height;
      strokes = [];
      texts = [];
      rotation = 0;
      flipX = false;
      flipY = false;
      render();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
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
  updateLabels();
  rotation = 0;
  flipX = false;
  flipY = false;
  strokes = [];
  texts = [];
  render();
}

openBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  loadImage(file);
});

Object.entries(controls).forEach(([key, element]) => {
  element.addEventListener('input', () => {
    updateLabels();
    render();
  });
});

canvas.addEventListener('pointerdown', (event) => {
  if (!image) return;

  const point = getCanvasPoint(event);

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
    const text = window.prompt('Text to add:');
    if (!text) return;

    texts.push({
      text,
      x: point.x,
      y: point.y,
      color: controls.color.value
    });
    render();
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (!drawing || !image) return;

  const point = getCanvasPoint(event);
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

document.querySelectorAll('.tool').forEach((button) => {
  button.addEventListener('click', () => {
    tool = button.dataset.tool;
    document.querySelectorAll('.tool').forEach((node) => node.classList.toggle('active', node === button));
  });
});

exportBtn.addEventListener('click', () => {
  if (!image) return;

  const link = document.createElement('a');
  link.download = 'edited-image.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

resetBtn.addEventListener('click', resetEditor);

updateLabels();
render();
