// ============================================================
//  SOS911 — app.js  |  Vanilla JS + Leaflet.js Mapa Dinámico
// ============================================================

const DEFAULT_CONTACTS = [];

const DEFAULT_PROFILE = {
  name: "Usuario SOS911",
  phone: "+593 99 000 1122",
  email: "contacto@sos911.app",
  address: "Centro Urbano Principal",
  age: "",
  bloodType: "",
  condition: "",
  allergies: "",
  medication: "",
  insurance: "",
  notes: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
};

const DEFAULT_STATE = {
  status: "SECURE", // 'SECURE' | 'EMERGENCY'
  incident: null, // { id, type, name, icon, ts, lat, lng }
  logs: [],
  user: DEFAULT_PROFILE,
};

// ── ESTADO GLOBAL ─────────────────────────────────────────────
let state = {};
let leafletMap = null;
let modalLeafletMap = null;
let userMarker = null;
let modalUserMarker = null;
let policeMarker = null;
let modalPoliceMarker = null;
let userCoords = { lat: -0.180653, lng: -78.467838 }; // Coordenadas iniciales (Quito / Ecuador por defecto)
let watchPositionId = null;

// Temporizadores y Hold
let holdTimer = null;
let holdBtn = null;
let holdProgress = 0;
let emergencyTimer = null;
let emergencySeconds = 0;
let dispatchStep = 0;

// ── UTILIDADES ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function escHtml(str) {
  return String(str || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function showToast(msg, color = "#2563EB", duration = 3500) {
  const existing = document.querySelector(".sos-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "sos-toast";
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "80px",
    left: "50%",
    transform: "translateX(-50%)",
    background: color,
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "9999px",
    fontFamily: "'Inter', sans-serif",
    fontSize: "13px",
    fontWeight: "600",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    zIndex: "99999",
    maxWidth: "360px",
    textAlign: "center",
    opacity: "0",
    transition: "opacity 0.3s ease",
  });

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── LOCALSTORAGE ──────────────────────────────────────────────
function loadState() {
  try {
    const stored = localStorage.getItem("sos911_app_state");
    state = stored
      ? JSON.parse(stored)
      : JSON.parse(JSON.stringify(DEFAULT_STATE));
    // Asegurar que user tenga todos los campos nuevos
    if (!state.user) state.user = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
    state.user = Object.assign({}, DEFAULT_PROFILE, state.user);
  } catch (_) {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  // Cargar contactos
  const contactsStored = localStorage.getItem("sos911_contacts");
  if (!contactsStored) {
    localStorage.setItem("sos911_contacts", JSON.stringify(DEFAULT_CONTACTS));
  }
}

function saveState() {
  localStorage.setItem("sos911_app_state", JSON.stringify(state));
}

function getContacts() {
  try {
    const raw = localStorage.getItem("sos911_contacts");
    return raw ? JSON.parse(raw) : DEFAULT_CONTACTS;
  } catch (_) {
    return DEFAULT_CONTACTS;
  }
}

function saveContacts(contacts) {
  localStorage.setItem("sos911_contacts", JSON.stringify(contacts));
  renderContacts();
  updateHomeContactCount();
}

// ── NAVEGACIÓN Y PESTAÑAS ─────────────────────────────────────
function navigateTo(tabId) {
  $$(".view-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== tabId);
  });
  $$(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
  });

  if (tabId === "view-map") {
    setTimeout(() => {
      if (leafletMap) {
        leafletMap.invalidateSize();
      } else {
        initLeafletMap();
      }
    }, 200);
  }
}

function initNav() {
  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigateTo(btn.getAttribute("data-tab"));
    });
  });

  if ($("bannerMapBtn")) {
    $("bannerMapBtn").addEventListener("click", () => navigateTo("view-map"));
  }

  if ($("myLocationBtn")) {
    $("myLocationBtn").addEventListener("click", () => navigateTo("view-map"));
  }

  if ($("quickContactsBtn")) {
    $("quickContactsBtn").addEventListener("click", () =>
      navigateTo("view-contacts"),
    );
  }
}

