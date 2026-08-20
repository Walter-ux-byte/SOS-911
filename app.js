// ============================================================
//  SOS911 — app.js  |  Vanilla JS + Leaflet.js + SUPABASE
//  Este archivo reemplaza localStorage por Supabase (Auth + DB)
// ============================================================

// ════════════════════════════════════════════════════════════
//  🔌 CONFIGURACIÓN DE SUPABASE — COLOCA AQUÍ TUS CREDENCIALES
//  Las obtienes en: Supabase Dashboard > Project Settings > API
// ════════════════════════════════════════════════════════════
const SUPABASE_URL = "https://xdyzbhbphbaxpcnubkhl.supabase.co"; // <-- TU SUPABASE URL AQUÍ
const SUPABASE_ANON_KEY = "sb_publishable__zpxi2NHza9g_coifhctiw_i8jZkFJD";     // <-- TU ANON PUBLIC KEY AQUÍ

// El objeto global `supabase` lo crea el <script> del CDN que agregas en el HTML.
// Lo renombramos a `sb` para no chocar con ese namespace global.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_CONTACTS = [];

const DEFAULT_PROFILE = {
  name: "Usuario SOS911",
  phone: "",
  email: "",
  address: "",
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

// ── ESTADO GLOBAL (ahora solo es una caché en memoria; la fuente
//    de verdad vive en las tablas de Supabase) ─────────────────
let state = {
  status: "SECURE", // 'SECURE' | 'EMERGENCY'
  incident: null, // { id (uuid de Supabase), type, name, icon, ts, lat, lng }
  user: JSON.parse(JSON.stringify(DEFAULT_PROFILE)),
};

let contactsCache = []; // Caché local de la tabla `contacts` del usuario actual
let logsCache = []; // Caché local de emergencias resueltas (tabla `emergencies`)

let leafletMap = null;
let modalLeafletMap = null;
let userMarker = null;
let modalUserMarker = null;
let policeMarker = null;
let modalPoliceMarker = null;
let userCoords = { lat: -0.180653, lng: -78.467838 }; // Quito, Ecuador por defecto
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

// ── PREFERENCIAS LOCALES (tema/fuente) ─────────────────────────
// Esto NO son datos de la app (perfil, contactos, emergencias), solo
// preferencias visuales del dispositivo, así que se quedan en localStorage.
const PREFS_KEY = "sos911_app_prefs";
const FONT_STEPS = [87.5, 100, 112.5, 125, 137.5];
const DEFAULT_FONT_INDEX = 1;

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

// ════════════════════════════════════════════════════════════
//  🔌 SUPABASE — MAPEO DE FILAS (snake_case DB → camelCase UI)
// ════════════════════════════════════════════════════════════
function mapProfileRowToState(row) {
  if (!row) return JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  // Soporta columnas en español (Supabase real) con fallback a inglés
  return {
    name:                 row.nombre                   || row.name                   || "",
    phone:                row.telefono                 || row.phone                  || "",
    email:                row.email                                                  || "",
    address:              row.direccion                || row.address                || "",
    age:                  row.edad                     ?? row.age                   ?? "",
    bloodType:            row["tipo de sangre"]         || row.blood_type             || "",
    condition:            row.enfermedad               || row.condition              || "",
    allergies:            row.alergias                 || row.allergies              || "",
    medication:           row.medicacion               || row.medication             || "",
    insurance:            row.seguro                   || row.insurance              || "",
    notes:                row.notas                    || row.notes                  || "",
    emergencyContactName: row["contacto de emergencia"]|| row.emergency_contact_name || "",
    emergencyContactPhone:row.telefono_emergencia      || row.emergency_contact_phone|| "",
    onboardingDone:       !!(row.onboarding_done),
  };
}

// ════════════════════════════════════════════════════════════
//  🔌 SUPABASE — PERFIL (tabla `profiles`)
// ════════════════════════════════════════════════════════════

// Carga (o crea si no existe) la fila de perfil del usuario autenticado.
async function loadUserProfile() {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  let { data: profile, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Supabase (profiles select):", error);
  }

  if (!profile) {
    // Primera vez del usuario: creamos su fila de perfil vacía
    const { data: created, error: insertErr } = await sb
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || "Usuario SOS911",
      })
      .select()
      .single();
    if (insertErr) console.error("Supabase (profiles insert):", insertErr);
    profile = created;
  }

  state.user = mapProfileRowToState(profile);
}

