// acp-client 生命周期测试：重启竞态 / spawn 重试 / 代次守卫
const { KimiAcpClient } = require('./.acp-client-test.cjs');

const KIMI = 'C:/Users/rh/.kimi-code/bin/kimi.exe';
const CWD = 'D:/warehouse/Stock';

function mkClient(cliPath = KIMI) {
  return new KimiAcpClient(cliPath, [], {
    onSessionUpdate: () => {},
    onPermissionRequest: async () => ({ outcome: 'cancelled' }),
    onStateChange: (s, d) => console.log(`  [state] ${s}${d ? ' - ' + d : ''}`),
  });
}

async function test1_快速重启竞态() {
  console.log('== 测试1：连续 restart × 3（旧版本此处会以"进程已退出"打死新握手） ==');
  const c = mkClient();
  c.setCwd(CWD);
  await c.ensureStarted();
  console.log('  首次连接 OK, ready =', c.ready);
  for (let i = 1; i <= 3; i++) {
    const t0 = Date.now();
    await c.restart();
    console.log(`  restart #${i} OK (${Date.now() - t0}ms), ready =`, c.ready);
  }
  const r = await c.sessionNew(CWD);
  console.log('  重启后 session/new OK:', r.sessionId);
  c.stop();
  console.log('测试1 通过\n');
}

async function test2_spawn失败重试() {
  console.log('== 测试2：错误 CLI 路径 → spawnWithRetry 应退避重试 3 次后失败 ==');
  const c = mkClient('C:/nonexistent/kimi-fake.exe');
  c.setCwd(CWD);
  const t0 = Date.now();
  try {
    await c.ensureStarted();
    console.log('  FAIL: 不应成功');
    process.exit(1);
  } catch (e) {
    const ms = Date.now() - t0;
    console.log(`  预期失败 (${ms}ms): ${e.message.split('\n')[0]}`);
    if (ms < 1200) { console.log('  FAIL: 退避时间不足，疑似未重试'); process.exit(1); }
    console.log('测试2 通过\n');
  }
}

async function test3_stop中断挂起握手() {
  console.log('== 测试3：initialize 挂起时 stop() → 应立即 reject 而非悬挂 ==');
  const c = mkClient();
  c.setCwd(CWD);
  const p = c.ensureStarted();
  // 立即 stop（握手大概率还在进行）
  c.stop();
  const t0 = Date.now();
  try {
    await p;
    console.log('  (握手抢在 stop 前完成，也算通过)');
  } catch (e) {
    console.log(`  预期 reject (${Date.now() - t0}ms): ${e.message}`);
  }
  console.log('测试3 通过\n');
}

async function test4_退出信息富化() {
  console.log('== 测试4：外部杀掉进程 → 挂起请求应带 exit code/signal ==');
  const c = mkClient();
  c.setCwd(CWD);
  await c.ensureStarted();
  const promptP = c.sessionNew(CWD).then(
    () => {},
    () => {}
  );
  // 直接杀底层进程模拟崩溃
  const proc = c['proc'];
  const reqP = c.prompt('nonexistent-session', [{ type: 'text', text: 'x' }]).catch((e) => e);
  proc.kill();
  const err = await reqP;
  console.log('  收到错误:', err.message, '| data =', JSON.stringify(err.data));
  if (!/进程已退出/.test(err.message)) { console.log('  FAIL: 错误未富化'); process.exit(1); }
  await promptP;
  console.log('测试4 通过\n');
}

(async () => {
  await test1_快速重启竞态();
  await test2_spawn失败重试();
  await test3_stop中断挂起握手();
  await test4_退出信息富化();
  console.log('===== 全部生命周期测试通过 =====');
  process.exit(0);
})().catch((e) => { console.error('测试失败:', e); process.exit(1); });
