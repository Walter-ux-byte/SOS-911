const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app.js');
let js = fs.readFileSync(filePath, 'utf8');

const logicToInsert = `
  // Profile Tabs Logic
  const pTabs = $$('.profile-tab');
  const pContents = $$('.profile-tab-content');
  if (pTabs.length > 0) {
    pTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Deactivate all
        pTabs.forEach(t => t.classList.remove('active'));
        pContents.forEach(c => c.classList.add('hidden'));
        // Activate clicked
        tab.classList.add('active');
        const targetId = tab.getAttribute('data-ptab');
        const targetContent = $(targetId);
        if (targetContent) {
          targetContent.classList.remove('hidden');
        }
      });
    });
  }
`;

const anchorRegex = /if\s*\(closeBtn\)\s*\{\s*closeBtn\.addEventListener\('click',\s*\(\)\s*=>\s*backdrop\.classList\.remove\('open'\)\);\s*\}/;

if (anchorRegex.test(js)) {
  js = js.replace(anchorRegex, (match) => match + '\n' + logicToInsert);
  fs.writeFileSync(filePath, js);
  console.log('app.js updated successfully.');
} else {
  console.log('Anchor not found in app.js.');
}