// Guarda (upsert) campos del perfil en Supabase. `fields` usa nombres
// de columna en snake_case, ej: { blood_type: "O+", age: 28 }
async function saveProfileToSupabase(fields) {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    showToast("⚠️ Debes iniciar sesión para guardar tu perfil.", "#D97706");
    return null;
  }

  const { data, error } = await sb
    .from("profiles")
    .upsert({ id: user.id, updated_at: new Date().toISOString(), ...fields })
    .select()
    .single();

  if (error) {
    console.error("Supabase (profiles upsert) ERROR:", error);
    showToast("❌ Error guardando el perfil: " + error.message, "#DC2626");
    return null;
  }
  console.log("Supabase (profiles upsert) OK — fila guardada:", data);
  return data;
}

// ════════════════════════════════════════════════════════════
//  🔌 SUPABASE — CONTACTOS DE CONFIANZA (tabla `contacts`)
// ════════════════════════════════════════════════════════════

// Vuelve a traer los contactos del usuario desde Supabase y re-renderiza.
async function refreshContacts() {
  const container1 = document.getElementById('contactsListContainer');
  if (container1) { container1.innerHTML = '<div class="skeleton-loader"></div><div class="skeleton-loader"></div>'; }
  await new Promise(r => setTimeout(r, 800)); // Premium UX Loading State
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    contactsCache = [];
    renderContactsUI();
    updateHomeContactCount();
    return;
  }

  const { data, error } = await sb
    .from("contacts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase (contacts select):", error);
    showToast("❌ Error cargando tus contactos", "#DC2626");
    contactsCache = [];
  } else {
    contactsCache = data;
  }

  renderContactsUI();
  updateHomeContactCount();
}

