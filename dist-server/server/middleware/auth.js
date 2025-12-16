"use strict";
// server/middleware/auth.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
var jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
var db_1 = require("../db");
// ✅ SECURITY: Fail fast if JWT_SECRET is missing
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET must be set in environment variables');
}
// ✅ TypeScript now knows JWT_SECRET is definitely a string
var SECRET = JWT_SECRET;
function requireAuth(req, res, next) {
    return __awaiter(this, void 0, void 0, function () {
        var authHeader, cookieToken, token, decoded, user, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    authHeader = req.headers.authorization;
                    cookieToken = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.auth_token;
                    token = cookieToken || ((authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null);
                    if (!token) {
                        return [2 /*return*/, res.status(401).json({ error: 'Authentication required' })];
                    }
                    decoded = jsonwebtoken_1.default.verify(token, SECRET);
                    return [4 /*yield*/, db_1.db.user.findUnique({ where: { id: decoded.id } })];
                case 1:
                    user = _b.sent();
                    if (!user) {
                        return [2 /*return*/, res.status(401).json({ error: 'User not found' })];
                    }
                    req.user = {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        phone: user.phone
                    };
                    next();
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _b.sent();
                    if (error_1.name === 'TokenExpiredError') {
                        return [2 /*return*/, res.status(401).json({ error: 'Token expired' })];
                    }
                    if (error_1.name === 'JsonWebTokenError') {
                        return [2 /*return*/, res.status(401).json({ error: 'Invalid token' })];
                    }
                    return [2 /*return*/, res.status(401).json({ error: 'Authentication failed' })];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function optionalAuth(req, res, next) {
    return __awaiter(this, void 0, void 0, function () {
        var authHeader, cookieToken, token, decoded, user, error_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    authHeader = req.headers.authorization;
                    cookieToken = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.auth_token;
                    token = cookieToken || ((authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null);
                    if (!token) return [3 /*break*/, 2];
                    decoded = jsonwebtoken_1.default.verify(token, SECRET);
                    return [4 /*yield*/, db_1.db.user.findUnique({ where: { id: decoded.id } })];
                case 1:
                    user = _b.sent();
                    if (user) {
                        req.user = {
                            id: user.id,
                            email: user.email,
                            name: user.name,
                            phone: user.phone
                        };
                    }
                    _b.label = 2;
                case 2:
                    next();
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _b.sent();
                    // Token invalid/expired - continue as guest
                    next();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
