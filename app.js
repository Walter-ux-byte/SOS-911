// ============================================================
//  SOS911 — app.js  |  Vanilla JS — Sin librerías externas
// ============================================================

const DEFAULT_CONTACTS = [
  { id: 1, name: 'Ana García',   phone: '+54 11 1234-5678' },
  { id: 2, name: 'Carlos Ruiz',  phone: '+54 11 8765-4321' },
];

// ── UTILIDADES ───────────────────────────────────────────────
function getContacts() {
  const stored = localStorage.getItem('sos911_contacts');
  if (!stored) {
    localStorage.setItem('sos911_contacts', JSON.stringify(DEFAULT_CONTACTS));
    return DEFAULT_CONTACTS;
  }
  return JSON.parse(stored);
}

function saveContacts(contacts) {
  localStorage.setItem('sos911_contacts', JSON.stringify(contacts));
}

function nextId(contacts) {
  return contacts.length ? Math.max(...contacts.map(c => c.id)) + 1 : 1;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeHtml(str) {
  return escHtml(str);
}

// ──────────────────────────────────────────────────────
// ACTION CHECKLISTS
// ──────────────────────────────────────────────────────
const PLANS = {
  general: {
    title: '📋 Plan Preventivo General',
    items: [
      'Revisar que los extintores estén cargados y accesibles.',
      'Mantener las salidas de emergencia despejadas y señalizadas.',
      'Tener el directorio de emergencias visible en la caja registradora.',
      'Verificar que las cámaras de seguridad funcionen correctamente.'
    ]
  },
  robo: {
    title: '👥 Plan: Robo / Intruso Activo',
    items: [
      'No forcejear ni resistir la entrega de dinero o bienes.',
      'Mantener distancia y no establecer contacto visual desafiante.',
      'Activar la alerta SOS-911 tan pronto sea seguro hacerlo.',
      'Una vez el intruso se retire, cerrar el local y preservar la escena.',
      'Memorizar rasgos físicos: altura, ropa, vehículo de escape.',
    ]
  },
  incendio: {
    title: '🔥 Plan: Incendio / Cortocircuito',
    items: [
      'Suspender la energía general en el breaker principal.',
      'Evacuar calmadamente a todos los clientes y empleados.',
      'Tomar el extintor PQS y ubicarse a favor del viento.',
      'No abrir ventanas ni puertas que puedan avivar el fuego.',
      'Guiar a los bomberos a la entrada al llegar.',
    ]
  },
  medica: {
    title: '🚑 Plan: Emergencia Médica',
    items: [
      'Evaluar el entorno antes de prestar asistencia (seguridad).',
      'Verificar el estado de consciencia sin mover bruscamente al paciente.',
      'Designar a alguien para esperar a la ambulancia en la entrada.',
      'Localizar el botiquín de primeros auxilios del local.',
      'No administrar medicamentos sin indicación del personal médico.',
    ]
  }
};

// ──────────────────────────────────────────────────────
// NEIGHBOR MESSAGES
// ──────────────────────────────────────────────────────
const NEIGHBORS = {
  DON_PANCHO: 'Don Pancho',
  FARMACIA_SAN_JUAN: 'Farmacia San Juan',
  PELUQUERIA_ESTILOS: 'Peluquería Estilos',
  FERRETERIA_EXPRES: 'Ferretería Exprés',
  LICORERIA_EL_PASO: 'Licorería El Paso'
};

const NEIGHBOR_MSGS = {
  robo: [
    { sender: NEIGHBORS.DON_PANCHO, text: '¡Elena, cierro mi local y llamo al patrullero ya!' },
    { sender: NEIGHBORS.FARMACIA_SAN_JUAN, text: 'Vi una moto arrancar rápido por la esquina. ¿Estás bien?' },
    { sender: NEIGHBORS.PELUQUERIA_ESTILOS, text: '¡Patrulla en camino, escucho las sirenas!' },
  ],
  incendio: [
    { sender: NEIGHBORS.FERRETERIA_EXPRES, text: '¡Tengo dos extintores CO₂ listos si los necesitan!' },
    { sender: NEIGHBORS.DON_PANCHO, text: 'Bomberos confirmados. La unidad 4 ya viene en ruta.' },
    { sender: NEIGHBORS.LICORERIA_EL_PASO, text: '¿Cortamos el suministro de gas de la cuadra?' },
  ],
  medica: [
    { sender: NEIGHBORS.FARMACIA_SAN_JUAN, text: '¿Necesitan gasas o suero mientras llega la ambulancia?' },
    { sender: NEIGHBORS.PELUQUERIA_ESTILOS, text: 'Mando a mi asistente a controlar el tráfico en la entrada.' },
  ],
  general: [
    { sender: NEIGHBORS.DON_PANCHO, text: 'Recibida la alerta. Monitoreando mis cámaras.' },
    { sender: NEIGHBORS.FERRETERIA_EXPRES, text: 'Portones cerrados en prevención. Avisen cualquier novedad.' },
  ]
};

// ──────────────────────────────────────────────────────
// DEFAULT STATE & APP STATE
// ──────────────────────────────────────────────────────
const DEFAULT_STATE = {
  status: 'SECURE',           // 'SECURE' | 'EMERGENCY'
  incident: null,             // { type, name, icon, ts, id }
  badgeUnlocked: false,
  quizScore: 0,
  logs: []
};

let state = {};
let holdTimer    = null;
let holdBtn      = null;
let holdProgress = 0;
let eTimer       = null;  // emergency interval
let eSeconds     = 0;
let chatQueue    = [];
let chatPointer  = 0;
let quizIndex    = 0;
let quizTempScore = 0;
let activeScreen = 'inicio';
let selectedNode = null;
let isActivating = false;

// ──────────────────────────────────────────────────────
// DOM HELPERS
// ──────────────────────────────────────────────────────
const $ = (id) => {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Elemento con id "${id}" no encontrado.`);
    return null;
  }
  return element;
};
const $$ = sel => document.querySelectorAll(sel);

// ──────────────────────────────────────────────────────
// LOCALSTORAGE
// ──────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem('sos911');
    state = raw ? JSON.parse(raw) : deepClone(DEFAULT_STATE);
  } catch (_) {
    state = deepClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem('sos911', JSON.stringify(state));
}

// ── TOAST ────────────────────────────────────────────────────
function showToast(msg, color = '#1E293B', duration = 3000) {
  const existing = document.querySelector('.sos-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'sos-toast';
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '100px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: color,
    color: '#fff',
    padding: '12px 24px',
    borderRadius: '999px',
    fontFamily: "'Inter', sans-serif",
    fontSize: '13px',
    fontWeight: '600',
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    zIndex: '9999',
    maxWidth: '340px',
    textAlign: 'center',
    opacity: '0',
    transition: 'opacity 0.3s ease',
  });

  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── NAVEGACIÓN ENTRE PESTAÑAS ─────────────────────────────────
function navigateTo(tabId) {
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== tabId);
  });
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
}

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.getAttribute('data-tab')));
  });
}

function switchScreen(name) {
  if (name === activeScreen) return;
  activeScreen = name;
  const popup = $('nodePopup');
  if (popup) {
    popup.classList.remove('visible');
  }

  $$('.screen').forEach(s => s.classList.toggle('hidden', s.dataset.screen !== name));
  $$('.bn-item').forEach(b => b.classList.toggle('active', b.dataset.target === name));
}

// ── BOTÓN DE PÁNICO SIMPLE ───────────────────────────────────
function initPanicButton() {
  const btn = document.querySelector('.panic-button');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (navigator.vibrate) {
      navigator.vibrate([300, 100, 300, 100, 600]);
    }
  });
}

// ──────────────────────────────────────────────────────
// HOLD-TO-ACTIVATE PANIC BUTTONS
// ──────────────────────────────────────────────────────
const HOLD_DURATION_MS = 3000; // 3 seconds
const HOLD_INTERVAL_MS = 40;   // ~25fps
const HOLD_STEP = (HOLD_INTERVAL_MS / HOLD_DURATION_MS) * 100;

function initPanicButtons() {
  $$('.panic-btn').forEach(btn => {
    btn.addEventListener('touchstart', e => { e.preventDefault(); startHold(btn); }, { passive: false });
    btn.addEventListener('touchend',   cancelHold);
    btn.addEventListener('touchcancel', cancelHold);
    btn.addEventListener('touchmove',  cancelHold);

    btn.addEventListener('mousedown',  () => startHold(btn));
    btn.addEventListener('mouseup',    cancelHold);
    btn.addEventListener('mouseleave', cancelHold);
  });
}

function startHold(btn) {
  if (state.status === 'EMERGENCY') return;
  if (holdTimer || isActivating) return;

  holdBtn      = btn;
  holdProgress = 0;
  isActivating = true;

  btn.classList.add('holding');
  const bar = btn.querySelector('.pb-hold-bar');
  if (!bar) return;
  bar.style.transition = 'none';
  bar.style.width = '0%';

  holdTimer = setInterval(() => {
    holdProgress = Math.min(holdProgress + HOLD_STEP, 100);
    bar.style.width = holdProgress + '%';
    if (holdProgress >= 100) {
      finishHold();
    }
  }, HOLD_INTERVAL_MS);
}

function cancelHold() {
  if (holdTimer) {
    clearInterval(holdTimer);
    holdTimer = null;
  }
  isActivating = false;

  if (holdBtn) {
    const bar = holdBtn.querySelector('.pb-hold-bar');
    if (bar) {
      bar.style.transition = 'width 0.3s ease';
      bar.style.width = '0%';
    }
    holdBtn.classList.remove('holding');
    holdBtn = null;
  }
  holdProgress = 0;
}

function finishHold() {
  clearInterval(holdTimer);
  holdTimer = null;

  const btn = holdBtn;
  if (btn) {
    btn.classList.remove('holding');
    const bar = btn.querySelector('.pb-hold-bar');
    if (bar) {
      bar.style.transition = 'width 0.3s ease';
      bar.style.width = '0%';
    }
    holdBtn = null;
  }
  holdProgress = 0;

  if (btn) {
    activateEmergency(btn.dataset.type, btn.dataset.name, btn.dataset.icon);
    showToast('🚨 ¡ALERTA DE EMERGENCIA ACTIVADA!', '#C1121F', 4000);
    setTimeout(() => navigateTo('view-map'), 600);
  }
}

// ──────────────────────────────────────────────────────
// EMERGENCY ACTIVATION
// ──────────────────────────────────────────────────────
const TYPE_CFG = {
  robo:     { color: '#EF4444', shadow: 'rgba(239,68,68,0.4)' },
  incendio: { color: '#F97316', shadow: 'rgba(249,115,22,0.4)' },
  medica:   { color: '#3B82F6', shadow: 'rgba(59,130,246,0.4)' },
  general:  { color: '#F59E0B', shadow: 'rgba(245,158,11,0.4)' },
};

function activateEmergency(type, name, icon, savedId = null) {
  isActivating = false;

  const cfg = TYPE_CFG[type] || TYPE_CFG.general;
  const inc = {
    id: savedId || `inc-${Date.now()}`,
    type, name, icon,
    ts: new Date().toISOString()
  };

  if (state.status !== 'EMERGENCY') {
    state.status = 'EMERGENCY';
    state.incident = inc;
    saveState();
    console.info(`[SOS] Emergencia ${type} iniciada (${inc.id})`);
  }

  const banner = $('emergencyBanner');
  if (banner) banner.classList.add('active');
  if ($('ebIcon')) $('ebIcon').textContent  = icon;
  if ($('ebTitle')) $('ebTitle').textContent = `⚡ ${name.toUpperCase()}`;
  eSeconds = 0;
  updateEbTimer();

  if ($('statusLabel')) {
    $('statusLabel').textContent = '¡ALERTA ACTIVA!';
    $('statusLabel').style.color = cfg.color;
  }
  if ($('statusDot')) $('statusDot').className = 'pulse-dot danger';
  if ($('merchantStatus')) $('merchantStatus').style.color = cfg.color;

  if ($('appHeader')) {
    $('appHeader').style.borderBottomColor = cfg.color;
    $('appHeader').style.boxShadow = `0 1px 0 0 ${cfg.shadow}`;
  }

  if ($('nav-inicio')) $('nav-inicio').classList.add('emergency-active');

  if ($('dispatchSection')) $('dispatchSection').style.display = 'block';
  resetTimeline();

  setCenterNodeColor(cfg.color);

  chatQueue = [];
  chatPointer = 0;

  clearChat();
  addChat('system', 'Red SOS:', `🚨 Alerta [${name}] transmitida con coordenadas al centro de despacho.`);

  renderPlan(type);

  chatQueue = [...(NEIGHBOR_MSGS[type] || NEIGHBOR_MSGS.general)];
  chatPointer = 0;

  if (eTimer) clearInterval(eTimer);
  eTimer = setInterval(emergencyTick, 1000);
}

function emergencyTick() {
  eSeconds++;
  updateEbTimer();
  simulateDispatch(eSeconds);
}

function updateEbTimer() {
  const m = String(Math.floor(eSeconds / 60)).padStart(2, '0');
  const s = String(eSeconds % 60).padStart(2, '0');
  if ($('ebTimer')) $('ebTimer').textContent = `Tiempo activo: ${m}:${s}`;
}

// ──────────────────────────────────────────────────────
// DISPATCH SIMULATION
// ──────────────────────────────────────────────────────
function resetTimeline() {
  ['tl1','tl2','tl3','tl4'].forEach(id => {
    const el = $(id);
    if (el) el.classList.remove('active','done');
  });
}

function markTlDone(id) {
  const el = $(id);
  if (el) {
    el.classList.remove('active');
    el.classList.add('done');
  }
}

function markTlActive(id) {
  const el = $(id);
  if (el) el.classList.add('active');
}

function simulateDispatch(s) {
  if (state.status !== 'EMERGENCY') return;

  if (s === 5) {
    markTlDone('tl1'); markTlActive('tl2');
    if ($('tl2desc')) $('tl2desc').textContent = 'Unidad #24 de Policía del Distrito asignada.';
    addChat('system', '911 Central:', 'Unidad 24 en camino con coordenadas confirmadas.');
  }
  if (s === 8 && chatPointer < chatQueue.length) {
    const m = chatQueue[chatPointer++];
    if (m) addChat('neighbor', m.sender + ':', m.text);
  }
  if (s === 15) {
    markTlDone('tl2'); markTlActive('tl3');
    if ($('tl3desc')) $('tl3desc').textContent = 'Patrullero en ruta — ETA estimada: 3 min.';
    addChat('system', 'Dispatcher:', 'Unidad policial en ruta desde estación Centro (ETA 3 min).');
  }
  if (s === 18 && chatPointer < chatQueue.length) {
    const m = chatQueue[chatPointer++];
    if (m) addChat('neighbor', m.sender + ':', m.text);
  }
  if (s === 28 && chatPointer < chatQueue.length) {
    const m = chatQueue[chatPointer++];
    if (m) addChat('neighbor', m.sender + ':', m.text);
  }
  if (s === 40) {
    markTlDone('tl3'); markTlActive('tl4');
    addChat('system', 'Patrulla 24:', 'Llegada en Av. Principal 123. Oficiales entrando al comercio.');
  }
}

// ──────────────────────────────────────────────────────
// MAP — Center node color
// ──────────────────────────────────────────────────────
function setCenterNodeColor(color) {
  const node = $('centerNode');
  const glow1 = $('centerGlow1');
  const glow2 = $('centerGlow2');
  const dot  = $('centerStatusDot');
  if (!node || !glow1 || !glow2 || !dot) return;

  if (color) {
    node.setAttribute('stroke', color);
    node.setAttribute('fill', '#1c1a00');
    glow1.setAttribute('stroke', color);
    glow2.setAttribute('stroke', color);
    dot.setAttribute('fill', color);
  } else {
    node.setAttribute('stroke', '#3B82F6');
    node.setAttribute('fill', '#1e3a5f');
    glow1.setAttribute('stroke', '#3B82F6');
    glow2.setAttribute('stroke', '#3B82F6');
    dot.setAttribute('fill', '#10B981');
  }
}

// ──────────────────────────────────────────────────────
// CANCEL EMERGENCY → RESOLUTION MODAL
// ──────────────────────────────────────────────────────
function initCancelBtn() {
  if ($('cancelBtn')) $('cancelBtn').addEventListener('click', () => openResolutionModal());
  if ($('rmDismiss')) $('rmDismiss').addEventListener('click', () => closeResolutionModal());
  if ($('rmSubmit'))  $('rmSubmit').addEventListener('click', submitResolution);
}

function openResolutionModal() {
  if ($('resolutionBackdrop')) $('resolutionBackdrop').classList.add('open');
  if ($('rmText')) $('rmText').value = '';
}

function closeResolutionModal() {
  if ($('resolutionBackdrop')) $('resolutionBackdrop').classList.remove('open');
}

function submitResolution() {
  const rmText = $('rmText');
  const text = rmText ? rmText.value.trim() : '';

  if (text.length < 6) {
    if (rmText) {
      rmText.style.borderColor = '#EF4444';
      rmText.placeholder = '⚠️ Por favor ingrese un informe (mínimo 6 caracteres).';
      setTimeout(() => { rmText.style.borderColor = ''; }, 2000);
    }
    return;
  }

  const inc = state.incident || {};
  state.logs.unshift({
    id:         inc.id || Date.now(),
    type:       inc.type || 'general',
    name:       inc.name || 'Alerta',
    icon:       inc.icon || '⚠️',
    ts:         inc.ts || new Date().toISOString(),
    resolvedAt: new Date().toISOString(),
    summary:    text
  });

  state.status   = 'SECURE';
  state.incident = null;
  saveState();

  if (eTimer) { clearInterval(eTimer); eTimer = null; }
  eSeconds = 0;
  chatQueue = [];
  chatPointer = 0;

  closeResolutionModal();
  if ($('emergencyBanner')) $('emergencyBanner').classList.remove('active');
  if ($('dispatchSection')) $('dispatchSection').style.display = 'none';

  if ($('statusLabel')) {
    $('statusLabel').textContent = 'Seguro';
    $('statusLabel').style.color = '';
  }
  if ($('statusDot')) $('statusDot').className = 'pulse-dot';
  if ($('merchantStatus')) $('merchantStatus').style.color = '';
  if ($('appHeader')) {
    $('appHeader').style.borderBottomColor = '';
    $('appHeader').style.boxShadow  = '';
  }
  if ($('nav-inicio')) $('nav-inicio').classList.remove('emergency-active');

  setCenterNodeColor(null);
  addChat('system', 'SOS-911:', '✅ Emergencia cerrada. Estado seguro restaurado.');

  renderPlan('general');
  renderLogs();
  switchScreen('historial');
}

// ──────────────────────────────────────────────────────
// MAP NODE INTERACTION
// ──────────────────────────────────────────────────────
function initMapNodes() {
  $$('.map-node').forEach(node => {
    node.addEventListener('click', () => {
      if ($('nodePopup')) $('nodePopup').classList.remove('visible');
      const name = node.dataset.name || 'Comercio';
      const type = node.dataset.type || 'Sin categoría';
      selectedNode = { name, type };
      if ($('npName')) $('npName').textContent = name;
      if ($('npType')) $('npType').textContent = type;
      if ($('nodePopup')) $('nodePopup').classList.add('visible');
    });
  });

  if ($('npClose')) {
    $('npClose').addEventListener('click', () => {
      if ($('nodePopup')) $('nodePopup').classList.remove('visible');
      selectedNode = null;
    });
  }

  if ($('npCheckin')) {
    $('npCheckin').addEventListener('click', () => {
      if (!selectedNode) return;
      if (state.status === 'EMERGENCY') return;
      addChat('merchant', 'Yo:', `Envié check-in de seguridad a [${selectedNode.name}].`);
      if ($('nodePopup')) $('nodePopup').classList.remove('visible');
      const n = selectedNode;
      selectedNode = null;
      setTimeout(() => {
        if (state.status === 'EMERGENCY') return;
        const replies = [
          'Todo tranquilo por acá, gracias por preguntar.',
          'Sin novedades en este lado. Seguimos atentos.',
          'Todo en orden. Avisen si necesitan algo.'
        ];
        addChat('neighbor', n.name + ':', replies[Math.floor(Math.random() * replies.length)]);
      }, 2500);
    });
  }
}

// ──────────────────────────────────────────────────────
// CHAT FEED
// ──────────────────────────────────────────────────────
function clearChat() {
  const feed = $('chatFeed');
  if (feed) feed.innerHTML = '';
}

function addChat(cls, sender, text) {
  const feed = $('chatFeed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className = `chat-msg ${cls}`;
  el.innerHTML = `<span class="cm-sender">${sender}</span> ${escHtml(text)}`;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
}

// ──────────────────────────────────────────────────────
// PLANS / CHECKLISTS
// ──────────────────────────────────────────────────────
function renderPlan(type) {
  const plan = PLANS[type] || PLANS.general;
  if ($('planLabel')) $('planLabel').textContent = plan.title;

  const list = $('checklist');
  if (!list) return;
  list.innerHTML = '';

  plan.items.forEach(text => {
    const item = document.createElement('div');
    item.className = 'contact-item';
    item.innerHTML = `
      <div class="contact-avatar">
        <span class="material-symbols-rounded">check_circle</span>
      </div>
      <div class="contact-details">
        <span>${escapeHtml(text)}</span>
      </div>`;
    list.appendChild(item);
  });
}

// ── RENDERIZADO DE CONTACTOS ──────────────────────────────────
function renderContacts() {
  const list = document.querySelector('.contact-list');
  if (!list) return;

  const contacts = getContacts();
  list.innerHTML = '';

  if (contacts.length === 0) {
    list.innerHTML = `
      <div style="text-align:center; padding: 24px; color: #94A3B8; font-size: 13px;">
        No hay contactos de confianza.<br>Agrega uno abajo.
      </div>`;
    return;
  }

  contacts.forEach(contact => {
    const item = document.createElement('div');
    item.className = 'contact-item';
    item.dataset.id = contact.id;
    item.innerHTML = `
      <div class="contact-avatar">
        <span class="material-symbols-rounded">person</span>
      </div>
      <div class="contact-details">
        <strong>${escapeHtml(contact.name)}</strong>
        <span>${escapeHtml(contact.phone)}</span>
      </div>
      <button class="trash-btn" data-id="${contact.id}" title="Eliminar contacto">
        <span class="material-symbols-rounded">delete</span>
      </button>`;
    list.appendChild(item);
  });

  list.querySelectorAll('.trash-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteContact(Number(btn.dataset.id)));
  });
}

function deleteContact(id) {
  const contacts = getContacts().filter(c => c.id !== id);
  saveContacts(contacts);
  renderContacts();
  showToast('Contacto eliminado', '#475569');
}

function initAddContact() {
  const form    = document.querySelector('.add-contact-card');
  const nameIn  = form?.querySelector('input[type="text"]:nth-of-type(1), input[placeholder="Ej. Maria Lopez"]');
  const phoneIn = form?.querySelector('input[placeholder="+54 9..."]');
  const saveBtn = form?.querySelector('.btn-red');

  if (!form || !saveBtn) return;

  saveBtn.addEventListener('click', () => {
    const name  = nameIn?.value.trim();
    const phone = phoneIn?.value.trim();

    if (!name || !phone) {
      showToast('⚠️ Completa nombre y teléfono', '#F59E0B');
      return;
    }

    const contacts = getContacts();
    contacts.push({ id: nextId(contacts), name, phone });
    saveContacts(contacts);

    if (nameIn) nameIn.value   = '';
    if (phoneIn) phoneIn.value = '';

    renderContacts();
    showToast('✅ Contacto guardado', '#16A34A');
  });
}

// ── HISTORIAL LOGS ────────────────────────────────────────────
function renderLogs() {
  const container = $('logsList');
  if (!container) return;
  container.innerHTML = '';

  if (!state.logs || state.logs.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:24px; color:#94A3B8;">No hay registros de incidentes.</div>`;
    return;
  }

  state.logs.forEach(log => {
    const card = document.createElement('div');
    card.className = 'contact-item';
    card.innerHTML = `
      <div class="contact-avatar">${log.icon || '⚠️'}</div>
      <div class="contact-details">
        <strong>${escapeHtml(log.name)} — ${new Date(log.ts).toLocaleString()}</strong>
        <span>Informe: ${escapeHtml(log.summary)}</span>
      </div>`;
    container.appendChild(card);
  });
}