function renderContactsUI() {
  const container = $("contactsListContainer");
  if (!container) return;

  if (contactsCache.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 24px; color: var(--text-muted); font-size: 13px;">
        No tienes contactos de confianza registrados.<br>Agrega uno en el formulario de abajo.
      </div>`;
    return;
  }

  container.innerHTML = contactsCache
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

  form.addEventListener("submit", async (e) => {
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

    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      showToast("⚠️ Debes iniciar sesión", "#D97706");
      return;
    }

    // 🔌 Insertar el nuevo contacto en Supabase
    const { error } = await sb
      .from("contacts")
      .insert({ user_id: user.id, name, phone, relation });

    if (error) {
      console.error("Supabase (contacts insert):", error);
      showToast("❌ Error guardando el contacto", "#DC2626");
      return;
    }

    await refreshContacts();

    if (nameIn) nameIn.value = "";
    if (phoneIn) phoneIn.value = "";
    if (relIn) relIn.value = "";

    showToast("✅ Contacto guardado con éxito", "#16A34A");
  });
}

// Expuestas en window porque se llaman desde onclick="" en HTML generado
window.deleteContact = async function (id) {
  // 🔌 Eliminar contacto en Supabase (RLS garantiza que solo borra los suyos)
  const { error } = await sb.from("contacts").delete().eq("id", id);
  if (error) {
    console.error("Supabase (contacts delete):", error);
    showToast("❌ No se pudo eliminar el contacto", "#DC2626");
    return;
  }
  await refreshContacts();
  showToast("Contacto eliminado", "#475569");
};

window.openEditContact = function (id) {
  const c = contactsCache.find((item) => item.id === id);
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
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = Number($("editContactId").value);
      const name = $("editContactName").value.trim();
      const phone = $("editContactPhone").value.trim();
      const relation = $("editContactRelation").value.trim();

      // 🔌 Actualizar contacto en Supabase
      const { error } = await sb
        .from("contacts")
        .update({ name, phone, relation })
        .eq("id", id);

      if (error) {
        console.error("Supabase (contacts update):", error);
        showToast("❌ No se pudo actualizar el contacto", "#DC2626");
        return;
      }

      await refreshContacts();
      modal.classList.remove("open");
      showToast("✅ Contacto actualizado", "#16A34A");
    });
  }
}

function updateHomeContactCount() {
  const count = contactsCache.length;
  if ($("homeContactCount")) {
    $("homeContactCount").textContent =
      `${count} contacto${count !== 1 ? "s" : ""} listo${count !== 1 ? "s" : ""}`;
  }
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

// ── MAPA INTERACTIVO LEAFLET Y GPS (sin cambios, no usa datos de Supabase) ──
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

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      },
    ).addTo(leafletMap);

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

      if (userMarker) userMarker.setLatLng([lat, lng]);
      if (modalUserMarker) modalUserMarker.setLatLng([lat, lng]);
      if (leafletMap) leafletMap.panTo([lat, lng]);

      if ($("liveCoordsText"))
        $("liveCoordsText").textContent =
          `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
      if ($("modalCoordsText"))
        $("modalCoordsText").textContent =
          `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;

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

    // No usamos await aquí a propósito: la UI se actualiza de inmediato
    // (ver dentro de activateEmergency) y el guardado en Supabase ocurre
    // en segundo plano para no bloquear la respuesta al usuario.
    activateEmergency(type, name, icon);
  }
}

// ════════════════════════════════════════════════════════════
//  🔌 SUPABASE — EMERGENCIAS (tabla `emergencies`)
// ════════════════════════════════════════════════════════════

// Aplica todo el estado visual de "emergencia activa". Se usa tanto al
// crear una alerta nueva como al reanudar una alerta activa tras recargar.
function applyEmergencyUIOnly(incident) {
  state.status = "EMERGENCY";
  state.incident = incident;

  if ($("emergencyBanner")) $("emergencyBanner").classList.remove("hidden");
  if ($("ebTitle"))
    $("ebTitle").textContent = `⚡ ALERTA ACTIVADA: ${incident.name.toUpperCase()}`;
  if ($("statusLabel")) $("statusLabel").textContent = "¡EMERGENCIA ACTIVA!";
  if ($("statusDot")) $("statusDot").className = "status-dot-mini red";
  if ($("cancelEmergencyBtn"))
    $("cancelEmergencyBtn").classList.remove("hidden");
  if ($("dispatchSection")) $("dispatchSection").style.display = "block";

  showMedicalBannerCard();

  emergencySeconds = 0;
  updateEmergencyTimerText();
  if (emergencyTimer) clearInterval(emergencyTimer);
  emergencyTimer = setInterval(emergencyTick, 1000);

  resetTimeline();
}

async function activateEmergency(type, name, icon) {
  // 1. Actualizar la interfaz INMEDIATAMENTE (respuesta instantánea al usuario)
  const incident = {
    id: null, // se completa abajo con el id real de Supabase
    type,
    name,
    icon,
    ts: new Date().toISOString(),
    lat: userCoords.lat,
    lng: userCoords.lng,
  };
  applyEmergencyUIOnly(incident);

  navigateTo("view-map");
  showToast(
    `🚨 ¡ALERTA DE ${name.toUpperCase()} TRANSMITIDA!`,
    "#DC2626",
    4000,
  );

  resetTimeline();
  simulateContactsNotified();
  addChatMsg(
    "system",
    `🚨 Alerta de ${name} generada en Lat: ${userCoords.lat.toFixed(4)}, Lng: ${userCoords.lng.toFixed(4)}.`,
  );

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

  // 2. 🔌 Guardar el registro de la emergencia en Supabase (en segundo plano)
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  const { data, error } = await sb
    .from("emergencies")
    .insert({
      user_id: user.id,
      type,
      name,
      icon,
      status: "active",
      lat: userCoords.lat,
      lng: userCoords.lng,
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase (emergencies insert):", error);
    showToast("⚠️ No se pudo registrar la alerta en el servidor", "#D97706");
    return;
  }

  // Guardamos el ID real de Supabase; lo necesitamos para poder resolverla luego
  state.incident.id = data.id;
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

  if (contactsCache.length === 0) {
    container.innerHTML = `<p class="empty-state-text">No tienes contactos registrados en tu Red de Apoyo.</p>`;
    return;
  }

  container.innerHTML = contactsCache
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

async function submitResolution() {
  const textInput = $("rmText");
  const text = textInput ? textInput.value.trim() : "";

  if (text.length < 6) {
    showToast(
      "⚠️ Escriba un informe explicativo (mínimo 6 caracteres).",
      "#D97706",
    );
    return;
  }

  const currentInc = state.incident;

  // 🔌 Actualizar la emergencia en Supabase: pasa de 'active' a 'resolved'
  if (currentInc && currentInc.id) {
    const { error } = await sb
      .from("emergencies")
      .update({
        status: "resolved",
        resolution: text,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", currentInc.id);

    if (error) {
      console.error("Supabase (emergencies update):", error);
      showToast("❌ Error al guardar el cierre de la alerta", "#DC2626");
      return;
    }
  }

  state.status = "SECURE";
  state.incident = null;

  if (emergencyTimer) clearInterval(emergencyTimer);
  emergencyTimer = null;
  emergencySeconds = 0;

  if ($("emergencyBanner")) $("emergencyBanner").classList.add("hidden");
  if ($("statusLabel")) $("statusLabel").textContent = "Sistema Seguro";
  if ($("statusDot")) $("statusDot").className = "status-dot-mini green";
  if ($("cancelEmergencyBtn")) $("cancelEmergencyBtn").classList.add("hidden");
  if ($("dispatchSection")) $("dispatchSection").style.display = "none";
  if ($("medicalBannerCard")) $("medicalBannerCard").classList.add("hidden");

  if ($("resolutionBackdrop")) $("resolutionBackdrop").classList.remove("open");
  if (textInput) textInput.value = "";

  await refreshLogs();
  showToast(
    "✅ Alerta finalizada. Incidente guardado en historial.",
    "#16A34A",
  );
  navigateTo("view-history");
}

// Trae del servidor las emergencias ya resueltas del usuario (Historial)
async function refreshLogs() {
  const container2 = document.getElementById('logsList');
  if (container2) { container2.innerHTML = '<div class="skeleton-loader" style="height: 80px;"></div><div class="skeleton-loader" style="height: 80px;"></div>'; }
  await new Promise(r => setTimeout(r, 800)); // Premium UX Loading State
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    logsCache = [];
    renderLogsUI();
    return;
  }

  const { data, error } = await sb
    .from("emergencies")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false });

  if (error) {
    console.error("Supabase (emergencies history select):", error);
    logsCache = [];
  } else {
    logsCache = data;
  }
  renderLogsUI();
}

function renderLogsUI() {
  const container = $("logsList");
  if (!container) return;

  if (!logsCache || logsCache.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 32px 16px; color: var(--text-muted); font-size: 13px;">
        No hay alertas o emergencias registradas en el historial.
      </div>`;
    return;
  }

  container.innerHTML = logsCache
    .map(
      (log) => `
    <div class="contact-item" style="align-items:flex-start;">
      <div class="contact-avatar" style="background:rgba(220,38,38,0.15); color:var(--primary-red-hover);">
        <span class="material-symbols-rounded">${log.icon || "warning"}</span>
      </div>
      <div class="contact-details">
        <strong>${escHtml(log.name)} — Finalizada</strong>
        <span style="color:var(--accent-indigo); font-size:10px; margin:2px 0;">Fecha: ${new Date(log.resolved_at || log.created_at).toLocaleString()}</span>
        <span style="color:white; margin-top:4px;"><b>Informe:</b> ${escHtml(log.resolution)}</span>
      </div>
    </div>
  `,
    )
    .join("");
}

