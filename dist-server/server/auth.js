"use strict";
// server/auth.ts - FIXED VERSION
// Key Changes:
// 1. Token rotation with rollback on failure
// 2. Device fingerprinting
// 3. Rate limiting per user
// 4. Encrypted refresh tokens
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
var crypto_1 = __importDefault(require("crypto"));
var db_1 = require("./db");
var uuid_1 = require("uuid");
var redis_1 = require("./services/redis");
var redis = (0, redis_1.getRedis)();
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET)
    throw new Error('FATAL: JWT_SECRET must be set');
var ACCESS_TOKEN_EXPIRY = '15m';
var REFRESH_TOKEN_EXPIRY_DAYS = 7;
// Encryption for refresh tokens at rest
var ENCRYPTION_KEY = process.env.REFRESH_TOKEN_ENCRYPTION_KEY || JWT_SECRET;
function encrypt(text) {
    var iv = crypto_1.default.randomBytes(16);
    var cipher = crypto_1.default.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    var encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}
function decrypt(text) {
    var parts = text.split(':');
    var iv = Buffer.from(parts[0], 'hex');
    var encrypted = parts[1];
    var decipher = crypto_1.default.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    var decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
/**
 * Generate device fingerprint for anomaly detection
 */
function generateDeviceFingerprint(device) {
    var data = "".concat(device.ip, ":").concat(device.userAgent);
    return crypto_1.default.createHash('sha256').update(data).digest('hex').slice(0, 16);
}
/**
 * Check rate limiting per user
 */
function checkRateLimit(userId, action) {
    return __awaiter(this, void 0, void 0, function () {
        var key, count, limits;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    key = "ratelimit:".concat(action, ":").concat(userId);
                    return [4 /*yield*/, redis.incr(key, 3600)];
                case 1:
                    count = _a.sent();
                    limits = {
                        login: 10,
                        refresh: 50,
                        password_change: 5
                    };
                    return [2 /*return*/, count <= (limits[action] || 10)];
            }
        });
    });
}
/**
 * Generate both access and refresh tokens with device tracking
 */