// ── MI UBICACIÓN Y COMPARTIR ──────────────────────────────────
function initMyLocation() {
  document.querySelectorAll('.action-card').forEach(btn => {
    const iconEl = btn.querySelector('.material-symbols-rounded');
    if (iconEl && iconEl.textContent.trim() === 'my_location') {
      btn.addEventListener('click', () => {
        if (!navigator.geolocation) {
          showToast('⚠️ Tu dispositivo no soporta geolocalización', '#F59E0B');
          return;
        }
        showToast('📡 Obteniendo ubicación...', '#4F46E5', 6000);
        navigator.geolocation.getCurrentPosition(
          pos => {
            const { latitude: lat, longitude: lng } = pos.coords;
            showToast(`📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`, '#16A34A', 5000);
          },
          err => {
            const msgs = {
              1: 'Permiso de ubicación denegado.',
              2: 'Ubicación no disponible.',
              3: 'Tiempo de espera agotado.',
            };
            showToast(`⚠️ ${msgs[err.code] || 'Error desconocido'}`, '#F59E0B');
          },
          { timeout: 8000 }
        );
      });
    }
  });
}

function initShareLocation() {
  const shareBtn = document.querySelector('.btn-blue');
  if (!shareBtn) return;

  shareBtn.addEventListener('click', () => {
    const fakeLink = `https://sos911.app/alert?id=${Date.now()}&loc=-34.6037,-58.3816`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(fakeLink)
        .then(() => showToast('🔗 Enlace copiado al portapapeles', '#4F46E5'))
        .catch(() => showToast('🔗 Ubicación compartida: ' + fakeLink, '#4F46E5', 5000));
    } else {
      showToast('🔗 Ubicación compartida (simulada)', '#4F46E5');
    }
  });
}