// Busca si el usuario tiene una emergencia 'active' pendiente (p. ej. recargó la página)
async function checkActiveEmergency() {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  const { data, error } = await sb
    .from("emergencies")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Supabase (checkActiveEmergency):", error);
    return;
  }

  if (data) {
    applyEmergencyUIOnly({
      id: data.id,
      type: data.type,
      name: data.name,
      icon: data.icon,
      ts: data.created_at,
      lat: data.lat,
      lng: data.lng,
    });
    navigateTo("view-map");
  }
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

// ════════════════════════════════════════════════════════════
//  🔌 SUPABASE — AUTENTICACIÓN (pantalla Login / Registro)
// ════════════════════════════════════════════════════════════

function dismissAuth() {
  const authScreen = $("authScreen");
  if (authScreen) authScreen.classList.add("hidden");
}

function showAuthScreen() {
  const authScreen = $("authScreen");
  if (authScreen) authScreen.classList.remove("hidden");
}

// Punto de entrada: se llama una vez que sabemos que hay sesión activa.
// Carga perfil, contactos e historial desde Supabase y refresca la UI.
async function initializeUserSession() {
  await loadUserProfile();
  await refreshContacts();
  await refreshLogs();
  await checkActiveEmergency();

  if ($("userEmailInput")) $("userEmailInput").value = state.user.email || "";

  // Mostrar onboarding si el usuario nunca completó su ficha médica
  if (!state.user.onboardingDone) {
    setTimeout(() => showOnboarding(), 400);
  }
}

