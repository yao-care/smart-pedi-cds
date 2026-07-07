import { resetCoverage } from './helpers/coverage-recorder';

/**
 * Playwright globalSetup：在所有 worker 啟動前跑一次，清空覆蓋紀錄目錄。
 * 放這裡（而非 spec 的 test.beforeAll）才是「一次性 reset」的正確位置——
 * beforeAll 會每 worker 各跑一次而互相清檔（見 coverage-recorder 註解）。
 */
export default function globalSetup(): void {
  resetCoverage();
}
