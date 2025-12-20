"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BASE_URL = 'http://localhost:5200/api';
async function testRoutes() {
    console.log('🚀 Starting Route Verification Test...\n');
    console.log(`Target: ${BASE_URL}\n`);
    // 1. Test Public Catalog Route (Countries)
    // Expectation: 200 OK and an array of countries
    try {
        process.stdout.write('1️⃣  Testing Catalog (/countries)... ');
        const res = await axios_1.default.get(`${BASE_URL}/countries`);
        if (res.status === 200 && Array.isArray(res.data)) {
            console.log('✅ Success');
        }
        else {
            console.log(`⚠️  Warning: Unexpected status ${res.status}`);
        }
    }
    catch (error) {
        console.log('❌ Failed');
        console.error('   Error:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('   🚨 Is the server running?');
            process.exit(1);
        }
    }
    // 2. Test Auth Route Mounting (Login)
    // Expectation: 400/401 (Validation error), NOT 404.
    try {
        process.stdout.write('2️⃣  Testing Auth (/auth/login)... ');
        await axios_1.default.post(`${BASE_URL}/auth/login`, {
            email: 'test@test.com',
            password: 'short' // Intentionally invalid to trigger validation
        });
        console.log('❓ Unexpected Success (Should have failed validation)');
    }
    catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('❌ Failed (404 Not Found)');
            console.log('   👉 Check if app.use(\'/api/auth\', authRoutes) is in index.ts');
        }
        else if (error.response) {
            console.log(`✅ Success (Route exists, got expected ${error.response.status})`);
        }
        else {
            console.log(`❌ Error: ${error.message}`);
        }
    }
    // 3. Test Payment Route Mounting
    // Expectation: 400 (Missing body/headers), NOT 404.
    try {
        process.stdout.write('3️⃣  Testing Payment (/create-payment-intent)... ');
        await axios_1.default.post(`${BASE_URL}/create-payment-intent`, {}, {
            headers: { 'idempotency-key': 'test-key' }
        });
        console.log('❓ Unexpected Success');
    }
    catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('❌ Failed (404 Not Found)');
        }
        else if (error.response) {
            console.log(`✅ Success (Route exists, got expected ${error.response.status})`);
        }
        else {
            console.log(`❌ Error: ${error.message}`);
        }
    }
    // 4. Test Webhook Route Mounting
    // Expectation: 400 (Invalid payload), NOT 404.
    try {
        process.stdout.write('4️⃣  Testing Webhook (/hooks/dtone)... ');
        await axios_1.default.post(`${BASE_URL}/hooks/dtone`, {});
        console.log('❓ Unexpected Success');
    }
    catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('❌ Failed (404 Not Found)');
            console.log('   👉 Check order: Webhooks must be mounted BEFORE body-parser in index.ts?');
        }
        else if (error.response) {
            console.log(`✅ Success (Route exists, got expected ${error.response.status})`);
        }
        else {
            console.log(`❌ Error: ${error.message}`);
        }
    }
    console.log('\n🏁 Test Completed.');
}
testRoutes();
