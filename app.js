'use strict';
/* ══════════════════════════════════════════════════════
   SOS-911 · app.js
   Mobile Emergency Alert System — Full Business Logic
   ══════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────────────
// QUIZ DATA
// ──────────────────────────────────────────────────────
const QUIZ = [
  {
    q: '¿Qué es lo primero que debe hacerse al detectar un cortocircuito en el panel eléctrico?',
    opts: [
      'Echar agua sobre el panel para enfriarlo.',
      'Evacuar al personal y apagar el breaker principal si es seguro hacerlo.',
      'Llamar al técnico electricista al día siguiente.'
    ],
    correct: 1,
    fb: '✅ Correcto. Cortar el flujo eléctrico previene incendios y protege a las personas.'
  },
  {
    q: 'Durante un asalto activo dentro de su negocio, la acción prioritaria es:',
    opts: [
      'Forcejear con el delincuente para defender el efectivo.',
      'Gritar y correr para alertar a los vecinos.',
      'Mantener la calma, cooperar y memorizar rasgos físicos del intruso.'
    ],
    correct: 2,
    fb: '✅ Correcto. Su integridad física es siempre la prioridad. Coopere y observe.'
  },
  {
    q: 'Si un cliente sufre un desmayo en su local, además de llamar al 911 debe:',
    opts: [
      'Administrarle medicamentos de la farmacia cercana.',
      'Colocarlo boca arriba, elevar levemente sus piernas y verificar que respira.',
      'Moverlo rápidamente al exterior para que reciba aire fresco.'
    ],
    correct: 1,
    fb: '✅ Correcto. La posición horizontal mejora la circulación cerebral. No lo mueva bruscamente.'
  }
];

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
      'Verificar que las cámaras de seguridad funcionen correctamente.',
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
const NEIGHBOR_MSGS = {
  robo: [
    { sender: 'Don Pancho', text: '¡Elena, cierro mi local y llamo al patrullero ya!' },
    { sender: 'Farmacia San Juan', text: 'Vi una moto arrancar rápido por la esquina. ¿Estás bien?' },
    { sender: 'Peluquería Estilos', text: '¡Patrulla en camino, escucho las sirenas!' },
  ],
  incendio: [
    { sender: 'Ferretería Exprés', text: '¡Tengo dos extintores CO₂ listos si los necesitan!' },
    { sender: 'Don Pancho', text: 'Bomberos confirmados. La unidad 4 ya viene en ruta.' },
    { sender: 'Licorería El Paso', text: '¿Cortamos el suministro de gas de la cuadra?' },
  ],
  medica: [
    { sender: 'Farmacia San Juan', text: '¿Necesitan gasas o suero mientras llega la ambulancia?' },
    { sender: 'Peluquería Estilos', text: 'Mando a mi asistente a controlar el tráfico en la entrada.' },
  ],
  general: [
    { sender: 'Don Pancho', text: 'Recibida la alerta. Monitoreando mis cámaras.' },
    { sender: 'Ferretería Exprés', text: 'Portones cerrados en prevención. Avisen cualquier novedad.' },
  ]
};

// ──────────────────────────────────────────────────────
// DEFAULT STATE
// ──────────────────────────────────────────────────────
const DEFAULT_STATE = {
  status: 'SECURE',           // 'SECURE' | 'EMERGENCY'
  incident: null,             // { type, name, icon, ts, id }
  badgeUnlocked: false,
  quizScore: 0,
  logs: []
};

// ──────────────────────────────────────────────────────
// APP STATE
// ──────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────
// DOM HELPERS
// ──────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
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

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// ──────────────────────────────────────────────────────
// NAVIGATION
// ──────────────────────────────────────────────────────
function initNav() {
  $$('.bn-item').forEach(btn => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.target));
  });
}

function switchScreen(name) {
  if (name === activeScreen) return;
  activeScreen = name;

  // Screens
  $$('.screen').forEach(s => s.classList.toggle('hidden', s.dataset.screen !== name));

  // Nav items
  $$('.bn-item').forEach(b => b.classList.toggle('active', b.dataset.target === name));
}

// ──────────────────────────────────────────────────────
// HOLD-TO-ACTIVATE PANIC BUTTONS
// ──────────────────────────────────────────────────────
const HOLD_DURATION_MS = 3000; // 3 seconds
const HOLD_INTERVAL_MS = 40;   // ~25fps
const HOLD_STEP = (HOLD_INTERVAL_MS / HOLD_DURATION_MS) * 100;

function initPanicButtons() {
  $$('.panic-btn').forEach(btn => {
    // Touch
    btn.addEventListener('touchstart', e => { e.preventDefault(); startHold(btn); }, { passive: false });
    btn.addEventListener('touchend',   cancelHold);
    btn.addEventListener('touchcancel',cancelHold);
    // Mouse
    btn.addEventListener('mousedown',  () => startHold(btn));
    btn.addEventListener('mouseup',    cancelHold);
    btn.addEventListener('mouseleave', cancelHold);
  });
}

function startHold(btn) {
  if (state.status === 'EMERGENCY') return;
  if (holdTimer) return;

  holdBtn      = btn;
  holdProgress = 0;

  btn.classList.add('holding');
  const bar = btn.querySelector('.pb-hold-bar');
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
  if (!holdTimer) return;
  clearInterval(holdTimer);
  holdTimer = null;

  if (holdBtn) {
    const bar = holdBtn.querySelector('.pb-hold-bar');
    bar.style.transition = 'width 0.3s ease';
    bar.style.width = '0%';
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
    btn.querySelector('.pb-hold-bar').style.width = '0%';
    holdBtn = null;
  }
  holdProgress = 0;

  if (btn) activateEmergency(btn.dataset.type, btn.dataset.name, btn.dataset.icon);
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

function activateEmergency(type, name, icon) {
  const cfg = TYPE_CFG[type] || TYPE_CFG.general;
  const inc = {
    id: `inc-${Date.now()}`,
    type, name, icon,
    ts: new Date().toISOString()
  };

  state.status   = 'EMERGENCY';
  state.incident = inc;
  saveState();

  // Show emergency banner
  const banner = $('emergencyBanner');
  banner.classList.add('active');
  $('ebIcon').textContent  = icon;
  $('ebTitle').textContent = `⚡ ${name.toUpperCase()}`;
  eSeconds = 0;
  updateEbTimer();

  // Header
  $('statusLabel').textContent = '¡ALERTA ACTIVA!';
  $('statusLabel').style.color = cfg.color;
  $('statusDot').className     = 'pulse-dot danger';
  $('merchantStatus').style.color = cfg.color;

  // Update header background accent
  $('appHeader').style.borderBottomColor = cfg.color;
  $('appHeader').style.boxShadow = `0 1px 0 0 ${cfg.shadow}`;

  // Flashing nav icon
  $('nav-inicio').classList.add('emergency-active');

  // Dispatch section
  $('dispatchSection').style.display = 'block';
  resetTimeline();

  // Map: center node turns emergency color
  setCenterNodeColor(cfg.color);

  // Chat
  clearChat();
  addChat('system', 'Red SOS:', `🚨 Alerta [${name}] transmitida con coordenadas al centro de despacho.`);

  // Plans: show contextual plan
  renderPlan(type);

  // Prepare neighbor messages
  chatQueue   = NEIGHBOR_MSGS[type] || NEIGHBOR_MSGS.general;
  chatPointer = 0;

  // Start emergency clock
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
  $('ebTimer').textContent = `Tiempo activo: ${m}:${s}`;
}

// ──────────────────────────────────────────────────────
// DISPATCH SIMULATION
// ──────────────────────────────────────────────────────
function resetTimeline() {
  ['tl1','tl2','tl3','tl4'].forEach(id => {
    const el = $(id);
    el.classList.remove('active','done');
  });
  $('tl1').classList.add('active');
  $('tl1desc').textContent = 'Coordenadas transmitidas al despacho 911.';
  $('tl2desc').textContent = 'Asignando unidad de respuesta prioritaria...';
  $('tl3desc').textContent = 'ETA calculando...';
}

function simulateDispatch(s) {
  if (s === 5) {
    markTlDone('tl1'); markTlActive('tl2');
    $('tl2desc').textContent = 'Unidad #24 de Policía del Distrito asignada.';
    addChat('system', '911 Central:', 'Unidad 24 en camino con coordinadas confirmadas.');
  }
  if (s === 8 && chatPointer < chatQueue.length) {
    const m = chatQueue[chatPointer++];
    addChat('neighbor', m.sender + ':', m.text);
  }
  if (s === 15) {
    markTlDone('tl2'); markTlActive('tl3');
    $('tl3desc').textContent = 'Patrullero en ruta — ETA estimada: 3 min.';
    addChat('system', 'Dispatcher:', 'Unidad policial en ruta desde estación Centro (ETA 3 min).');
  }
  if (s === 18 && chatPointer < chatQueue.length) {
    const m = chatQueue[chatPointer++];
    addChat('neighbor', m.sender + ':', m.text);
  }
  if (s === 28 && chatPointer < chatQueue.length) {
    const m = chatQueue[chatPointer++];
    addChat('neighbor', m.sender + ':', m.text);
  }
  if (s === 40) {
    markTlDone('tl3'); markTlActive('tl4');
    addChat('system', 'Patrulla 24:', 'Llegada en Av. Principal 123. Oficiales entrando al comercio.');
  }
}

function markTlDone(id)   { $(id).classList.remove('active'); $(id).classList.add('done'); }
function markTlActive(id) { $(id).classList.add('active'); }

// ──────────────────────────────────────────────────────
// MAP — Center node color
// ──────────────────────────────────────────────────────
function setCenterNodeColor(color) {
  const node   = $('centerNode');
  const glow1  = $('centerGlow1');
  const glow2  = $('centerGlow2');
  const dot    = $('centerStatusDot');

  if (color) {
    node.setAttribute('stroke', color);
    node.setAttribute('fill', '#1c1a00');  // tinted bg
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
  $('cancelBtn').addEventListener('click', () => openResolutionModal());
  $('rmDismiss').addEventListener('click', () => closeResolutionModal());
  $('rmSubmit').addEventListener('click',  submitResolution);
}

function openResolutionModal() {
  $('resolutionBackdrop').classList.add('open');
  $('rmText').value = '';
}

function closeResolutionModal() {
  $('resolutionBackdrop').classList.remove('open');
}

function submitResolution() {
  const text = $('rmText').value.trim();
  if (text.length < 6) {
    $('rmText').style.borderColor = '#EF4444';
    $('rmText').placeholder = '⚠️ Por favor ingrese un informe (mínimo 6 caracteres).';
    setTimeout(() => { $('rmText').style.borderColor = ''; }, 2000);
    return;
  }

  // Save log
  const inc = state.incident;
  state.logs.unshift({
    id:         inc.id,
    type:       inc.type,
    name:       inc.name,
    icon:       inc.icon,
    ts:         inc.ts,
    resolvedAt: new Date().toISOString(),
    summary:    text
  });

  // Reset state
  state.status   = 'SECURE';
  state.incident = null;
  saveState();

  // Clear emergency interval
  if (eTimer) { clearInterval(eTimer); eTimer = null; }
  eSeconds = 0;

  // UI reset
  closeResolutionModal();
  $('emergencyBanner').classList.remove('active');
  $('dispatchSection').style.display = 'none';

  $('statusLabel').textContent    = 'Seguro';
  $('statusLabel').style.color    = '';
  $('statusDot').className        = 'pulse-dot';
  $('merchantStatus').style.color = '';
  $('appHeader').style.borderBottomColor = '';
  $('appHeader').style.boxShadow  = '';
  $('nav-inicio').classList.remove('emergency-active');

  // Map reset
  setCenterNodeColor(null);

  // Chat message
  addChat('system', 'SOS-911:', '✅ Emergencia cerrada. Estado seguro restaurado.');

  // Reset plan to general
  renderPlan('general');

  // Render logs and navigate there
  renderLogs();
  switchScreen('historial');
}

// ──────────────────────────────────────────────────────
// MAP NODE INTERACTION
// ──────────────────────────────────────────────────────
function initMapNodes() {
  $$('.map-node').forEach(node => {
    node.addEventListener('click', () => {
      const name = node.dataset.name;
      const type = node.dataset.type;
      selectedNode = { name, type };
      $('npName').textContent = name;
      $('npType').textContent = type;
      $('nodePopup').classList.add('visible');
    });
  });

  $('npClose').addEventListener('click', () => {
    $('nodePopup').classList.remove('visible');
    selectedNode = null;
  });

  $('npCheckin').addEventListener('click', () => {
    if (!selectedNode) return;
    addChat('merchant', 'Yo:', `Envié check-in de seguridad a [${selectedNode.name}].`);
    $('nodePopup').classList.remove('visible');
    const n = selectedNode;
    selectedNode = null;
    setTimeout(() => {
      const replies = [
        'Todo tranquilo por acá, gracias por preguntar.',
        'Sin novedades en este lado. Seguimos atentos.',
        'Todo en orden. Avisen si necesitan algo.'
      ];
      addChat('neighbor', n.name + ':', replies[Math.floor(Math.random() * replies.length)]);
    }, 2500);
  });
}

// ──────────────────────────────────────────────────────
// CHAT FEED
// ──────────────────────────────────────────────────────
function clearChat() {
  $('chatFeed').innerHTML = '';
}

function addChat(cls, sender, text) {
  const el = document.createElement('div');
  el.className = `chat-msg ${cls}`;
  el.innerHTML = `<span class="cm-sender">${sender}</span> ${escHtml(text)}`;
  const feed = $('chatFeed');
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
}

// ──────────────────────────────────────────────────────
// PLANS / CHECKLISTS
// ──────────────────────────────────────────────────────
function renderPlan(type) {
  const plan = PLANS[type] || PLANS.general;
  $('planLabel').textContent = plan.title;

  const list = $('checklist');
  list.innerHTML = '';

  plan.items.forEach(text => {
    const item = document.createElement('div');
    item.className = 'cl-item';
    item.innerHTML = `
      <div class="cl-box"></div>
      <span class="cl-text">${escHtml(text)}</span>`;
    item.addEventListener('click', () => item.classList.toggle('checked'));
    list.appendChild(item);
  });
}

// ──────────────────────────────────────────────────────
// QUIZ
// ──────────────────────────────────────────────────────
function initQuiz() {
  quizIndex     = 0;
  quizTempScore = 0;
  $('qScore').textContent = '⭐ 0 pts';
  $('quizNext').style.display = 'inline-flex';
  loadQuestion();
  $('quizNext').addEventListener('click', nextQuestion);
}

function loadQuestion() {
  const q = QUIZ[quizIndex];
  $('qProgress').textContent = `Pregunta ${quizIndex + 1} de ${QUIZ.length}`;
  $('quizQ').textContent     = q.q;
  $('quizFB').textContent    = 'Selecciona una respuesta';
  $('quizFB').style.color    = '';
  $('quizNext').disabled     = true;

  const opts = $('quizOpts');
  opts.innerHTML = '';
  q.opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className   = 'qopt';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      $$('.qopt').forEach(b => b.disabled = true);
      if (i === q.correct) {
        btn.classList.add('correct');
        quizTempScore++;
        $('qScore').textContent = `⭐ ${quizTempScore} pts`;
        $('quizFB').textContent = q.fb;
        $('quizFB').style.color = '#10B981';
      } else {
        btn.classList.add('incorrect');
        $$('.qopt')[q.correct].classList.add('correct');
        $('quizFB').textContent = '❌ Incorrecto. Revisa el procedimiento recomendado.';
        $('quizFB').style.color = '#EF4444';
      }
      $('quizNext').disabled = false;
    });
    opts.appendChild(btn);
  });
}

function nextQuestion() {
  quizIndex++;
  if (quizIndex < QUIZ.length) {
    loadQuestion();
  } else {
    // Finished
    $('quizNext').style.display = 'none';
    $('quizOpts').innerHTML = '';
    $('qProgress').textContent  = 'Cuestionario finalizado';

    const perfect = quizTempScore === QUIZ.length;
    if (perfect) {
      state.badgeUnlocked = true;
      state.quizScore     = quizTempScore;
      saveState();
      updateBadge();
    }

    $('quizQ').innerHTML = `
      <div style="text-align:center;padding:1rem 0">
        <div style="font-size:2.2rem;margin-bottom:0.5rem">${perfect ? '🛡️' : '📋'}</div>
        <strong style="font-size:0.85rem;color:${perfect ? '#10B981' : '#F59E0B'}">
          ${perfect ? '¡Perfecto! Comercio Certificado' : `Puntaje: ${quizTempScore}/${QUIZ.length}`}
        </strong>
        <p style="font-size:0.63rem;color:#64748B;margin-top:0.4rem;line-height:1.6">
          ${perfect
            ? 'Su negocio está certificado. El sello protector 🛡️ está activo en su perfil.'
            : 'Debe responder correctamente todas las preguntas para obtener la certificación.'}
        </p>
        ${!perfect ? `<button id="retryQuiz" style="
          margin-top:0.75rem;padding:0.45rem 1rem;border-radius:8px;
          background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.35);
          color:#3B82F6;font-size:0.65rem;font-weight:600;cursor:pointer;font-family:inherit
        ">↺ Reintentar</button>` : ''}
      </div>`;

    if (!perfect) {
      setTimeout(() => {
        const retryBtn = $('retryQuiz');
        if (retryBtn) retryBtn.addEventListener('click', initQuiz);
      }, 50);
    }
  }
}

// ──────────────────────────────────────────────────────
// HISTORY LOGS
// ──────────────────────────────────────────────────────
function renderLogs() {
  const list = $('logsList');
  $('logsCount').textContent = `${state.logs.length} registro${state.logs.length !== 1 ? 's' : ''}`;

  if (!state.logs.length) {
    list.innerHTML = `
      <div class="empty-logs">
        <span class="empty-icon">📁</span>
        <span class="empty-text">Sin incidentes registrados</span>
      </div>`;
    return;
  }

  list.innerHTML = '';
  state.logs.forEach(log => {
    const date = new Date(log.ts).toLocaleString('es-ES', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const el = document.createElement('div');
    el.className = 'log-entry';
    el.innerHTML = `
      <div class="log-header">
        <span class="log-badge ${log.type}">${log.icon || ''} ${log.type}</span>
        <span class="log-date">${date}</span>
      </div>
      <div class="log-summary">${escHtml(log.summary)}</div>`;
    list.appendChild(el);
  });
}

// ──────────────────────────────────────────────────────
// BADGE
// ──────────────────────────────────────────────────────
function updateBadge() {
  const badge = $('certBadge');
  if (state.badgeUnlocked) {
    badge.classList.add('unlocked');
    badge.title = '✅ Comercio Certificado SOS-911';
  } else {
    badge.classList.remove('unlocked');
  }
}

// ──────────────────────────────────────────────────────
// RESUME ACTIVE EMERGENCY (page reload)
// ──────────────────────────────────────────────────────
function resumeIfActive() {
  if (state.status === 'EMERGENCY' && state.incident) {
    const inc = state.incident;
    activateEmergency(inc.type, inc.name, inc.icon);
  }
}

// ──────────────────────────────────────────────────────
// CONTACTS
// ──────────────────────────────────────────────────────
function confirmCall(number) {
  if (confirm(`¿Desea llamar al número ${number}?`)) {
    window.location.href = `tel:${number.replace(/\s/g, '')}`;
  }
}

// ──────────────────────────────────────────────────────
// UTILITY
// ──────────────────────────────────────────────────────
function escHtml(str) {
  return str
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

// ──────────────────────────────────────────────────────
// BOOTSTRAP
// ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  updateBadge();
  renderPlan('general');
  renderLogs();
  initNav();
  initPanicButtons();
  initMapNodes();
  initQuiz();
  initCancelBtn();
  resumeIfActive();
});

// Expose confirmCall globally for inline onclick handlers
window.confirmCall = confirmCall;