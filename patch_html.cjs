const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(filePath, 'utf8');

// The replacement logic:
// We need to replace everything inside `<form id="profileForm" ...>` up to `</form>`
// Wait, the form ends with a button `<button type="submit" ... id="saveProfileBtn">`.

const newFormContent = `
          <!-- TABS SUPERIORES -->
          <div class="profile-tab-switcher">
            <button type="button" class="profile-tab active" data-ptab="tabPersonal">Datos Personales</button>
            <button type="button" class="profile-tab" data-ptab="tabMedical">Ficha Médica</button>
            <button type="button" class="profile-tab" data-ptab="tabSettings">Contacto y Ajustes</button>
          </div>

          <!-- PESTAÑA 1: DATOS PERSONALES -->
          <div id="tabPersonal" class="profile-tab-content">
            <div class="profile-locked-notice">
              <span class="material-symbols-rounded">lock</span>
              Datos de registro. Edita desde Configuración de Cuenta.
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label for="userNameInput">
                  <span class="material-symbols-rounded field-lock-icon">lock</span> Nombre
                </label>
                <input type="text" id="userNameInput" placeholder="Ej. Dr. Carlos Mendoza" readonly tabindex="-1">
              </div>
              <div class="form-group">
                <label for="userPhoneInput">
                  <span class="material-symbols-rounded field-lock-icon">lock</span> Teléfono
                </label>
                <input type="tel" id="userPhoneInput" placeholder="+593 98 765 4321" readonly tabindex="-1">
              </div>
              <div class="form-group col-span-2">
                <label for="userEmailInput">
                  <span class="material-symbols-rounded field-lock-icon">lock</span> Correo Electrónico
                </label>
                <input type="email" id="userEmailInput" placeholder="usuario@sos911.app" readonly tabindex="-1">
              </div>
              <div class="form-group col-span-2">
                <label for="userAddressInput">
                  <span class="material-symbols-rounded field-lock-icon">lock</span> Dirección Principal
                </label>
                <input type="text" id="userAddressInput" placeholder="Ej. Av. Amazonas N24-15 y Colón" readonly tabindex="-1">
              </div>
            </div>
          </div>

          <!-- PESTAÑA 2: FICHA MÉDICA -->
          <div id="tabMedical" class="profile-tab-content hidden">
            <div class="form-grid">
              <div class="form-group">
                <label for="profileAge">Edad <span class="field-required">*</span></label>
                <div class="number-input-wrapper">
                  <button type="button" class="btn-num-control" id="btn-dec-profileAge">&minus;</button>
                  <input type="number" id="profileAge" placeholder="Ej. 28" min="1" max="120">
                  <button type="button" class="btn-num-control" id="btn-inc-profileAge">&plus;</button>
                </div>
                <span class="form-error-msg" id="err-profileAge"></span>
              </div>
              
              <div class="form-group">
                <label for="profileBloodType">Tipo de Sangre <span class="field-required">*</span></label>
                <div class="select-wrapper">
                  <select id="profileBloodType">
                    <option value="">Seleccionar...</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="Desconocido">Desconocido</option>
                  </select>
                </div>
                <span class="form-error-msg" id="err-profileBloodType"></span>
              </div>

              <div class="form-group">
                <label for="profileInsurance">
                  <span class="material-symbols-rounded form-icon">health_and_safety</span> Seguro Médico
                </label>
                <div class="select-wrapper">
                  <select id="profileInsurance">
                    <option value="">Seleccionar...</option>
                    <option value="Ninguno">Ninguno</option>
                    <option value="IESS">IESS</option>
                    <option value="Seguro Privado">Seguro Privado</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label for="profileMedication">
                  <span class="material-symbols-rounded form-icon">medication</span> Medicación
                </label>
                <input type="text" id="profileMedication" placeholder="Ej. Insulina, Losartán">
              </div>

              <div class="form-group col-span-2">
                <label for="profileCondition">Enfermedad / Condición Médica</label>
                <input type="text" id="profileCondition" placeholder="Ej. Diabetes tipo 2, Hipertensión">
              </div>

              <div class="form-group col-span-2">
                <label for="profileAllergies">Alergias Severas a Medicamentos</label>
                <input type="text" id="profileAllergies" placeholder="Ej. Penicilina, Ibuprofeno">
              </div>

              <div class="form-group col-span-2">
                <label for="profileNotes">
                  <span class="material-symbols-rounded form-icon">note_alt</span> Observaciones / Notas
                </label>
                <textarea id="profileNotes" rows="2" placeholder="Ej. Lleva marcapasos. No aplicar adrenalina."></textarea>
              </div>
            </div>
          </div>

          <!-- PESTAÑA 3: CONTACTO Y AJUSTES -->
          <div id="tabSettings" class="profile-tab-content hidden">
            <div class="profile-section-label">Contacto de Emergencia</div>
            <div class="form-grid">
              <div class="form-group">
                <label for="profileEcName">Nombre</label>
                <input type="text" id="profileEcName" placeholder="Ej. Ana García">
              </div>
              <div class="form-group">
                <label for="profileEcPhone">Teléfono <span class="field-required">*</span></label>
                <input type="tel" id="profileEcPhone" placeholder="+593 99 000 0000">
                <span class="form-error-msg" id="err-profileEcPhone"></span>
              </div>
            </div>

            <div class="profile-section-label" style="margin-top:16px;">
              <span class="material-symbols-rounded form-icon">settings_accessibility</span> Ajustes
            </div>
            
            <div class="form-grid">
              <div class="form-group col-span-2">
                <label>Tema de Interfaz</label>
                <div class="settings-row" style="padding-top: 6px;">
                  <span class="material-symbols-rounded form-icon">dark_mode</span>
                  <span class="settings-label">Oscuro</span>
                  <label class="theme-switch" for="themeToggle">
                    <input type="checkbox" id="themeToggle">
                    <span class="theme-switch-slider"></span>
                  </label>
                  <span class="settings-label">Claro</span>
                  <span class="material-symbols-rounded form-icon">light_mode</span>
                </div>
              </div>

              <div class="form-group col-span-2">
                <label>Tamaño de Letra</label>
                <div class="settings-row" style="padding-top: 6px;">
                  <button type="button" class="btn-font-control" id="btnFontDec">A&minus;</button>
                  <span class="font-size-indicator" id="fontSizeIndicator">100%</span>
                  <button type="button" class="btn-font-control" id="btnFontInc">A+</button>
                </div>
              </div>
            </div>
          </div>

          <button type="submit" class="btn btn-blue full-width" id="saveProfileBtn" style="margin-top: 16px;">
            <span class="material-symbols-rounded">check_circle</span> Guardar Ficha
          </button>
`;

const startIndex = html.indexOf('<form id="profileForm" onsubmit="return false;">') + '<form id="profileForm" onsubmit="return false;">'.length;
const endIndex = html.indexOf('</form>', startIndex);

html = html.substring(0, startIndex) + '\n' + newFormContent + '\n        ' + html.substring(endIndex);

fs.writeFileSync(filePath, html);
console.log('index.html updated successfully.');
