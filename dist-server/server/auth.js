"use strict";
// server/auth.ts
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
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET must be set in production');
}
var JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
// Password requirements
var MIN_PASSWORD_LENGTH = 8;
exports.authService = {
    /**
     * Register a new user
     */
    register: function (email, password, name) {
        return __awaiter(this, void 0, void 0, function () {
            var emailRegex, existingUser, salt, passwordHash, user, token, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRegex.test(email)) {
                            return [2 /*return*/, { success: false, error: 'Invalid email format' }];
                        }
                        // Validate password strength
                        if (password.length < MIN_PASSWORD_LENGTH) {
                            return [2 /*return*/, { success: false, error: "Password must be at least ".concat(MIN_PASSWORD_LENGTH, " characters") }];
                        }
                        return [4 /*yield*/, db_1.db.user.findUnique({ where: { email: email.toLowerCase() } })];
                    case 1:
                        existingUser = _a.sent();
                        if (existingUser) {
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
                        token = this.generateToken(user.id, user.email);
                        console.log("[Auth] \u2705 New user registered: ".concat(user.email));
                        return [2 /*return*/, {
                                success: true,
                                user: {
                                    id: user.id,
                                    email: user.email,
                                    name: user.name,
                                    phone: user.phone
                                },
                                token: token
                            }];
                    case 5:
                        error_1 = _a.sent();
                        console.error('[Auth] Registration error:', error_1);
                        return [2 /*return*/, { success: false, error: 'Registration failed. Please try again.' }];
                    case 6: return [2 /*return*/];
                }
            });
        });
    },
    /**
     * Login user
     */
    login: function (email, password) {
        return __awaiter(this, void 0, void 0, function () {
            var user, isValid, token, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, db_1.db.user.findUnique({ where: { email: email.toLowerCase() } })];
                    case 1:
                        user = _a.sent();
                        if (!user) {
                            return [2 /*return*/, { success: false, error: 'Invalid email or password' }];
                        }
                        return [4 /*yield*/, bcryptjs_1.default.compare(password, user.passwordHash)];
                    case 2:
                        isValid = _a.sent();
                        if (!isValid) {
                            return [2 /*return*/, { success: false, error: 'Invalid email or password' }];
                        }
                        token = this.generateToken(user.id, user.email);
                        console.log("[Auth] \u2705 User logged in: ".concat(user.email));
                        return [2 /*return*/, {
                                success: true,
                                user: {
                                    id: user.id,
                                    email: user.email,
                                    name: user.name,
                                    phone: user.phone
                                },
                                token: token
                            }];
                    case 3:
                        error_2 = _a.sent();
                        console.error('[Auth] Login error:', error_2);
                        return [2 /*return*/, { success: false, error: 'Login failed. Please try again.' }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    },
    /**
     * Verify JWT token and return user
     */
    verifyToken: function (token) {
        return __awaiter(this, void 0, void 0, function () {
            var decoded, user, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
                        return [4 /*yield*/, db_1.db.user.findUnique({ where: { id: decoded.userId } })];
                    case 1:
                        user = _a.sent();
                        if (!user) {
                            return [2 /*return*/, { success: false, error: 'User not found' }];
                        }
                        return [2 /*return*/, {
                                success: true,
                                user: {
                                    id: user.id,
                                    email: user.email,
                                    name: user.name,
                                    phone: user.phone
                                }
                            }];
                    case 2:
                        error_3 = _a.sent();
                        if (error_3.name === 'TokenExpiredError') {
                            return [2 /*return*/, { success: false, error: 'Token expired' }];
                        }
                        return [2 /*return*/, { success: false, error: 'Invalid token' }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    /**
     * Update user profile
     */
    updateProfile: function (userId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var user, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.user.update({
                                where: { id: userId },
                                data: {
                                    name: data.name,
                                    phone: data.phone
                                }
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
                    case 2:
                        error_4 = _a.sent();
                        console.error('[Auth] Update profile error:', error_4);
                        return [2 /*return*/, { success: false, error: 'Failed to update profile' }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    /**
     * Change password
     */
    changePassword: function (userId, currentPassword, newPassword) {
        return __awaiter(this, void 0, void 0, function () {
            var user, isValid, salt, passwordHash, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 6, , 7]);
                        return [4 /*yield*/, db_1.db.user.findUnique({ where: { id: userId } })];
                    case 1:
                        user = _a.sent();
                        if (!user) {
                            return [2 /*return*/, { success: false, error: 'User not found' }];
                        }
                        return [4 /*yield*/, bcryptjs_1.default.compare(currentPassword, user.passwordHash)];
                    case 2:
                        isValid = _a.sent();
                        if (!isValid) {
                            return [2 /*return*/, { success: false, error: 'Current password is incorrect' }];
                        }
                        // Validate new password
                        if (newPassword.length < MIN_PASSWORD_LENGTH) {
                            return [2 /*return*/, { success: false, error: "Password must be at least ".concat(MIN_PASSWORD_LENGTH, " characters") }];
                        }
                        return [4 /*yield*/, bcryptjs_1.default.genSalt(12)];
                    case 3:
                        salt = _a.sent();
                        return [4 /*yield*/, bcryptjs_1.default.hash(newPassword, salt)];
                    case 4:
                        passwordHash = _a.sent();
                        return [4 /*yield*/, db_1.db.user.update({
                                where: { id: userId },
                                data: { passwordHash: passwordHash }
                            })];
                    case 5:
                        _a.sent();
                        console.log("[Auth] \u2705 Password changed for: ".concat(user.email));
                        return [2 /*return*/, { success: true }];
                    case 6:
                        error_5 = _a.sent();
                        console.error('[Auth] Change password error:', error_5);
                        return [2 /*return*/, { success: false, error: 'Failed to change password' }];
                    case 7: return [2 /*return*/];
                }
            });
        });
    },
    /**
     * Generate JWT token
     */
    generateToken: function (userId, email) {
        var payload = { userId: userId, email: email };
        return jsonwebtoken_1.default.sign(payload, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN
        });
    }
};