function generateTokens(userId, email, device) {
    return __awaiter(this, void 0, void 0, function () {
        var fingerprint, accessToken, refreshTokenRaw, expiresAt, encryptedToken;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    fingerprint = generateDeviceFingerprint(device);
                    accessToken = jsonwebtoken_1.default.sign({
                        id: userId,
                        email: email,
                        fingerprint: fingerprint // Include for verification
                    }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
                    refreshTokenRaw = (0, uuid_1.v4)();
                    expiresAt = new Date();
                    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
                    encryptedToken = encrypt(refreshTokenRaw);
                    return [4 /*yield*/, db_1.db.refreshToken.create({
                            data: {
                                token: encryptedToken,
                                userId: userId,
                                expiresAt: expiresAt
                            }
                        })];
                case 1:
                    _a.sent();
                    // Store device fingerprint for this token
                    return [4 /*yield*/, redis.set("device:".concat(userId, ":").concat(refreshTokenRaw), fingerprint, REFRESH_TOKEN_EXPIRY_DAYS * 86400)];
                case 2:
                    // Store device fingerprint for this token
                    _a.sent();
                    return [2 /*return*/, { accessToken: accessToken, refreshToken: refreshTokenRaw }];
            }
        });
    });
}
exports.authService = {
    register: function (email, password, name, device) {
        return __awaiter(this, void 0, void 0, function () {
            var emailRegex, existing, salt, passwordHash, user, tokens, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 6, , 7]);
                        emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRegex.test(email)) {
                            return [2 /*return*/, { success: false, error: 'Invalid email' }];
                        }
                        if (password.length < 8) {
                            return [2 /*return*/, { success: false, error: 'Password must be at least 8 characters' }];
                        }
                        return [4 /*yield*/, db_1.db.user.findUnique({
                                where: { email: email.toLowerCase() }
                            })];
                    case 1:
                        existing = _a.sent();
                        if (existing) {
                            return [2 /*return*/, { success: false, error: 'Email already registered' }];
                        }
                        return [4 /*yield*/, bcryptjs_1.default.genSalt(12)];
                    case 2:
                        salt = _a.sent();
                        return [4 /*yield*/, bcryptjs_1.default.hash(password, salt)];
                    case 3:
                        passwordHash = _a.sent();
                        return [4 /*yield*/, db_1.db.user.create({
                                data: {
                                    email: email.toLowerCase(),
                                    passwordHash: passwordHash,
                                    name: name || null
                                }
                            })];
                    case 4:
                        user = _a.sent();
                        return [4 /*yield*/, generateTokens(user.id, user.email, device || { ip: 'unknown', userAgent: 'unknown' })];
                    case 5:
                        tokens = _a.sent();
                        return [2 /*return*/, __assign({ success: true, user: {
                                    id: user.id,
                                    email: user.email,
                                    name: user.name,
                                    phone: user.phone
                                } }, tokens)];
                    case 6:
                        error_1 = _a.sent();
                        console.error('[Auth] Register error:', error_1);
                        return [2 /*return*/, { success: false, error: 'Registration failed' }];
                    case 7: return [2 /*return*/];
                }
            });
        });
    },
    login: function (email, password, device) {
        return __awaiter(this, void 0, void 0, function () {
            var user, allowed, isValid, tokens, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        return [4 /*yield*/, db_1.db.user.findUnique({
                                where: { email: email.toLowerCase() }
                            })];
                    case 1:
                        user = _a.sent();
                        if (!user) {
                            return [2 /*return*/, { success: false, error: 'Invalid credentials' }];
                        }
                        return [4 /*yield*/, checkRateLimit(user.id, 'login')];
                    case 2:
                        allowed = _a.sent();
                        if (!allowed) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: 'Too many login attempts. Please try again later.'
                                }];
                        }
                        return [4 /*yield*/, bcryptjs_1.default.compare(password, user.passwordHash)];
                    case 3:
                        isValid = _a.sent();
                        if (!isValid) {
                            return [2 /*return*/, { success: false, error: 'Invalid credentials' }];
                        }
                        return [4 /*yield*/, generateTokens(user.id, user.email, device || { ip: 'unknown', userAgent: 'unknown' })];
                    case 4:
                        tokens = _a.sent();
                        return [2 /*return*/, __assign({ success: true, user: {
                                    id: user.id,
                                    email: user.email,
                                    name: user.name,
                                    phone: user.phone
                                } }, tokens)];
                    case 5:
                        error_2 = _a.sent();
                        console.error('[Auth] Login error:', error_2);
                        return [2 /*return*/, { success: false, error: 'Login failed' }];
                    case 6: return [2 /*return*/];
                }
            });
        });
    },
    /**
     * FIXED: Token rotation with rollback on failure
     */
    refreshToken: function (token, device) {
        return __awaiter(this, void 0, void 0, function () {
            var allTokens, storedToken, _i, allTokens_1, t, decrypted, userId, allowed, storedFingerprint, currentFingerprint, newTokens, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 7, , 8]);
                        return [4 /*yield*/, db_1.db.refreshToken.findMany({
                                where: { revoked: false },
                                include: { user: true }
                            })];
                    case 1:
                        allTokens = _a.sent();
                        storedToken = null;
                        for (_i = 0, allTokens_1 = allTokens; _i < allTokens_1.length; _i++) {
                            t = allTokens_1[_i];
                            try {
                                decrypted = decrypt(t.token);
                                if (decrypted === token) {
                                    storedToken = t;
                                    break;
                                }
                            }
                            catch (e) {
                                // Token decryption failed, skip
                                continue;
                            }
                        }
                        if (!storedToken || new Date() > storedToken.expiresAt) {
                            return [2 /*return*/, { success: false, error: 'Invalid or expired refresh token' }];
                        }
                        userId = storedToken.userId;
                        return [4 /*yield*/, checkRateLimit(userId, 'refresh')];
                    case 2:
                        allowed = _a.sent();
                        if (!allowed) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: 'Too many refresh attempts'
                                }];
                        }
                        return [4 /*yield*/, redis.get("device:".concat(userId, ":").concat(token))];
                    case 3:
                        storedFingerprint = _a.sent();
                        currentFingerprint = generateDeviceFingerprint(device);
                        if (storedFingerprint && storedFingerprint !== currentFingerprint) {
                            console.warn("[Security] Device mismatch for user ".concat(userId));
                            // Allow but log - could be VPN/network change
                        }
                        return [4 /*yield*/, generateTokens(userId, storedToken.user.email, device)];
                    case 4:
                        newTokens = _a.sent();
                        // Only revoke old token AFTER new ones are created
                        return [4 /*yield*/, db_1.db.refreshToken.update({
                                where: { id: storedToken.id },
                                data: { revoked: true }
                            })];
                    case 5:
                        // Only revoke old token AFTER new ones are created
                        _a.sent();
                        // Clean up old device fingerprint
                        return [4 /*yield*/, redis.del("device:".concat(userId, ":").concat(token))];
                    case 6:
                        // Clean up old device fingerprint
                        _a.sent();
                        return [2 /*return*/, __assign(__assign({ success: true }, newTokens), { user: {
                                    id: storedToken.user.id,
                                    email: storedToken.user.email,
                                    name: storedToken.user.name,
                                    phone: storedToken.user.phone
                                } })];
                    case 7:
                        error_3 = _a.sent();
                        console.error('[Auth] Refresh error:', error_3);
                        return [2 /*return*/, { success: false, error: 'Refresh failed' }];
                    case 8: return [2 /*return*/];
                }
            });
        });
    },
    revokeToken: function (token) {
        return __awaiter(this, void 0, void 0, function () {
            var allTokens, _i, allTokens_2, t, decrypted, e_1, e_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 10, , 11]);
                        return [4 /*yield*/, db_1.db.refreshToken.findMany({
                                where: { revoked: false }
                            })];
                    case 1:
                        allTokens = _a.sent();
                        _i = 0, allTokens_2 = allTokens;
                        _a.label = 2;
                    case 2:
                        if (!(_i < allTokens_2.length)) return [3 /*break*/, 9];
                        t = allTokens_2[_i];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 7, , 8]);
                        decrypted = decrypt(t.token);
                        if (!(decrypted === token)) return [3 /*break*/, 6];
                        return [4 /*yield*/, db_1.db.refreshToken.update({
                                where: { id: t.id },
                                data: { revoked: true }
                            })];
                    case 4:
                        _a.sent();
                        // Clean device fingerprint
                        return [4 /*yield*/, redis.del("device:".concat(t.userId, ":").concat(token))];
                    case 5:
                        // Clean device fingerprint
                        _a.sent();
                        return [2 /*return*/, { success: true }];
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        e_1 = _a.sent();
                        return [3 /*break*/, 8];
                    case 8:
                        _i++;
                        return [3 /*break*/, 2];
                    case 9: return [2 /*return*/, { success: false }];
                    case 10:
                        e_2 = _a.sent();
                        return [2 /*return*/, { success: false }];
                    case 11: return [2 /*return*/];
                }
            });
        });
    },
    updateProfile: function (userId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.user.update({
                            where: { id: userId },
                            data: data
                        })];
                    case 1:
                        user = _a.sent();
                        return [2 /*return*/, {
                                success: true,
                                user: {
                                    id: user.id,
                                    email: user.email,
                                    name: user.name,
                                    phone: user.phone
                                }
                            }];
                }
            });
        });
    },
    changePassword: function (userId, current, newPass) {
        return __awaiter(this, void 0, void 0, function () {
            var allowed, user, isValid, salt, hash;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, checkRateLimit(userId, 'password_change')];
                    case 1:
                        allowed = _a.sent();
                        if (!allowed) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: 'Too many password change attempts'
                                }];
                        }
                        return [4 /*yield*/, db_1.db.user.findUnique({ where: { id: userId } })];
                    case 2:
                        user = _a.sent();
                        if (!user)
                            return [2 /*return*/, { success: false, error: 'User not found' }];
                        return [4 /*yield*/, bcryptjs_1.default.compare(current, user.passwordHash)];
                    case 3:
                        isValid = _a.sent();
                        if (!isValid)
                            return [2 /*return*/, { success: false, error: 'Incorrect current password' }];
                        return [4 /*yield*/, bcryptjs_1.default.genSalt(12)];
                    case 4:
                        salt = _a.sent();
                        return [4 /*yield*/, bcryptjs_1.default.hash(newPass, salt)];
                    case 5:
                        hash = _a.sent();
                        return [4 /*yield*/, db_1.db.user.update({
                                where: { id: userId },
                                data: { passwordHash: hash }
                            })];
                    case 6:
                        _a.sent();
                        // Revoke all refresh tokens (force re-login on all devices)
                        return [4 /*yield*/, db_1.db.refreshToken.updateMany({
                                where: { userId: userId },
                                data: { revoked: true }
                            })];
                    case 7:
                        // Revoke all refresh tokens (force re-login on all devices)
                        _a.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        });
    },
    /**
     * Clean up expired tokens (run daily via cron)
     */
    cleanupExpiredTokens: function () {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.refreshToken.deleteMany({
                            where: {
                                OR: [
                                    { expiresAt: { lt: new Date() } },
                                    { revoked: true }
                                ]
                            }
                        })];
                    case 1:
                        result = _a.sent();
                        console.log("[Auth] Cleaned up ".concat(result.count, " expired tokens"));
                        return [2 /*return*/, result.count];
                }
            });
        });
    }
};