function initAuthScreen() {
  const loginForm = $("loginForm");
  const registerForm = $("registerForm");
  const tabLoginBtn = $("tabLoginBtn");
  const tabRegisterBtn = $("tabRegisterBtn");
  const toggleLoginPwd = $("toggleLoginPwd");
  const toggleRegPwd = $("toggleRegPwd");

  const savedAccountsContainer = $("savedAccountsContainer");
  const loginFormMainFields = document.querySelectorAll("#loginForm .form-group");
  const loginSubmitBtn = $("loginSubmitBtn");

  function renderQuickLogin() {
    try {
      const quickData = JSON.parse(localStorage.getItem("sos911_quick_login"));
      if (quickData && quickData.email && quickData.pwd) {
        if (savedAccountsContainer) {
          savedAccountsContainer.classList.remove("hidden");
          const initial = quickData.name ? quickData.name.charAt(0).toUpperCase() : "U";
          
          $("savedAccountsList").innerHTML = `
            <div class="quick-login-card" id="quickLoginCard" style="display:flex; align-items:center; background:rgba(255,255,255,0.05); padding:16px; border-radius:12px; cursor:pointer; transition:all 0.2s; border: 1px solid rgba(255,255,255,0.1); gap: 16px;">
              <div style="width:48px; height:48px; background:linear-gradient(135deg, #3B82F6, #2563EB); border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:20px; font-weight:bold; box-shadow:0 4px 12px rgba(37,99,235,0.3);">
                ${initial}
              </div>
              <div style="flex: 1;">
                <div style="font-weight:600; color:white; font-size:16px;">${quickData.name}</div>
                <div style="color:var(--text-muted); font-size:13px;">${quickData.email}</div>
              </div>
              <span class="material-symbols-rounded" style="color:#3B82F6;">arrow_forward_ios</span>
            </div>
            <div style="text-align:center; margin-top:16px;">
              <a href="#" id="useAnotherAccountBtn" style="color:var(--text-muted); font-size:13px; text-decoration:none; border-bottom:1px dashed var(--text-muted);">Usar otra cuenta</a>
            </div>
          `;

          loginFormMainFields.forEach(el => el.classList.add("hidden"));
          if (loginSubmitBtn) loginSubmitBtn.classList.add("hidden");

          $("quickLoginCard").addEventListener("click", async () => {
            const btn = $("quickLoginCard");
            btn.style.opacity = "0.7";
            btn.style.pointerEvents = "none";
            showToast("Iniciando sesión automáticamente...", "#3B82F6");
            
            const { data, error } = await sb.auth.signInWithPassword({
              email: quickData.email,
              password: atob(quickData.pwd),
            });
            
            if (error) {
              showToast("❌ La sesión expiró o credenciales inválidas. Inicia sesión manualmente.", "#DC2626");
              localStorage.removeItem("sos911_quick_login");
              renderQuickLogin();
            } else {
              showToast("✅ ¡Bienvenido de nuevo, " + quickData.name + "!", "#16A34A");
              dismissAuth();
              await initializeUserSession();
            }
          });

          $("useAnotherAccountBtn").addEventListener("click", (e) => {
            e.preventDefault();
            savedAccountsContainer.classList.add("hidden");
            loginFormMainFields.forEach(el => el.classList.remove("hidden"));
            if (loginSubmitBtn) loginSubmitBtn.classList.remove("hidden");
          });
        }
      } else {
        if (savedAccountsContainer) savedAccountsContainer.classList.add("hidden");
        loginFormMainFields.forEach(el => el.classList.remove("hidden"));
        if (loginSubmitBtn) loginSubmitBtn.classList.remove("hidden");
      }
    } catch(e) {
      console.error(e);
    }
  }

  renderQuickLogin();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const loginEmailInp = $("loginEmail");
  const regEmailInp = $("regEmail");

  if (loginEmailInp) {
    loginEmailInp.addEventListener("input", () => {
      const badge = $("loginEmailValid");
      if (badge) {
        badge.classList.toggle(
          "hidden",
          !emailRegex.test(loginEmailInp.value.trim()),
        );
      }
    });
  }
  if (regEmailInp) {
    regEmailInp.addEventListener("input", () => {
      const badge = $("regEmailValid");
      if (badge) {
        badge.classList.toggle(
          "hidden",
          !emailRegex.test(regEmailInp.value.trim()),
        );
      }
    });
  }

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

  // 🔌 SUBMIT LOGIN — supabase.auth.signInWithPassword
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("loginEmail")?.value.trim().toLowerCase();
      const password = $("loginPassword")?.value;

      if (!email || !password) {
        showToast("⚠️ Ingresa tu correo y contraseña", "#D97706");
        return;
      }

      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        showToast("❌ " + (error.message || "Credenciales incorrectas."), "#DC2626");
        return;
      }

      // UX Premium: Guardar sesión para 1 Click Login
      let userName = "Usuario";
      if (data && data.user && data.user.user_metadata) {
        userName = data.user.user_metadata.full_name || userName;
      }
      localStorage.setItem("sos911_quick_login", JSON.stringify({
        email: email,
        pwd: btoa(password),
        name: userName
      }));

      showToast(`✅ ¡Bienvenido de nuevo!`, "#16A34A");
      dismissAuth();
      await initializeUserSession();
    });
  }

  // 🔌 SUBMIT REGISTRO — supabase.auth.signUp
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("regName")?.value.trim();
      const email = $("regEmail")?.value.trim().toLowerCase();
      const password = $("regPassword")?.value;

      if (!name) {
        showToast("⚠️ Ingresa tu nombre", "#D97706");
        return;
      }
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

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });

      if (error) {
        showToast("❌ " + error.message, "#DC2626");
        return;
      }

      // Si tu proyecto de Supabase tiene activada la confirmación por correo,
      // `data.session` viene null hasta que el usuario confirme su email.
      if (!data.session) {
        showToast(
          "📧 Cuenta creada. Revisa tu correo para confirmar tu cuenta antes de iniciar sesión.",
          "#2563EB",
          6000,
        );
        return;
      }

      // UX Premium: Guardar sesión para 1 Click Login
      localStorage.setItem("sos911_quick_login", JSON.stringify({
        email: email,
        pwd: btoa(password),
        name: name
      }));

      showToast(`🎉 Cuenta creada. ¡Bienvenido, ${name}!`, "#16A34A", 3000);
      dismissAuth();
      await initializeUserSession();
    });
  }
}

