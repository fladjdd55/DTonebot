"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
var client_1 = require("@prisma/client");
// ✅ Standard Prisma 5 initialization
exports.db = new client_1.PrismaClient();
