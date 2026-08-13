const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'style.css');
let css = fs.readFileSync(filePath, 'utf8');

const newCss = `
/* ══════════════════════════════════════════════════════════════
   PROFILE MODAL — TAB SWITCHER & GRID LAYOUT
   ══════════════════════════════════════════════════════════════ */
.profile-tab-switcher {
  display: flex;
  background: rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 4px;
  margin-bottom: 16px;
  gap: 4px;
}

.profile-tab {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 8px 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition-fast);
  text-align: center;
}

.profile-tab.active {
  background: var(--primary-red);
  color: #FFFFFF;
}

.profile-tab-content {
  animation: fadeIn 0.3s ease;
}

.profile-tab-content.hidden {
  display: none !important;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.form-grid .form-group {
  margin-bottom: 0; /* Override default margin inside grid */
}

.col-span-2 {
  grid-column: span 2;
}

@media (max-width: 480px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .col-span-2 {
    grid-column: span 1;
  }
}

/* Light Theme Additions */
html[data-theme="light"] .profile-tab-switcher {
  background: rgba(0, 0, 0, 0.05);
}
html[data-theme="light"] .profile-tab {
  color: #64748B;
}
html[data-theme="light"] .profile-tab.active {
  color: #FFFFFF;
}
`;

css += '\n' + newCss;
fs.writeFileSync(filePath, css);
console.log('style.css updated successfully.');
