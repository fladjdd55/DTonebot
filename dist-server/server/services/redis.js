"use strict";
// server/services/redis.ts
// Handles webhook deduplication and caching
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
exports.getRedis = getRedis;
var ioredis_1 = require("ioredis");
var RedisService = /** @class */ (function () {
    function RedisService() {
        this.client = null;
        this.fallbackCache = new Map();
        this.isRedisAvailable = false;
        this.initialize();
    }
    RedisService.prototype.initialize = function () {
        var _this = this;
        var redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            console.warn('[Redis] No REDIS_URL found. Using in-memory fallback.');
            this.setupFallbackCleanup();
            return;
        }
        try {
            this.client = new ioredis_1.Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                retryStrategy: function (times) {
                    if (times > 3) {
                        console.error('[Redis] Max retries reached. Using fallback.');
                        return null;
                    }
                    return Math.min(times * 100, 2000);
                },
                reconnectOnError: function (err) {
                    console.error('[Redis] Connection error:', err.message);
                    return true;
                }
            });
            this.client.on('connect', function () {
                _this.isRedisAvailable = true;
                console.log('[Redis] Connected successfully');
            });
            this.client.on('error', function (err) {
                _this.isRedisAvailable = false;
                console.error('[Redis] Error:', err.message);
            });
        }
        catch (error) {
            console.error('[Redis] Initialization failed:', error.message);
            this.setupFallbackCleanup();
        }
    };
    /**
     * Cleanup expired entries from fallback cache every 5 minutes
     */
    RedisService.prototype.setupFallbackCleanup = function () {
        var _this = this;
        setInterval(function () {
            var now = Date.now();
            for (var _i = 0, _a = _this.fallbackCache.entries(); _i < _a.length; _i++) {
                var _b = _a[_i], key = _b[0], data = _b[1];
                if (data.expires < now) {
                    _this.fallbackCache.delete(key);
                }
            }
        }, 5 * 60 * 1000);
    };
    /**
     * Get value from Redis or fallback cache
     */
    RedisService.prototype.get = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var error_1, cached;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(this.client && this.isRedisAvailable)) return [3 /*break*/, 4];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.client.get(key)];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        error_1 = _a.sent();
                        console.error('[Redis] GET failed:', error_1.message);
                        return [3 /*break*/, 4];
                    case 4:
                        cached = this.fallbackCache.get(key);
                        if (cached && cached.expires > Date.now()) {
                            return [2 /*return*/, cached.value];
                        }
                        return [2 /*return*/, null];
                }
            });
        });
    };
    /**
     * Set value with TTL (seconds)
     */
    RedisService.prototype.set = function (key, value, ttlSeconds) {
        return __awaiter(this, void 0, void 0, function () {
            var error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(this.client && this.isRedisAvailable)) return [3 /*break*/, 4];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.client.setex(key, ttlSeconds, value)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                    case 3:
                        error_2 = _a.sent();
                        console.error('[Redis] SET failed:', error_2.message);
                        return [3 /*break*/, 4];
                    case 4:
                        // Fallback to in-memory
                        this.fallbackCache.set(key, {
                            value: value,
                            expires: Date.now() + (ttlSeconds * 1000)
                        });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Delete key
     */
    RedisService.prototype.del = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(this.client && this.isRedisAvailable)) return [3 /*break*/, 4];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.client.del(key)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                    case 3:
                        error_3 = _a.sent();
                        console.error('[Redis] DEL failed:', error_3.message);
                        return [3 /*break*/, 4];
                    case 4:
                        this.fallbackCache.delete(key);
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check if key exists
     */
    RedisService.prototype.exists = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var value;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.get(key)];
                    case 1:
                        value = _a.sent();
                        return [2 /*return*/, value !== null];
                }
            });
        });
    };
    /**
     * Increment counter
     */
    RedisService.prototype.incr = function (key, ttlSeconds) {
        return __awaiter(this, void 0, void 0, function () {
            var value, error_4, current, newValue;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(this.client && this.isRedisAvailable)) return [3 /*break*/, 6];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, this.client.incr(key)];
                    case 2:
                        value = _a.sent();
                        if (!ttlSeconds) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.client.expire(key, ttlSeconds)];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4: return [2 /*return*/, value];
                    case 5:
                        error_4 = _a.sent();
                        console.error('[Redis] INCR failed:', error_4.message);
                        return [3 /*break*/, 6];
                    case 6: return [4 /*yield*/, this.get(key)];
                    case 7:
                        current = _a.sent();
                        newValue = (parseInt(current || '0') + 1).toString();
                        return [4 /*yield*/, this.set(key, newValue, ttlSeconds || 3600)];
                    case 8:
                        _a.sent();
                        return [2 /*return*/, parseInt(newValue)];
                }
            });
        });
    };
    /**
     * Close connection gracefully
     */
    RedisService.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.client) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.client.quit()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        this.fallbackCache.clear();
                        return [2 /*return*/];
                }
            });
        });
    };
    return RedisService;
}());
exports.RedisService = RedisService;
// Singleton instance
var redisInstance = null;
function getRedis() {
    if (!redisInstance) {
        redisInstance = new RedisService();
    }
    return redisInstance;
}
