"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_MARGIN = exports.GLOBAL_MAX_USD = exports.GLOBAL_MIN_USD = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.GLOBAL_MIN_USD = Number(process.env.MIN_USD_ORDER ||
    process.env.VITE_MIN_USD_ORDER ||
    process.env.MIN_ORDER ||
    5);
// New global maximum to prevent overflows and abuse
exports.GLOBAL_MAX_USD = Number(process.env.MAX_USD_ORDER) || 1000;
exports.FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.25;