// 🔌 Cierra sesión en Supabase y vuelve a la pantalla de autenticación
async function logoutUser() {
  await sb.auth.signOut();

  const backdrop = $("profileModalBackdrop");
  if (backdrop) backdrop.classList.remove("open");

  showAuthScreen();

  const loginEmail = $("loginEmail");
  const loginPassword = $("loginPassword");
  if (loginEmail) loginEmail.value = "";
  if (loginPassword) loginPassword.value = "";

  // Limpiar estado/cachés en memoria
  state = {
    status: "SECURE",
    incident: null,
    user: JSON.parse(JSON.stringify(DEFAULT_PROFILE)),
  };
  contactsCache = [];
  logsCache = [];

  showToast("🚪 Sesión cerrada correctamente", "#2563EB");
}

// ════════════════════════════════════════════════════════════
//  🔌 SUPABASE — ONBOARDING (ficha de emergencia inicial)
// ════════════════════════════════════════════════════════════
function showOnboarding() {
  const screen = $("onboardingScreen");
  if (screen) {
    screen.classList.remove("hidden");
    const u = state.user || {};
    if ($("obAge")) $("obAge").value = u.age || "";
    if ($("obBloodType")) $("obBloodType").value = u.bloodType || "";
    if ($("obCondition")) $("obCondition").value = u.condition || "";
    if ($("obAllergies")) $("obAllergies").value = u.allergies || "";
    if ($("obEcName")) $("obEcName").value = u.emergencyContactName || "";
    if ($("obEcPhone")) $("obEcPhone").value = u.emergencyContactPhone || "";
  }
}

