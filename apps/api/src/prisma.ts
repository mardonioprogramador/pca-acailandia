import {PrismaClient} from '@prisma/client';
import {config} from 'dotenv';
import {fileURLToPath} from 'node:url';

// npm workspaces executa o servidor em apps/api; .env pertence à raiz.
config({path: fileURLToPath(new URL('../../../.env', import.meta.url))});
export const prisma = new PrismaClient();
