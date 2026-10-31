import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['apps/api/tests/**/*.test.ts','packages/shared/src/**/*.test.ts'],fileParallelism:false,testTimeout:30000,hookTimeout:60000,pool:'forks',maxWorkers:1}});
