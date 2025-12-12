import fs from 'fs';
import path from 'path';

const SDK_FILE = path.join(process.cwd(), '.api/apis/dtone/index.ts');
const CORE_FILE = path.join(process.cwd(), 'node_modules', 'api', 'dist', 'core', 'index.js');

// 1. Patch the generated SDK file
if (fs.existsSync(SDK_FILE)) {
  console.log(`[Fix-SDK] 🔧 Patching SDK: ${SDK_FILE}...`);
  
  let content = fs.readFileSync(SDK_FILE, 'utf8');

  // Define the Robust Fixes (Try .default, fallback to self)
  const OAS_FIX = 'new ((Oas as any).default || (Oas as any))(definition as any)';
  const CORE_FIX = "new ((APICore as any).default || (APICore as any))(this.spec, 'dtone/1.22.0 (api/6.1.3)')";

  let patched = false;

  if (content.includes('new (Oas as any).default(') || content.includes('new (Oas as any)(')) {
    content = content
      .replace('new (Oas as any).default(definition as any)', OAS_FIX)
      .replace('new (Oas as any)(definition as any)', OAS_FIX);
    patched = true;
    console.log('   ✅ Patched "Oas" constructor');
  }

  if (content.includes('new (APICore as any).default(') || content.includes('new (APICore as any)(')) {
    content = content
      .replace("new (APICore as any).default(this.spec, 'dtone/1.22.0 (api/6.1.3)')", CORE_FIX)
      .replace("new (APICore as any)(this.spec, 'dtone/1.22.0 (api/6.1.3)')", CORE_FIX);
    patched = true;
    console.log('   ✅ Patched "APICore" constructor');
  }

  if (patched) {
    fs.writeFileSync(SDK_FILE, content);
    console.log('   💾 Saved SDK changes.');
  } else {
    console.log('   ℹ️  SDK file appeared already patched.');
  }
} else {
  console.warn(`[Fix-SDK] ⚠️  File not found: ${SDK_FILE}`);
}

// 2. Patch the 'api' package core to use native AbortController (Fixes "this.removeEventListener" crash)
if (fs.existsSync(CORE_FILE)) {
  console.log(`[Fix-SDK] 🔧 Patching API Core: ${CORE_FILE}...`);
  let coreContent = fs.readFileSync(CORE_FILE, 'utf8');

  // We replace the require("node-abort-controller") with the global native objects
  // The 'api' package usually does: var node_abort_controller_1 = require("node-abort-controller");
  // We want it to be: var node_abort_controller_1 = { AbortController: global.AbortController, AbortSignal: global.AbortSignal };
  
  if (coreContent.includes('require("node-abort-controller")')) {
    coreContent = coreContent.replace(
      /require\("node-abort-controller"\)/g,
      '{ AbortController: global.AbortController, AbortSignal: global.AbortSignal }'
    );
    fs.writeFileSync(CORE_FILE, coreContent);
    console.log('   ✅ Patched "node-abort-controller" to use Native Node.js implementation.');
  } else {
    console.log('   ℹ️  API Core appeared already patched or does not use polyfill.');
  }
} else {
  console.warn(`[Fix-SDK] ⚠️  Core file not found: ${CORE_FILE}`);
}

console.log('[Fix-SDK] 🎉 Done! System is ready.');