// ── MAPA INTERACTIVO LEAFLET Y GPS ────────────────────────────
function openMapModal() {
  const backdrop = $("mapModalBackdrop");
  if (!backdrop) return;
  backdrop.classList.add("open");

  if ($("modalCoordsText")) {
    $("modalCoordsText").textContent =
      `Lat: ${userCoords.lat.toFixed(5)}, Lng: ${userCoords.lng.toFixed(5)}`;
  }
  if ($("modalAddressText") && $("liveAddressText")) {
    $("modalAddressText").textContent = $("liveAddressText").textContent;
  }

  setTimeout(() => {
    if (!modalLeafletMap) {
      modalLeafletMap = L.map("modalMap", {
        center: [userCoords.lat, userCoords.lng],
        zoom: 16,
        zoomControl: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution: "&copy; OpenStreetMap &copy; CARTO",
          subdomains: "abcd",
          maxZoom: 19,
        },
      ).addTo(modalLeafletMap);

      const userIcon = L.divIcon({
        className: "user-gps-marker-modal",
        html: `<div style="background:#EF4444; width:26px; height:26px; border-radius:50%; border:3px solid white; box-shadow:0 0 20px #EF4444; animation: pulseHeart 1.5s infinite;"></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      modalUserMarker = L.marker([userCoords.lat, userCoords.lng], {
        icon: userIcon,
      }).addTo(modalLeafletMap);
      modalUserMarker
        .bindPopup("<b>¡Tu Ubicación GPS!</b><br>Vista Expandida")
        .openPopup();
    } else {
      modalLeafletMap.panTo([userCoords.lat, userCoords.lng]);
      if (modalUserMarker)
        modalUserMarker.setLatLng([userCoords.lat, userCoords.lng]);
    }

    modalLeafletMap.invalidateSize();
  }, 150);
}

function closeMapModal() {
  const backdrop = $("mapModalBackdrop");
  if (backdrop) backdrop.classList.remove("open");
}

function initLeafletMap() {
  const mapContainer = $("map");
  const expandBtn = $("expandMapBtn");
  const closeBtn = $("closeMapModalBtn");
  const recenterBtn = $("modalRecenterGpsBtn");

  if (mapContainer && !leafletMap) {
    leafletMap = L.map("map", {
      center: [userCoords.lat, userCoords.lng],
      zoom: 15,
      zoomControl: false,
    });

    // Capa de Mapa Oscuro (CartoDB Dark Matter / OpenStreetMap)
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      },
    ).addTo(leafletMap);

    // Marcador de Ubicación del Usuario
    const userIcon = L.divIcon({
      className: "user-gps-marker",
      html: `<div style="background:#EF4444; width:22px; height:22px; border-radius:50%; border:3px solid white; box-shadow:0 0 15px #EF4444; animation: pulseHeart 1.5s infinite;"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    userMarker = L.marker([userCoords.lat, userCoords.lng], {
      icon: userIcon,
    }).addTo(leafletMap);
    userMarker
      .bindPopup(
        "<b>¡Tu Ubicación Actual!</b><br>Rastreando coordenadas GPS...",
      )
      .openPopup();

    // Doble Clic para Expandir
    mapContainer.addEventListener("dblclick", (e) => {
      e.preventDefault();
      openMapModal();
    });

    startGPSTracking();
  }

  if (expandBtn) {
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openMapModal();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeMapModal());
  }

  if (recenterBtn) {
    recenterBtn.addEventListener("click", () => {
      if (modalLeafletMap && userCoords) {
        modalLeafletMap.setView([userCoords.lat, userCoords.lng], 16);
        showToast("📍 Centrado en tu ubicación GPS", "#2563EB");
      }
    });
  }
}

function startGPSTracking() {
  if (!navigator.geolocation) {
    if ($("liveAddressText"))
      $("liveAddressText").textContent =
        "Geolocalización no soportada por el navegador";
    return;
  }

  watchPositionId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      userCoords = { lat, lng };

      if (userMarker) {
        userMarker.setLatLng([lat, lng]);
      }
      if (modalUserMarker) {
        modalUserMarker.setLatLng([lat, lng]);
      }
      if (leafletMap) {
        leafletMap.panTo([lat, lng]);
      }

      if ($("liveCoordsText")) {
        $("liveCoordsText").textContent =
          `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
      }
      if ($("modalCoordsText")) {
        $("modalCoordsText").textContent =
          `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
      }

      // Geocodificación inversa simulada / real con OSM Nominatim
      fetchAddressFromCoords(lat, lng);
    },
    (err) => {
      console.warn("GPS Error/Permiso denegado:", err.message);
      if ($("liveAddressText"))
        $("liveAddressText").textContent = "Ubicación basada en IP aproximada";
      if ($("liveCoordsText"))
        $("liveCoordsText").textContent =
          `Lat: ${userCoords.lat.toFixed(4)}, Lng: ${userCoords.lng.toFixed(4)}`;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
  );
}

function fetchAddressFromCoords(lat, lng) {
  fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
  )
    .then((res) => res.json())
    .then((data) => {
      const address =
        data.display_name ||
        `${data.address?.road || "Calle sin nombre"}, ${data.address?.city || "Ciudad"}`;
      if ($("liveAddressText")) $("liveAddressText").textContent = address;
      if ($("modalAddressText")) $("modalAddressText").textContent = address;
      if ($("homeLocationPreview"))
        $("homeLocationPreview").textContent = address.split(",")[0];
    })
    .catch(() => {
      if ($("liveAddressText"))
        $("liveAddressText").textContent =
          `Sector Urbano (Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})`;
    });
}

// ── COMPARTIR UBICACIÓN ──────────────────────────────────────
function initShareLocation() {
  const shareBtn = $("shareLocationBtn");
  if (!shareBtn) return;

  shareBtn.addEventListener("click", () => {
    const mapsUrl = `https://maps.google.com/?q=${userCoords.lat},${userCoords.lng}`;
    const shareText = `🚨 ¡ALERTA SOS911! Mi ubicación en tiempo real es: ${mapsUrl}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(shareText)
        .then(() =>
          showToast(
            "🔗 Enlace de ubicación copiado al portapapeles",
            "#16A34A",
          ),
        )
        .catch(() => showToast("📍 Coordenadas: " + mapsUrl, "#2563EB", 5000));
    } else {
      showToast("📍 Coordenadas: " + mapsUrl, "#2563EB", 5000);
    }
  });
}

// ── LÓGICA DE PRESIONAR 3 SEGUNDOS (BOTÓN DE PÁNICO) ─────────
const HOLD_DURATION_MS = 3000;
const HOLD_INTERVAL_MS = 30;
const HOLD_STEP = (HOLD_INTERVAL_MS / HOLD_DURATION_MS) * 100;

function initPanicButtons() {
  $$(".panic-btn").forEach((btn) => {
    // Touch Events
    btn.addEventListener(
      "touchstart",
      (e) => {
        if (e.cancelable) e.preventDefault();
        startHold(btn);
      },
      { passive: false },
    );
    btn.addEventListener("touchend", cancelHold);
    btn.addEventListener("touchcancel", cancelHold);
    btn.addEventListener("touchmove", cancelHold);

    // Mouse Events
    btn.addEventListener("mousedown", () => startHold(btn));
    btn.addEventListener("mouseup", cancelHold);
    btn.addEventListener("mouseleave", cancelHold);
  });
}

function startHold(btn) {
  if (state.status === "EMERGENCY") {
    showToast("⚡ Alerta de emergencia ya está activa", "#DC2626");
    navigateTo("view-map");
    return;
  }
  if (holdTimer) return;

  holdBtn = btn;
  holdProgress = 0;
  btn.classList.add("holding");

  const holdBar = btn.querySelector(".pb-hold-bar");
  if (holdBar) holdBar.style.width = "0%";

  if (navigator.vibrate) navigator.vibrate(50);

  holdTimer = setInterval(() => {
    holdProgress = Math.min(holdProgress + HOLD_STEP, 100);
    if (holdBar) holdBar.style.width = holdProgress + "%";

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
  if (holdBtn) {
    const holdBar = holdBtn.querySelector(".pb-hold-bar");
    if (holdBar) {
      holdBar.style.transition = "width 0.2s ease";
      holdBar.style.width = "0%";
      setTimeout(() => {
        holdBar.style.transition = "none";
      }, 200);
    }
    holdBtn.classList.remove("holding");
    holdBtn = null;
  }
  holdProgress = 0;
}

function finishHold() {
  clearInterval(holdTimer);
  holdTimer = null;

  const btn = holdBtn;
  if (holdBtn) {
    holdBtn.classList.remove("holding");
    const holdBar = holdBtn.querySelector(".pb-hold-bar");
    if (holdBar) holdBar.style.width = "0%";
    holdBtn = null;
  }
  holdProgress = 0;

  if (btn) {
    const type = btn.dataset.type || "general";
    const name = btn.dataset.name || "Emergencia General";
    const icon = btn.dataset.icon || "warning";

    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);

    activateEmergency(type, name, icon);
  }
}

// ── ACTIVACIÓN Y DESPACHO DE EMERGENCIA ───────────────────────
function activateEmergency(type, name, icon) {
  state.status = "EMERGENCY";
  state.incident = {
    id: `INC-${Date.now()}`,
    type,
    name,
    icon,
    ts: new Date().toISOString(),
    lat: userCoords.lat,
    lng: userCoords.lng,
  };
  saveState();

  // Actualizar UI
  if ($("emergencyBanner")) $("emergencyBanner").classList.remove("hidden");
  if ($("ebTitle"))
    $("ebTitle").textContent = `⚡ ALERTA ACTIVADA: ${name.toUpperCase()}`;
  if ($("statusLabel")) $("statusLabel").textContent = "¡EMERGENCIA ACTIVA!";
  if ($("statusDot")) {
    $("statusDot").className = "status-dot-mini red";
  }
  if ($("cancelEmergencyBtn"))
    $("cancelEmergencyBtn").classList.remove("hidden");
  if ($("dispatchSection")) $("dispatchSection").style.display = "block";

  // Mostrar tarjeta médica en Home
  showMedicalBannerCard();

  // Cambiar vista al mapa
  navigateTo("view-map");
  showToast(
    `🚨 ¡ALERTA DE ${name.toUpperCase()} TRANSMITIDA!`,
    "#DC2626",
    4000,
  );

  // Iniciar Contador
  emergencySeconds = 0;
  updateEmergencyTimerText();
  if (emergencyTimer) clearInterval(emergencyTimer);
  emergencyTimer = setInterval(emergencyTick, 1000);

  // Reiniciar timeline y simular notificaciones
  resetTimeline();
  simulateContactsNotified();
  addChatMsg(
    "system",
    `🚨 Alerta de ${name} generada en Lat: ${userCoords.lat.toFixed(4)}, Lng: ${userCoords.lng.toFixed(4)}.`,
  );

  // Incluir ficha médica en el canal de despacho
  const u = state.user || {};
  if (u.bloodType || u.condition || u.allergies || u.emergencyContactName) {
    const medInfo = [
      u.bloodType ? `🩸 Sangre: ${u.bloodType}` : null,
      u.age ? `👤 Edad: ${u.age} años` : null,
      u.condition ? `⚕️ Condición: ${u.condition}` : null,
      u.allergies ? `⚠️ Alergias: ${u.allergies}` : null,
      u.emergencyContactName
        ? `📞 Contacto: ${u.emergencyContactName} ${u.emergencyContactPhone}`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");
    addChatMsg("system", `📋 Ficha Médica del Ciudadano → ${medInfo}`);
  }
}

function emergencyTick() {
  emergencySeconds++;
  updateEmergencyTimerText();
  runDispatchSimulation(emergencySeconds);
}

function updateEmergencyTimerText() {
  const m = String(Math.floor(emergencySeconds / 60)).padStart(2, "0");
  const s = String(emergencySeconds % 60).padStart(2, "0");
  if ($("ebTimer")) $("ebTimer").textContent = `Tiempo activo: ${m}:${s}`;
}

function resetTimeline() {
  ["tl1", "tl2", "tl3", "tl4"].forEach((id) => {
    const el = $(id);
    if (el) el.className = "timeline-step";
  });
  if ($("tl1")) $("tl1").classList.add("active");
}

function runDispatchSimulation(s) {
  if (s === 4) {
    markStep("tl1", "done");
    markStep("tl2", "active");
    if ($("tl2desc"))
      $("tl2desc").textContent = "Unidad Policial #14 de Cuadrante asignada.";
    addChatMsg("system", "Central ECU-911: Unidad Patrulla #14 despachada.");
  }
  if (s === 8) {
    addChatMsg(
      "neighbor",
      "Ana García: ¡Hijo, recibí tu alerta! Ya llamé a la policía local.",
    );
  }
  if (s === 14) {
    markStep("tl2", "done");
    markStep("tl3", "active");
    if ($("tl3desc"))
      $("tl3desc").textContent = "Patrulla en movimiento (ETA 2 minutos).";
    addChatMsg(
      "system",
      "Oficial en Ruta: Nos aproximamos por la avenida principal.",
    );
    addPoliceMarkerOnMap();
  }
  if (s === 22) {
    addChatMsg(
      "neighbor",
      "Carlos Ruiz: Estoy a 2 cuadras, voy para tu posición.",
    );
  }
  if (s === 35) {
    markStep("tl3", "done");
    markStep("tl4", "active");
    addChatMsg(
      "system",
      "Oficial en Escena: Patrulla 14 ha arribado a la ubicación.",
    );
  }
}

function markStep(id, stateClass) {
  const el = $(id);
  if (el) {
    if (stateClass === "done") {
      el.classList.remove("active");
      el.classList.add("done");
    } else if (stateClass === "active") {
      el.classList.add("active");
    }
  }
}

function addPoliceMarkerOnMap() {
  if (!leafletMap) return;
  if (policeMarker) leafletMap.removeLayer(policeMarker);

  const policeIcon = L.divIcon({
    className: "police-gps-marker",
    html: `<div style="background:#2563EB; width:26px; height:26px; border-radius:50%; border:3px solid white; box-shadow:0 0 15px #2563EB; display:flex; align-items:center; justify-content:center; color:white; font-size:12px;">🚔</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

  const pLat = userCoords.lat + 0.003;
  const pLng = userCoords.lng + 0.003;

  policeMarker = L.marker([pLat, pLng], { icon: policeIcon }).addTo(leafletMap);
  policeMarker
    .bindPopup("<b>Patrulla ECU911 #14</b><br>En camino a tu posición")
    .openPopup();
}

function simulateContactsNotified() {
  const container = $("notifiedContactsList");
  if (!container) return;

  const contacts = getContacts();
  if (contacts.length === 0) {
    container.innerHTML = `<p class="empty-state-text">No tienes contactos registrados en tu Red de Apoyo.</p>`;
    return;
  }

  container.innerHTML = contacts
    .map(
      (c) => `
    <div class="contact-item">
      <div class="contact-avatar"><span class="material-symbols-rounded">person</span></div>
      <div class="contact-details">
        <strong>${escHtml(c.name)}</strong>
        <span>${escHtml(c.phone)}</span>
      </div>
      <span class="status-dot-mini green" title="SMS Enviado"></span>
    </div>
  `,
    )
    .join("");
}

function addChatMsg(cls, text) {
  const feed = $("chatFeed");
  if (!feed) return;
  const item = document.createElement("div");
  item.className = `chat-msg ${cls}`;
  item.innerHTML = escHtml(text);
  feed.appendChild(item);
  feed.scrollTop = feed.scrollHeight;
}

// ── MODAL CANCELAR Y RESOLVER EMERGENCIA ──────────────────────
function initResolutionModal() {
  const cancelBtn = $("cancelEmergencyBtn");
  const backdrop = $("resolutionBackdrop");
  const dismissBtn = $("rmDismiss");
  const rmCancelBtn = $("rmCancelBtn");
  const submitBtn = $("rmSubmit");

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => backdrop.classList.add("open"));
  }
  if (dismissBtn) {
    dismissBtn.addEventListener("click", () =>
      backdrop.classList.remove("open"),
    );
  }
  if (rmCancelBtn) {
    rmCancelBtn.addEventListener("click", () =>
      backdrop.classList.remove("open"),
    );
  }
  if (submitBtn) {
    submitBtn.addEventListener("click", submitResolution);
  }
}

function submitResolution() {
  const textInput = $("rmText");
  const text = textInput ? textInput.value.trim() : "";

  if (text.length < 6) {
    showToast(
      "⚠️ Escriba un informe explicativo (mínimo 6 caracteres).",
      "#D97706",
    );
    return;
  }

  const currentInc = state.incident || { type: "general", name: "Alerta" };

  // Guardar en historial de logs
  const logItem = {
    id: currentInc.id || `INC-${Date.now()}`,
    type: currentInc.type,
    name: currentInc.name,
    icon: currentInc.icon || "warning",
    ts: currentInc.ts || new Date().toISOString(),
    closedTs: new Date().toISOString(),
    resolution: text,
    lat: userCoords.lat,
    lng: userCoords.lng,
  };

  state.logs.unshift(logItem);
  state.status = "SECURE";
  state.incident = null;
  saveState();

  // Limpiar temporizadores
  if (emergencyTimer) clearInterval(emergencyTimer);
  emergencyTimer = null;
  emergencySeconds = 0;

  // Reset UI
  if ($("emergencyBanner")) $("emergencyBanner").classList.add("hidden");
  if ($("statusLabel")) $("statusLabel").textContent = "Sistema Seguro";
  if ($("statusDot")) $("statusDot").className = "status-dot-mini green";
  if ($("cancelEmergencyBtn")) $("cancelEmergencyBtn").classList.add("hidden");
  if ($("dispatchSection")) $("dispatchSection").style.display = "none";
  // Ocultar tarjeta médica
  if ($("medicalBannerCard")) $("medicalBannerCard").classList.add("hidden");

  if ($("resolutionBackdrop")) $("resolutionBackdrop").classList.remove("open");
  if (textInput) textInput.value = "";

  renderLogs();
  showToast(
    "✅ Alerta finalizada. Incidente guardado en historial.",
    "#16A34A",
  );
  navigateTo("view-history");
}

// ── GESTIÓN DE CONTACTOS (RF-02) ──────────────────────────────
function renderContacts() {
  const container = $("contactsListContainer");
  if (!container) return;

  const contacts = getContacts();
  if (contacts.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 24px; color: var(--text-muted); font-size: 13px;">
        No tienes contactos de confianza registrados.<br>Agrega uno en el formulario de abajo.
      </div>`;
    return;
  }

  container.innerHTML = contacts
    .map(
      (c) => `
    <div class="contact-item">
      <div class="contact-avatar"><span class="material-symbols-rounded">person</span></div>
      <div class="contact-details">
        <strong>${escHtml(c.name)}</strong>
        <span>${escHtml(c.phone)} ${c.relation ? "• " + escHtml(c.relation) : ""}</span>
      </div>
      <div class="contact-actions">
        <button class="icon-action-btn" onclick="openEditContact(${c.id})" title="Editar">
          <span class="material-symbols-rounded">edit</span>
        </button>
        <button class="icon-action-btn delete" onclick="deleteContact(${c.id})" title="Eliminar">
          <span class="material-symbols-rounded">delete</span>
        </button>
      </div>
    </div>
  `,
    )
    .join("");
}

function initContactForm() {
  const form = $("addContactForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameIn = $("contactNameInput");
    const phoneIn = $("contactPhoneInput");
    const relIn = $("contactRelationInput");

    const name = nameIn?.value.trim();
    const phone = phoneIn?.value.trim();
    const relation = relIn?.value.trim();

    if (!name || !phone) {
      showToast("⚠️ Ingrese nombre y teléfono", "#D97706");
      return;
    }

    const contacts = getContacts();
    const newId = contacts.length
      ? Math.max(...contacts.map((c) => c.id)) + 1
      : 1;
    contacts.push({ id: newId, name, phone, relation });

    saveContacts(contacts);

    if (nameIn) nameIn.value = "";
    if (phoneIn) phoneIn.value = "";
    if (relIn) relIn.value = "";

    showToast("✅ Contacto guardado con éxito", "#16A34A");
  });
}

window.deleteContact = function (id) {
  const contacts = getContacts().filter((c) => c.id !== id);
  saveContacts(contacts);
  showToast("Contacto eliminado", "#475569");
};

window.openEditContact = function (id) {
  const contacts = getContacts();
  const c = contacts.find((item) => item.id === id);
  if (!c) return;

  $("editContactId").value = c.id;
  $("editContactName").value = c.name;
  $("editContactPhone").value = c.phone;
  $("editContactRelation").value = c.relation || "";

  $("editContactModal").classList.add("open");
};

function initEditContactModal() {
  const modal = $("editContactModal");
  const closeBtn = $("closeEditContactModal");
  const form = $("editContactForm");

  if (closeBtn) {
    closeBtn.addEventListener("click", () => modal.classList.remove("open"));
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = Number($("editContactId").value);
      const name = $("editContactName").value.trim();
      const phone = $("editContactPhone").value.trim();
      const relation = $("editContactRelation").value.trim();

      const contacts = getContacts();
      const idx = contacts.findIndex((c) => c.id === id);
      if (idx !== -1) {
        contacts[idx] = { id, name, phone, relation };
        saveContacts(contacts);
        modal.classList.remove("open");
        showToast("✅ Contacto actualizado", "#16A34A");
      }
    });
  }
}

function updateHomeContactCount() {
  const count = getContacts().length;
  if ($("homeContactCount")) {
    $("homeContactCount").textContent =
      `${count} contacto${count !== 1 ? "s" : ""} listo${count !== 1 ? "s" : ""}`;
  }
}

// ── PERFIL DE USUARIO (RF-01) — EXTENDIDO ─────────────────────
// ── PERFIL DE USUARIO (RF-01) — EXTENDIDO ─────────────────────
function initProfileModal() {
  const openBtn = $("openProfileBtn");
  const closeBtn = $("closeProfileModal");
  const backdrop = $("profileModalBackdrop");
  const form = $("profileForm");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      const u = state.user || DEFAULT_PROFILE;
      if ($("userNameInput")) $("userNameInput").value = u.name || "";
      if ($("userPhoneInput")) $("userPhoneInput").value = u.phone || "";
      if ($("userEmailInput")) $("userEmailInput").value = u.email || "";
      if ($("userAddressInput")) $("userAddressInput").value = u.address || "";

      if ($("profileAge")) $("profileAge").value = u.age || "";
      if ($("profileBloodType"))
        $("profileBloodType").value = u.bloodType || "";
      if ($("profileCondition"))
        $("profileCondition").value = u.condition || "";
      if ($("profileAllergies"))
        $("profileAllergies").value = u.allergies || "";
      if ($("profileMedication"))
        $("profileMedication").value = u.medication || "";
      if ($("profileInsurance"))
        $("profileInsurance").value = u.insurance || "";
      if ($("profileNotes")) $("profileNotes").value = u.notes || "";

      if ($("profileEcName"))
        $("profileEcName").value = u.emergencyContactName || "";
      if ($("profileEcPhone"))
        $("profileEcPhone").value = u.emergencyContactPhone || "";

      // Clear errors
      $$(".form-error-msg").forEach((el) => (el.textContent = ""));

      backdrop.classList.add("open");
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => backdrop.classList.remove("open"));
  }

  const logoutBtn = $("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      logoutUser();
    });
  }

  // Profile Tabs Logic
  const pTabs = $$(".profile-tab");
  const pContents = $$(".profile-tab-content");
  if (pTabs.length > 0) {
    pTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        // Deactivate all
        pTabs.forEach((t) => t.classList.remove("active"));
        pContents.forEach((c) => c.classList.add("hidden"));
        // Activate clicked
        tab.classList.add("active");
        const targetId = tab.getAttribute("data-ptab");
        const targetContent = $(targetId);
        if (targetContent) {
          targetContent.classList.remove("hidden");
        }
      });
    });
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      // Limpiar errores previos
      $$(".form-error-msg").forEach((el) => (el.textContent = ""));
      let hasError = false;

      // Obtener valores
      const age = $("profileAge") ? $("profileAge").value.trim() : "";
      const bloodType = $("profileBloodType")
        ? $("profileBloodType").value
        : "";
      const ecPhone = $("profileEcPhone")
        ? $("profileEcPhone").value.trim()
        : "";

      // Validar Edad
      if (!age) {
        if ($("err-profileAge"))
          $("err-profileAge").textContent = "La edad es obligatoria.";
        hasError = true;
      } else {
        const ageNum = parseInt(age, 10);
        if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
          if ($("err-profileAge"))
            $("err-profileAge").textContent =
              "Ingresa una edad válida (1-120).";
          hasError = true;
        }
      }

      // Validar Tipo de Sangre
      if (!bloodType) {
        if ($("err-profileBloodType"))
          $("err-profileBloodType").textContent =
            "Selecciona un tipo de sangre.";
        hasError = true;
      }

      // Validar Teléfono de Contacto (solo números, +, espacios o -, min 9 dígitos numéricos)
      if (!ecPhone) {
        if ($("err-profileEcPhone"))
          $("err-profileEcPhone").textContent = "El teléfono es obligatorio.";
        hasError = true;
      } else {
        const digits = ecPhone.replace(/\D/g, "");
        if (digits.length < 9) {
          if ($("err-profileEcPhone"))
            $("err-profileEcPhone").textContent =
              "Mínimo 9 dígitos requeridos.";
          hasError = true;
        }
      }

      if (hasError) return; // Detener si hay errores

      // Solo actualizar campos médicos y de contacto
      state.user = Object.assign(state.user || {}, {
        age: age,
        bloodType: bloodType,
        condition: $("profileCondition")
          ? $("profileCondition").value.trim()
          : state.user?.condition || "",
        allergies: $("profileAllergies")
          ? $("profileAllergies").value.trim()
          : state.user?.allergies || "",
        medication: $("profileMedication")
          ? $("profileMedication").value.trim()
          : state.user?.medication || "",
        insurance: $("profileInsurance")
          ? $("profileInsurance").value
          : state.user?.insurance || "",
        notes: $("profileNotes")
          ? $("profileNotes").value.trim()
          : state.user?.notes || "",
        emergencyContactName: $("profileEcName")
          ? $("profileEcName").value.trim()
          : state.user?.emergencyContactName || "",
        emergencyContactPhone: ecPhone,
      });

      saveState();
      backdrop.classList.remove("open");
      showToast("✅ Cambios en la Ficha Médica guardados", "#16A34A");
    });
  }
}

// ── HISTORIAL DE LOGS (RF-05) ─────────────────────────────────
function renderLogs() {
  const container = $("logsList");
  if (!container) return;

  if (!state.logs || state.logs.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 32px 16px; color: var(--text-muted); font-size: 13px;">
        No hay alertas o emergencias registradas en el historial.
      </div>`;
    return;
  }

  container.innerHTML = state.logs
    .map(
      (log) => `
    <div class="contact-item" style="align-items:flex-start;">
      <div class="contact-avatar" style="background:rgba(220,38,38,0.15); color:var(--primary-red-hover);">
        <span class="material-symbols-rounded">${log.icon || "warning"}</span>
      </div>
      <div class="contact-details">
        <strong>${escHtml(log.name)} — Finalizada</strong>
        <span style="color:var(--accent-indigo); font-size:10px; margin:2px 0;">Fecha: ${new Date(log.closedTs || log.ts).toLocaleString()}</span>
        <span style="color:white; margin-top:4px;"><b>Informe:</b> ${escHtml(log.resolution)}</span>
      </div>
    </div>
  `,
    )
    .join("");
}

// ── LLAMADA DIRECTA AL 911 ────────────────────────────────────
function initDirectCall() {
  const callBtn = $("directCallBtn");
  if (callBtn) {
    callBtn.addEventListener("click", () => {
      showToast(
        "📞 Iniciando llamada de emergencia al 911...",
        "#DC2626",
        4000,
      );
      window.location.href = "tel:911";
    });
  }
}

// ── TARJETA MÉDICA EN HOME ────────────────────────────────────
function showMedicalBannerCard() {
  const card = $("medicalBannerCard");
  if (!card) return;

  const u = state.user || {};
  if ($("mbcBlood")) $("mbcBlood").textContent = u.bloodType || "—";
  if ($("mbcCondition"))
    $("mbcCondition").textContent = u.condition || "Ninguna registrada";
  if ($("mbcAllergies"))
    $("mbcAllergies").textContent = u.allergies || "Ninguna registrada";
  if ($("mbcContact"))
    $("mbcContact").textContent = u.emergencyContactName
      ? `${u.emergencyContactName} ${u.emergencyContactPhone || ""}`.trim()
      : "—";

  card.classList.remove("hidden");
}

function initMedicalBannerClose() {
  const closeBtn = $("closeMedicalBanner");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      const card = $("medicalBannerCard");
      if (card) card.classList.add("hidden");
    });
  }
}