function initOnboardingScreen() {
  const form = $("onboardingForm");
  const skipBtn = $("onboardingSkipBtn");
  const screen = $("onboardingScreen");

  if (skipBtn) {
    skipBtn.addEventListener("click", async () => {
      // 🔌 Marcamos onboarding_done=true en Supabase para no volver a mostrarlo
      await saveProfileToSupabase({ onboarding_done: true });
      state.user.onboardingDone = true;
      if (screen) screen.classList.add("hidden");
      showToast(
        "📋 Puedes completar tu ficha médica desde el ícono de perfil",
        "#2563EB",
        4000,
      );
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const age = $("obAge")?.value.trim();
      const bloodType = $("obBloodType")?.value;
      const condition = $("obCondition")?.value.trim();
      const allergies = $("obAllergies")?.value.trim();
      const ecName = $("obEcName")?.value.trim();
      const ecPhone = $("obEcPhone")?.value.trim();

      // 🔌 Guardar la ficha de emergencia inicial en la tabla `profiles`
      const saved = await saveProfileToSupabase({
        // Columnas en español (esquema real de Supabase)
        edad: age ? parseInt(age, 10) : null,
        "tipo de sangre": bloodType,
        enfermedad: condition,
        alergias: allergies,
        "contacto emergencia nombre": ecName,
        "contacto emergencia telefono": ecPhone,
        onboarding_done: true,
        // Fallback en inglés por compatibilidad
        age: age ? parseInt(age, 10) : null,
        blood_type: bloodType,
        condition,
        allergies,
        emergency_contact_name: ecName,
        emergency_contact_phone: ecPhone,
      });

      if (!saved) return; // el error ya se mostró en saveProfileToSupabase

      state.user = mapProfileRowToState(saved);

      if (screen) screen.classList.add("hidden");
      showToast("✅ Ficha de emergencia guardada correctamente", "#16A34A");
    });
  }
}