// ── CANCELAR ALERTA SIMPLE ───────────────────────────────────
function initCancelAlert() {
  const cancelBtn = document.querySelector('.btn-red');
  if (!cancelBtn) return;

  cancelBtn.addEventListener('click', () => {
    const confirmed = window.confirm('¿Estás seguro de que deseas cancelar la alerta de emergencia?');
    if (confirmed) {
      showToast('✅ Alerta cancelada. Regresando a inicio.', '#16A34A');
      setTimeout(() => navigateTo('view-home'), 1200);
    }
  });
}

// ── CONFIGURACIÓN ─────────────────────────────────────────────
function initSettings() {
  document.querySelectorAll('.action-card').forEach(btn => {
    const iconEl = btn.querySelector('.material-symbols-rounded');
    if (iconEl && iconEl.textContent.trim() === 'settings') {
      btn.addEventListener('click', () => {
        showToast('⚙️ Configuración — Próximamente', '#64748B');
      });
    }
  });
}

function resumeIfActive() {
  if (state.status === 'EMERGENCY' && state.incident) {
    const inc = state.incident;
    activateEmergency(inc.type, inc.name, inc.icon, inc.id);
  }
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initNav();
  initPanicButton();
  initPanicButtons();
  initCancelBtn();
  initMapNodes();
  renderContacts();
  renderPlan('general');
  initAddContact();
  initMyLocation();
  initShareLocation();
  initCancelAlert();
  initSettings();
  resumeIfActive();
});