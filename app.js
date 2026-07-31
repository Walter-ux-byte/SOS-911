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

// ── BOTÓN DE PÁNICO ───────────────────────────────────────────
function initPanicButton() {
  const btn = document.querySelector('.panic-button');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // Vibración de emergencia (si el dispositivo lo soporta)
    if (navigator.vibrate) {
      navigator.vibrate([300, 100, 300, 100, 600]);
    }

    // Toast de emergencia
    showToast('🚨 ¡ALERTA DE EMERGENCIA ACTIVADA!', '#C1121F', 4000);

    // Redirigir al mapa tras un breve instante
    setTimeout(() => navigateTo('view-map'), 600);
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

  // Listeners de eliminación
  list.querySelectorAll('.trash-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteContact(Number(btn.dataset.id)));
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

    nameIn.value  = '';
    phoneIn.value = '';

    renderContacts();
    showToast('✅ Contacto guardado', '#16A34A');
  });
}

// ── MI UBICACIÓN ──────────────────────────────────────────────
function initMyLocation() {
  // Busca el botón "Mi ubicación" en la action-grid
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

// ── COMPARTIR UBICACIÓN ───────────────────────────────────────
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

// ── CANCELAR ALERTA ───────────────────────────────────────────
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

// ── CONFIGURACIÓN (placeholder) ───────────────────────────────
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

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initPanicButton();
  renderContacts();
  initAddContact();
  initMyLocation();
  initShareLocation();
  initCancelAlert();
  initSettings();
});