// ── PERFIL DE USUARIO (RF-01) ─────────────────────────────────
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

  const pTabs = $$(".profile-tab");
  const pContents = $$(".profile-tab-content");
  if (pTabs.length > 0) {
    pTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        pTabs.forEach((t) => t.classList.remove("active"));
        pContents.forEach((c) => c.classList.add("hidden"));
        tab.classList.add("active");
        const targetContent = $(tab.getAttribute("data-ptab"));
        if (targetContent) targetContent.classList.remove("hidden");
      });
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      $$(".form-error-msg").forEach((el) => (el.textContent = ""));
      let hasError = false;

      const userName = $("userNameInput")?.value.trim() || "";
      const userPhone = $("userPhoneInput")?.value.trim() || "";
      const userAddress = $("userAddressInput")?.value.trim() || "";

      const age = $("profileAge") ? $("profileAge").value.trim() : "";
      const bloodType = $("profileBloodType")
        ? $("profileBloodType").value
        : "";
      const ecPhone = $("profileEcPhone")
        ? $("profileEcPhone").value.trim()
        : "";

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

      if (!bloodType) {
        if ($("err-profileBloodType"))
          $("err-profileBloodType").textContent =
            "Selecciona un tipo de sangre.";
        hasError = true;
      }



      if (hasError) return;

      // UX Premium: Cambiar botón a estado de carga
      const saveBtn = $("saveProfileBtn");
      const originalText = saveBtn.innerHTML;

      try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="material-symbols-rounded spin-loader">sync</span> Guardando...';

        // 🔌 Guardar en Supabase — columnas en español + fallback inglés
        const conditionVal = $("profileCondition")?.value.trim() || "";
        const allergiesVal = $("profileAllergies")?.value.trim() || "";
        const saved = await saveProfileToSupabase({
          // Columnas en español (esquema real de Supabase)
          nombre: userName,
          telefono: userPhone,
          direccion: userAddress,
          edad: parseInt(age, 10),
          "tipo de sangre": bloodType,
          alergias: allergiesVal,
          enfermedad: conditionVal,
          medicacion: $("profileMedication")?.value.trim() || "",
          seguro: $("profileInsurance")?.value || "",
          notas: $("profileNotes")?.value.trim() || "",
          // Fallback inglés por compatibilidad
          name: userName,
          phone: userPhone,
          address: userAddress,
          age: parseInt(age, 10),
          blood_type: bloodType,
          condition: conditionVal,
          allergies: allergiesVal,
          medication: $("profileMedication")?.value.trim() || "",
          insurance: $("profileInsurance")?.value || "",
          notes: $("profileNotes")?.value.trim() || "",
        });

        // Simulamos fetch adicional para apreciar la animación
        await new Promise(r => setTimeout(r, 1200));

        if (!saved) {
          // Si no se guardó (error), saveProfileToSupabase ya muestra un toast. 
          return;
        }

        state.user = mapProfileRowToState(saved);
        if ($("userEmailInput"))
          $("userEmailInput").value = state.user.email || "";

        backdrop.classList.remove("open");
        
        // UX Premium: Actualizar la Ficha Médica Transmitida
        showMedicalBannerCard();
        
        // UX Premium: Toast Animado de Éxito
        showToast("✅ ¡Ficha guardada exitosamente!", "#10B981");
      } catch (err) {
        console.error("Error guardando ficha:", err);
        showToast("❌ Error inesperado guardando la ficha.", "#DC2626");
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
      }
    });
  }
}

// ── CONTROLES NUMÉRICOS PERSONALIZADOS (sin cambios) ──────────
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

// ── ACCESIBILIDAD: TEMA Y FUENTE (sin cambios, sigue en localStorage) ──
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

  applyTheme(theme);
  applyFontScale(FONT_STEPS[fontIdx]);

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

// ════════════════════════════════════════════════════════════
//  🔌 SUPABASE — INICIALIZACIÓN PRINCIPAL
// ════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
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

  // 🔌 Verificar si ya existe una sesión de Supabase activa (p. ej. al recargar)
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (session) {
    // Si hay sesión activa Y datos de acceso rápido guardados, mostramos la
    // tarjeta de 1 clic para que el usuario confirme con quién ingresar.
    const quickData = (() => {
      try { return JSON.parse(localStorage.getItem("sos911_quick_login")); } catch { return null; }
    })();

    if (quickData && quickData.email) {
      // Mostrar pantalla de auth con la tarjeta de acceso rápido ya renderizada
      showAuthScreen();
      // La sesión ya existe: al hacer clic en la tarjeta, entramos directamente
      // sin necesidad de llamar a signInWithPassword de nuevo
      setTimeout(() => {
        const card = document.getElementById("quickLoginCard");
        if (card) {
          // Reemplazar listener para que use la sesión activa en lugar de re-autenticar
          card.replaceWith(card.cloneNode(true)); // limpia el listener anterior
          const freshCard = document.getElementById("quickLoginCard");
          if (freshCard) {
            freshCard.addEventListener("click", async () => {
              freshCard.style.opacity = "0.7";
              freshCard.style.pointerEvents = "none";
              showToast("✅ ¡Bienvenido de nuevo, " + quickData.name + "!", "#16A34A");
              dismissAuth();
              await initializeUserSession();
            });
          }
        }
      }, 100);
    } else {
      dismissAuth();
      await initializeUserSession();
    }
  } else {
    showAuthScreen();
  }

  // 🔌 Reaccionar a cambios de sesión (login/logout desde cualquier pestaña,
  // expiración de token, etc.)
  sb.auth.onAuthStateChange((event, newSession) => {
    if (event === "SIGNED_OUT") {
      showAuthScreen();
    }
  });
});