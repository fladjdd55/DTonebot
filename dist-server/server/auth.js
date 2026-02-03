"use strict";
// server/auth.ts
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.authService = void 0;
var bcryptjs_1 = __importDefault(require("bcryptjs"));
var jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
var db_1 = require("./db");
var uuid_1 = require("uuid");
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET)
    throw new Error('FATAL: JWT_SECRET must be set');
var ACCESS_TOKEN_EXPIRY = '15m';
var REFRESH_TOKEN_EXPIRY_DAYS = 7;
// Helper to generate both tokens
var generateTokens = function (userId, email) { return __awaiter(void 0, void 0, void 0, function () {
    var accessToken, refreshToken, expiresAt;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                accessToken = jsonwebtoken_1.default.sign({ id: userId, email: email }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
                refreshToken = (0, uuid_1.v4)();
                expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
                return [4 /*yield*/, db_1.db.refreshToken.create({
                        data: {
                            token: refreshToken,
                            userId: userId,
                            expiresAt: expiresAt
                        }
                    })];
            case 1:
                _a.sent();
                return [2 /*return*/, { accessToken: accessToken, refreshToken: refreshToken }];
        }
    });
}); };
exports.authService = {
    register: function (email, password, name) {
        return __awaiter(this, void 0, void 0, function () {
            var emailRegex, existing, salt, passwordHash, user, tokens, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 6, , 7]);
                        emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRegex.test(email))
                            return [2 /*return*/, { success: false, error: 'Invalid email' }];
                        if (password.length < 8)
                            return [2 /*return*/, { success: false, error: 'Password too short' }];
                        return [4 /*yield*/, db_1.db.user.findUnique({ where: { email: email.toLowerCase() } })];
                    case 1:
                        existing = _a.sent();
                        if (existing)
                            return [2 /*return*/, { success: false, error: 'Email already registered' }];
                        return [4 /*yield*/, bcryptjs_1.default.genSalt(12)];
                    case 2:
                        salt = _a.sent();
                        return [4 /*yield*/, bcryptjs_1.default.hash(password, salt)];
                    case 3:
                        passwordHash = _a.sent();
                        return [4 /*yield*/, db_1.db.user.create({
                                data: { email: email.toLowerCase(), passwordHash: passwordHash, name: name || null }
                            })];
                    case 4:
                        user = _a.sent();
                        return [4 /*yield*/, generateTokens(user.id, user.email)];
                    case 5:
                        tokens = _a.sent();
                        return [2 /*return*/, __assign({ success: true, user: { id: user.id, email: user.email, name: user.name, phone: user.phone } }, tokens)];
                    case 6:
                        error_1 = _a.sent();
                        console.error('[Auth] Register error:', error_1);
                        return [2 /*return*/, { success: false, error: 'Registration failed' }];
                    case 7: return [2 /*return*/];
                }
            });
        });
    },
    login: function (email, password) {
        return __awaiter(this, void 0, void 0, function () {
            var user, isValid, tokens, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, db_1.db.user.findUnique({ where: { email: email.toLowerCase() } })];
                    case 1:
                        user = _a.sent();
                        if (!user)
                            return [2 /*return*/, { success: false, error: 'Invalid credentials' }];
                        return [4 /*yield*/, bcryptjs_1.default.compare(password, user.passwordHash)];
                    case 2:
                        isValid = _a.sent();
                        if (!isValid)
                            return [2 /*return*/, { success: false, error: 'Invalid credentials' }];
                        return [4 /*yield*/, generateTokens(user.id, user.email)];
                    case 3:
                        tokens = _a.sent();
                        return [2 /*return*/, __assign({ success: true, user: { id: user.id, email: user.email, name: user.name, phone: user.phone } }, tokens)];
                    case 4:
                        error_2 = _a.sent();
                        console.error('[Auth] Login error:', error_2);
                        return [2 /*return*/, { success: false, error: 'Login failed' }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    },
    refreshToken: function (token) {
        return __awaiter(this, void 0, void 0, function () {
            var storedToken, newTokens, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, db_1.db.refreshToken.findUnique({
                                where: { token: token },
                                include: { user: true }
                            })];
                    case 1:
                        storedToken = _a.sent();
                        if (!storedToken || storedToken.revoked || new Date() > storedToken.expiresAt) {
                            return [2 /*return*/, { success: false, error: 'Invalid refresh token' }];
                        }
                        return [4 /*yield*/, db_1.db.refreshToken.update({
                                where: { id: storedToken.id },
                                data: { revoked: true }
                            })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, generateTokens(storedToken.userId, storedToken.user.email)];
                    case 3:
                        newTokens = _a.sent();
                        return [2 /*return*/, __assign({ success: true }, newTokens)];
                    case 4:
                        error_3 = _a.sent();
                        return [2 /*return*/, { success: false, error: 'Refresh failed' }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    },
    revokeToken: function (token) {
        return __awaiter(this, void 0, void 0, function () {
            var e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.refreshToken.update({ where: { token: token }, data: { revoked: true } })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, { success: true }];
                    case 2:
                        e_1 = _a.sent();
                        return [2 /*return*/, { success: false }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    // ✅ FIX: Added ': Promise<AuthResult>' return type
    updateProfile: function (userId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.user.update({ where: { id: userId }, data: data })];
                    case 1:
                        user = _a.sent();
                        return [2 /*return*/, { success: true, user: { id: user.id, email: user.email, name: user.name, phone: user.phone } }];
                }
            });
        });
    },
    // ✅ FIX: Added ': Promise<AuthResult>' return type
    changePassword: function (userId, current, newPass) {
        return __awaiter(this, void 0, void 0, function () {
            var user, isValid, salt, hash;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.user.findUnique({ where: { id: userId } })];
                    case 1:
                        user = _a.sent();
                        if (!user)
                            return [2 /*return*/, { success: false, error: 'User not found' }];
                        return [4 /*yield*/, bcryptjs_1.default.compare(current, user.passwordHash)];
                    case 2:
                        isValid = _a.sent();
                        if (!isValid)
                            return [2 /*return*/, { success: false, error: 'Incorrect password' }];
                        return [4 /*yield*/, bcryptjs_1.default.genSalt(12)];
                    case 3:
                        salt = _a.sent();
                        return [4 /*yield*/, bcryptjs_1.default.hash(newPass, salt)];
                    case 4:
                        hash = _a.sent();
                        return [4 /*yield*/, db_1.db.user.update({ where: { id: userId }, data: { passwordHash: hash } })];
                    case 5:
                        _a.sent();
                        // After password update, revoke all refresh tokens
                        return [4 /*yield*/, db_1.db.refreshToken.updateMany({
                                where: { userId: userId },
                                data: { revoked: true }
                            })];
                    case 6:
                        // After password update, revoke all refresh tokens
                        _a.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        });
    }
};
