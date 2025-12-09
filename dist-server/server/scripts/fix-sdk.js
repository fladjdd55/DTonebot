"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var SDK_FILE = path_1.default.join(process.cwd(), '.api/apis/dtone/index.ts');
if (fs_1.default.existsSync(SDK_FILE)) {
    console.log("[Fix-SDK] \uD83D\uDD27 Patching ".concat(SDK_FILE, "..."));
    var content = fs_1.default.readFileSync(SDK_FILE, 'utf8');
    // Define the Robust Fixes (Try .default, fallback to self)
    var OAS_FIX = 'new ((Oas as any).default || (Oas as any))(definition as any)';
    var CORE_FIX = "new ((APICore as any).default || (APICore as any))(this.spec, 'dtone/1.22.0 (api/6.1.3)')";
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
    fs_1.default.writeFileSync(SDK_FILE, content);
    console.log('[Fix-SDK] 🎉 Done! SDK is ready for CommonJS/ESM interop.');
}
else {
    console.warn("[Fix-SDK] \u26A0\uFE0F  File not found: ".concat(SDK_FILE));
}
