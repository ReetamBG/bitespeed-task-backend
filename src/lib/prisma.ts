import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

type PrismaTransactionalClient = Parameters<
    Parameters<PrismaClient['$transaction']>[0]
>[0];

export { prisma, type PrismaTransactionalClient };