// ── AUTENTICACIÓN (PANTALLA LOGIN / REGISTRO) ─────────────────
/**
 * Hash simple (no criptográfico) para almacenamiento local.
 * Solo para verificación de identidad en localStorage.
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return "H" + Math.abs(hash).toString(36);
}

function getAccountsDB() {
  try {
    const raw = localStorage.getItem("sos911_accounts_db");
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveAccountsDB(db) {
  localStorage.setItem("sos911_accounts_db", JSON.stringify(db));
}

function getAuthUser() {
  try {
    const raw = localStorage.getItem("sos911_auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function saveAuthUser(data) {
  localStorage.setItem("sos911_auth_user", JSON.stringify(data));
}

function dismissAuth() {
  const authScreen = $("authScreen");
  if (authScreen) authScreen.classList.add("hidden");
}

function renderSavedAccounts() {
  const container = $("savedAccountsContainer");
  const list = $("savedAccountsList");
  if (!container || !list) return;

  const db = getAccountsDB();
  const emails = Object.keys(db);

  if (emails.length === 0) {
    container.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  container.classList.remove("hidden");
  list.innerHTML = emails
    .map((email) => {
      const acc = db[email];
      const initial = (acc.name ? acc.name.charAt(0) : "U").toUpperCase();
      return `
      <div class="account-chip" data-email="${email}">
        <div class="account-chip-main">
          <div class="account-chip-icon">${initial}</div>
          <div class="account-chip-info">
            <span class="account-chip-name">${acc.name || "Usuario"}</span>
            <span class="account-chip-email">${email}</span>
          </div>
        </div>
        <button type="button" class="account-chip-remove" title="Quitar cuenta de este dispositivo" data-remove="${email}">
          <span class="material-symbols-rounded" style="font-size: 1.1rem;">close</span>
        </button>
      </div>
    `;
    })
    .join("");

  list.querySelectorAll(".account-chip").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      if (e.target.closest(".account-chip-remove")) return;
      const email = chip.getAttribute("data-email");
      const emailInput = $("loginEmail");
      const pwdInput = $("loginPassword");
      if (emailInput) {
        emailInput.value = email;
        const validBadge = $("loginEmailValid");
        if (validBadge) validBadge.classList.remove("hidden");
      }
      if (pwdInput) pwdInput.focus();
    });
  });

  list.querySelectorAll(".account-chip-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const emailToRemove = btn.getAttribute("data-remove");
      if (emailToRemove) {
        const currentDb = getAccountsDB();
        delete currentDb[emailToRemove];
        saveAccountsDB(currentDb);
        renderSavedAccounts();
        showToast("🗑️ Cuenta removida del dispositivo", "#64748B");
      }
    });
  });
}

function logoutUser() {
  const authUser = getAuthUser();
  if (authUser) {
    authUser.isLoggedIn = false;
    saveAuthUser(authUser);
  }
  const backdrop = $("profileModalBackdrop");
  if (backdrop) backdrop.classList.remove("open");

  const authScreen = $("authScreen");
  if (authScreen) authScreen.classList.remove("hidden");

  const loginEmail = $("loginEmail");
  const loginPassword = $("loginPassword");
  if (loginEmail) loginEmail.value = "";
  if (loginPassword) loginPassword.value = "";

  renderSavedAccounts();
  showToast("🚪 Sesión cerrada correctamente", "#2563EB");
}

function showOnboarding() {
  const screen = $("onboardingScreen");
  if (screen) {
    screen.classList.remove("hidden");
    // Pre-rellenar si ya tiene datos
    const u = state.user || {};
    if ($("obAge")) $("obAge").value = u.age || "";
    if ($("obBloodType")) $("obBloodType").value = u.bloodType || "";
    if ($("obCondition")) $("obCondition").value = u.condition || "";
    if ($("obAllergies")) $("obAllergies").value = u.allergies || "";
    if ($("obEcName")) $("obEcName").value = u.emergencyContactName || "";
    if ($("obEcPhone")) $("obEcPhone").value = u.emergencyContactPhone || "";
  }
}

function initAuthScreen() {
  const authScreen = $("authScreen");
  const loginForm = $("loginForm");
  const registerForm = $("registerForm");
  const tabLoginBtn = $("tabLoginBtn");
  const tabRegisterBtn = $("tabRegisterBtn");
  const toggleLoginPwd = $("toggleLoginPwd");
  const toggleRegPwd = $("toggleRegPwd");

  // Renderizar cuentas guardadas en el dispositivo
  renderSavedAccounts();

  // Escuchar correo válido en tiempo real
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const loginEmailInp = $("loginEmail");
  const regEmailInp = $("regEmail");

  if (loginEmailInp) {
    loginEmailInp.addEventListener("input", () => {
      const badge = $("loginEmailValid");
      if (badge) {
        if (emailRegex.test(loginEmailInp.value.trim())) {
          badge.classList.remove("hidden");
        } else {
          badge.classList.add("hidden");
        }
      }
    });
  }

  if (regEmailInp) {
    regEmailInp.addEventListener("input", () => {
      const badge = $("regEmailValid");
      if (badge) {
        if (emailRegex.test(regEmailInp.value.trim())) {
          badge.classList.remove("hidden");
        } else {
          badge.classList.add("hidden");
        }
      }
    });
  }

  // Verificar si ya hay sesión activa
  const authUser = getAuthUser();
  if (authUser && authUser.registered && authUser.isLoggedIn !== false) {
    dismissAuth();
    return;
  }

  // Mostrar pantalla de auth
  if (authScreen) authScreen.classList.remove("hidden");

  // Tabs switch
  function switchTab(activeTab, activeForm, inactiveTab, inactiveForm) {
    activeTab.classList.add("active");
    inactiveTab.classList.remove("active");
    activeForm.classList.remove("hidden");
    inactiveForm.classList.add("hidden");
  }

  if (tabLoginBtn && tabRegisterBtn) {
    tabLoginBtn.addEventListener("click", () =>
      switchTab(tabLoginBtn, loginForm, tabRegisterBtn, registerForm),
    );
    tabRegisterBtn.addEventListener("click", () =>
      switchTab(tabRegisterBtn, registerForm, tabLoginBtn, loginForm),
    );
  }

  // Toggle contraseña — Login
  if (toggleLoginPwd) {
    toggleLoginPwd.addEventListener("click", () => {
      const inp = $("loginPassword");
      const icon = toggleLoginPwd.querySelector("span");
      if (inp.type === "password") {
        inp.type = "text";
        icon.textContent = "visibility_off";
      } else {
        inp.type = "password";
        icon.textContent = "visibility";
      }
    });
  }

  // Toggle contraseña — Registro
  if (toggleRegPwd) {
    toggleRegPwd.addEventListener("click", () => {
      const inp = $("regPassword");
      const icon = toggleRegPwd.querySelector("span");
      if (inp.type === "password") {
        inp.type = "text";
        icon.textContent = "visibility_off";
      } else {
        inp.type = "password";
        icon.textContent = "visibility";
      }
    });
  }

  // SUBMIT LOGIN
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = $("loginEmail")?.value.trim().toLowerCase();
      const password = $("loginPassword")?.value;

      if (!email || !password) {
        showToast("⚠️ Ingresa tu correo y contraseña", "#D97706");
        return;
      }

      const db = getAccountsDB();
      let account = db[email];

      // Migración de datos legados si existía una cuenta sin db
      const legacyUser = getAuthUser();
      if (
        !account &&
        legacyUser &&
        legacyUser.registered &&
        legacyUser.email === email
      ) {
        account = legacyUser;
        db[email] = account;
        saveAccountsDB(db);
      }

      if (!account || !account.registered) {
        showToast("❌ No existe cuenta registrada con este correo.", "#DC2626");
        return;
      }

      if (account.passwordHash !== simpleHash(password)) {
        showToast("❌ Contraseña incorrecta.", "#DC2626");
        return;
      }

      saveAuthUser({ ...account, isLoggedIn: true });

      if (!state.user) state.user = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
      state.user.name = account.name || "Usuario";
      state.user.email = account.email;
      saveState();

      showToast(
        `✅ ¡Bienvenido de nuevo, ${account.name || "Usuario"}!`,
        "#16A34A",
      );
      dismissAuth();
    });
  }

  // SUBMIT REGISTRO
  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("regName")?.value.trim();
      const email = $("regEmail")?.value.trim().toLowerCase();
      const password = $("regPassword")?.value;

      if (!name) {
        showToast("⚠️ Ingresa tu nombre", "#D97706");
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        showToast("⚠️ Ingresa un formato de correo válido", "#D97706");
        return;
      }
      if (email.includes("hotmil.com") || email.includes("gmil.com")) {
        showToast(
          "⚠️ Parece haber un error tipográfico en el dominio de tu correo",
          "#D97706",
        );
        return;
      }

      if (!password || password.length < 6) {
        showToast(
          "⚠️ La contraseña debe tener al menos 6 caracteres",
          "#D97706",
        );
        return;
      }

      const db = getAccountsDB();
      const newAccount = {
        name,
        email,
        passwordHash: simpleHash(password),
        registered: true,
      };
      db[email] = newAccount;
      saveAccountsDB(db);

      saveAuthUser({ ...newAccount, isLoggedIn: true });

      // Actualizar nombre en el perfil del estado
      if (!state.user) state.user = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
      state.user.name = name;
      state.user.email = email;
      saveState();

      showToast(`🎉 Cuenta creada. ¡Bienvenido, ${name}!`, "#16A34A", 3000);
      dismissAuth();

      // Mostrar Onboarding solo si aún no se completó
      const onboardingDone = localStorage.getItem("sos911_onboarding_done");
      if (!onboardingDone) {
        setTimeout(() => showOnboarding(), 400);
      }
    });
  }
}

// ── ONBOARDING — FICHA DE EMERGENCIA ─────────────────────────
function initOnboardingScreen() {
  const form = $("onboardingForm");
  const skipBtn = $("onboardingSkipBtn");
  const screen = $("onboardingScreen");

  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      localStorage.setItem("sos911_onboarding_done", "1");
      if (screen) screen.classList.add("hidden");
      showToast(
        "📋 Puedes completar tu ficha médica desde el ícono de perfil",
        "#2563EB",
        4000,
      );
    });
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const age = $("obAge")?.value.trim();
      const bloodType = $("obBloodType")?.value;
      const condition = $("obCondition")?.value.trim();
      const allergies = $("obAllergies")?.value.trim();
      const ecName = $("obEcName")?.value.trim();
      const ecPhone = $("obEcPhone")?.value.trim();

      if (!state.user) state.user = JSON.parse(JSON.stringify(DEFAULT_PROFILE));

      state.user.age = age;
      state.user.bloodType = bloodType;
      state.user.condition = condition;
      state.user.allergies = allergies;
      state.user.emergencyContactName = ecName;
      state.user.emergencyContactPhone = ecPhone;

      saveState();
      localStorage.setItem("sos911_onboarding_done", "1");

      if (screen) screen.classList.add("hidden");
      showToast("✅ Ficha de emergencia guardada correctamente", "#16A34A");
    });
  }
}

// ── CONTROLES NUMÉRICOS PERSONALIZADOS ────────────────────────
function initNumberInputControls() {
  const setupControls = (inputId, decBtnId, incBtnId) => {
    const input = $(inputId);
    const decBtn = $(decBtnId);
    const incBtn = $(incBtnId);
    if (!input || !decBtn || !incBtn) return;

    const getMin = () => parseInt(input.min || 1, 10);
    const getMax = () => parseInt(input.max || 120, 10);

    decBtn.addEventListener("click", () => {
      let val = parseInt(input.value, 10);
      if (isNaN(val)) val = getMin();
      else val--;
      if (val < getMin()) val = getMin();
      input.value = val;
    });

    incBtn.addEventListener("click", () => {
      let val = parseInt(input.value, 10);
      if (isNaN(val)) val = getMin();
      else val++;
      if (val > getMax()) val = getMax();
      input.value = val;
    });
  };

  setupControls("profileAge", "btn-dec-profileAge", "btn-inc-profileAge");
  setupControls("obAge", "btn-dec-obAge", "btn-inc-obAge");
}

// ── ACCESIBILIDAD: TEMA Y FUENTE ────────────────────────────
const PREFS_KEY = "sos911_app_prefs";
const FONT_STEPS = [87.5, 100, 112.5, 125, 137.5];
const DEFAULT_FONT_INDEX = 1; // 100%

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function applyFontScale(pct) {
  document.documentElement.style.fontSize = pct + "%";
}

function initAccessibilitySettings() {
  const prefs = loadPrefs();
  const theme = prefs.theme || "dark";
  const fontIdx =
    typeof prefs.fontIndex === "number" ? prefs.fontIndex : DEFAULT_FONT_INDEX;

  // Apply stored values immediately
  applyTheme(theme);
  applyFontScale(FONT_STEPS[fontIdx]);

  // Theme toggle
  const toggle = $("themeToggle");
  if (toggle) {
    toggle.checked = theme === "light";
    toggle.addEventListener("change", () => {
      const newTheme = toggle.checked ? "light" : "dark";
      applyTheme(newTheme);
      const p = loadPrefs();
      p.theme = newTheme;
      savePrefs(p);
    });
  }

  // Font controls
  const btnDec = $("btnFontDec");
  const btnInc = $("btnFontInc");
  const indicator = $("fontSizeIndicator");
  let currentIdx = fontIdx;

  function updateFontUI() {
    if (indicator) indicator.textContent = FONT_STEPS[currentIdx] + "%";
    if (btnDec) btnDec.disabled = currentIdx <= 0;
    if (btnInc) btnInc.disabled = currentIdx >= FONT_STEPS.length - 1;
  }

  updateFontUI();

  if (btnDec) {
    btnDec.addEventListener("click", () => {
      if (currentIdx > 0) {
        currentIdx--;
        applyFontScale(FONT_STEPS[currentIdx]);
        updateFontUI();
        const p = loadPrefs();
        p.fontIndex = currentIdx;
        savePrefs(p);
      }
    });
  }

  if (btnInc) {
    btnInc.addEventListener("click", () => {
      if (currentIdx < FONT_STEPS.length - 1) {
        currentIdx++;
        applyFontScale(FONT_STEPS[currentIdx]);
        updateFontUI();
        const p = loadPrefs();
        p.fontIndex = currentIdx;
        savePrefs(p);
      }
    });
  }
}

// ── INICIALIZACIÓN PRINCIPAL ─────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initAccessibilitySettings();
  initNumberInputControls();
  initAuthScreen();
  initOnboardingScreen();
  initMedicalBannerClose();
  initNav();
  initPanicButtons();
  initResolutionModal();
  initContactForm();
  initEditContactModal();
  initProfileModal();
  initShareLocation();
  initDirectCall();

  renderContacts();
  renderLogs();
  updateHomeContactCount();

  // Si había una emergencia activa guardada
  if (state.status === "EMERGENCY" && state.incident) {
    activateEmergency(
      state.incident.type,
      state.incident.name,
      state.incident.icon,
    );
  }
});
