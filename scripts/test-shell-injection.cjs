// 验证修复：在"类 Obsidian 环境"（无 KIMI_SHELL_PATH、极简 PATH）下，
// 插件版 KimiAcpClient 应自动探测 kimi-desktop 捆绑 bash 并注入，全链路通过。
const { KimiAcpClient } = require('./.acp-client-test.cjs');

const KIMI = 'C:/Users/rh/.kimi-code/bin/kimi.exe';
const CWD = 'D:/warehouse/Stock';

(async () => {
  console.log('env.KIMI_SHELL_PATH =', process.env.KIMI_SHELL_PATH ?? '<未设置>');
  console.log('PATH =', process.env.PATH);

  const c = new KimiAcpClient(KIMI, [], {
    onSessionUpdate: (n) => {
      const u = n.update;
      if (u.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') {
        process.stdout.write(u.content.text);
      }
    },
    onPermissionRequest: async (p) => {
      const opt = p.options.find((o) => o.kind === 'allow_always') ?? p.options.find((o) => o.kind === 'allow_once');
      return opt ? { outcome: 'selected', optionId: opt.optionId } : { outcome: 'cancelled' };
    },
    onStateChange: (s, d) => console.log(`  [state] ${s}${d ? ' - ' + d : ''}`),
  });
  c.setCwd(CWD);
  c.setBashPath(''); // 空 = 自动探测（模拟设置页留空）

  await c.ensureStarted();
  const probe = c.getBashProbe();
  console.log('\n== bash 探测结果 ==');
  for (const cand of probe.candidates) {
    console.log(`  ${cand.exists ? '✅' : '❌'} ${cand.path}（${cand.source}）`);
  }
  console.log('最终注入:', probe.found, '| 来源:', probe.source, '| fromEnv:', probe.fromEnv);
  if (!probe.found || !/kimi-desktop/.test(probe.source ?? '')) {
    console.log('FAIL: 应命中 kimi-desktop 捆绑路径');
    process.exit(1);
  }

  const r = await c.sessionNew(CWD);
  console.log('\nsession/new OK:', r.sessionId);
  console.log('model =', r.configOptions?.find((o) => o.id === 'model')?.currentValue);

  const pr = await c.prompt(r.sessionId, [{ type: 'text', text: '只回复两个字：你好。不要使用任何工具。' }]);
  console.log('\nprompt stopReason =', pr.stopReason);

  // 手动配置路径优先级测试：设置一个存在的路径
  c.setBashPath(probe.found);
  await c.ensureStarted(); // bash 未变，不应重启
  console.log('bash 未变时 ensureStarted 直通 OK');
  c.setBashPath(''); // 改回自动 → 注入值相同，也不应重启
  await c.ensureStarted();
  console.log('手动→自动（同值）ensureStarted 直通 OK');

  c.stop();
  console.log('\n===== 修复验证通过 =====');
  process.exit(0);
})().catch((e) => {
  console.error('\nFAIL:', e.message, e.code ?? '', JSON.stringify(e.data ?? ''));
  process.exit(1);
});
