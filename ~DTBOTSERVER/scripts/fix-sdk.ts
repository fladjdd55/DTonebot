import fs from 'fs';
import path from 'path';

const SDK_FILE = path.join(process.cwd(), '.api/apis/dtone/index.ts');

if (fs.existsSync(SDK_FILE)) {
  console.log(`[Fix-SDK] 🔧 Patching ${SDK_FILE}...`);
  
  let content = fs.readFileSync(SDK_FILE, 'utf8');

  // Define the Robust Fixes (Try .default, fallback to self)
  const OAS_FIX = 'new ((Oas as any).default || (Oas as any))(definition as any)';
  const CORE_FIX = "new ((APICore as any).default || (APICore as any))(this.spec, 'dtone/1.22.0 (api/6.1.3)')";

  // 1. Patch "Oas" constructor
  // We check for both the original buggy code AND the previous partial fix
  if (content.includes('new (Oas as any).default(') || content.includes('new (Oas as any)(')) {
    content = content
      .replace('new (Oas as any).default(definition as any)', OAS_FIX)
      .replace('new (Oas as any)(definition as any)', OAS_FIX);
      
    console.log('   ✅ Patched "Oas" constructor (Robust Mode)');
  }

  // 2. Patch "APICore" constructor
  if (content.includes('new (APICore as any).default(') || content.includes('new (APICore as any)(')) {
    content = content
      .replace("new (APICore as any).default(this.spec, 'dtone/1.22.0 (api/6.1.3)')", CORE_FIX)
      .replace("new (APICore as any)(this.spec, 'dtone/1.22.0 (api/6.1.3)')", CORE_FIX);

    console.log('   ✅ Patched "APICore" constructor (Robust Mode)');
  }

  fs.writeFileSync(SDK_FILE, content);
  console.log('[Fix-SDK] 🎉 Done! SDK is ready for CommonJS/ESM interop.');
} else {
  console.warn(`[Fix-SDK] ⚠️  File not found: ${SDK_FILE}`);
}
