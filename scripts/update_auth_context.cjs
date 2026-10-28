const fs = require('fs');
let code = fs.readFileSync('src/client/context/AuthContext.tsx', 'utf8');

if (!code.includes('normalizePath')) {
  code = code.replace(
    "import { Button, Modal, useToast } from '../components/ui/IndustrialPrimitives';",
    "import { Button, Modal, useToast } from '../components/ui/IndustrialPrimitives';\nimport { normalizePath } from '../lib/navigation';"
  );
}

const oldBlock = `        const path = typeof window !== 'undefined' ? window.location.pathname : '/worker';
        if (path.startsWith('/admin')) {
          await quickSwitch({ workerId: 'NV00053' });
        } else if (!path.startsWith('/andon')) {
          await quickSwitch({ workerId: 'NV00214' });
        }`;

const newBlock = `        const rawPath = typeof window !== 'undefined' ? window.location.pathname : '/worker';
        const path = normalizePath(rawPath);
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1280;
        if (path.startsWith('/admin') || (path === '/' && isDesktop)) {
          await quickSwitch({ workerId: 'NV00053' });
        } else if (!path.startsWith('/andon')) {
          await quickSwitch({ workerId: 'NV00214' });
        }`;

code = code.replace(oldBlock.replace(/\n/g, '\r\n'), newBlock.replace(/\n/g, '\r\n'));
code = code.replace(oldBlock, newBlock);

fs.writeFileSync('src/client/context/AuthContext.tsx', code, 'utf8');
console.log('AuthContext.tsx updated successfully!');

