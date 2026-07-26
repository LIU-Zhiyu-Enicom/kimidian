// 权限策略 + 滚动跟随 + 上下文用量解析 + configOptions 映射 单元测试
const pp = require('./.pp-test.cjs');
const sf = require('./.sf-test.cjs');
const us = require('./.usage-test.cjs');
const co = require('./.co-test.cjs');
const at = require('./.attach-test.cjs');
const cp = require('./.copy-test.cjs');
const mf = require('./.mf-test.cjs');
const sp = require('./.sp-test.cjs');
const mt = require('./.mt-test.cjs');

let failed = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✅ ${name}`);
  else { console.log(`  ❌ ${name}: 期望 ${e}，实际 ${a}`); failed++; }
}

console.log('== toolKeyOf：稳定工具标识 ==');
// 同一工具不同 toolCallId（不进入 key 计算）→ key 必须相同
const k1 = pp.toolKeyOf({ title: 'ReadFile', kind: 'read' });
const k2 = pp.toolKeyOf({ title: 'ReadFile', kind: 'read' });
eq(k1 === k2, true, '相同工具 key 稳定');
eq(k1, 'read:ReadFile', 'kind+工具名格式');
eq(pp.toolKeyOf({ title: 'WriteFile', kind: 'edit' }) !== k1, true, '不同工具 key 不同');
eq(pp.toolKeyOf({ title: '运行命令: npm test', kind: 'execute' }), 'execute:运行命令', '中文标题取首段');
eq(pp.toolKeyOf({ title: '', kind: '' }), 'unknown', '空标题兜底 unknown');

console.log('== isReadOnlyTool：只读判定 ==');
eq(pp.isReadOnlyTool({ kind: 'read' }), true, 'kind=read');
eq(pp.isReadOnlyTool({ kind: 'search' }), true, 'kind=search');
eq(pp.isReadOnlyTool({ kind: 'fetch' }), true, 'kind=fetch');
eq(pp.isReadOnlyTool({ kind: 'think' }), true, 'kind=think');
eq(pp.isReadOnlyTool({ kind: 'edit' }), false, 'kind=edit');
eq(pp.isReadOnlyTool({ kind: 'execute' }), false, 'kind=execute');
eq(pp.isReadOnlyTool({ kind: 'delete' }), false, 'kind=delete');
eq(pp.isReadOnlyTool({ title: 'ReadFile' }), true, '标题 ReadFile');
eq(pp.isReadOnlyTool({ title: 'SearchWeb' }), true, '标题 SearchWeb');
eq(pp.isReadOnlyTool({ title: 'WriteFile' }), false, '标题 WriteFile');
eq(pp.isReadOnlyTool({ title: '运行命令: ls' }), false, '标题含"运行命令"');
eq(pp.isReadOnlyTool({ title: '删除文件' }), false, '标题含"删除"');

console.log('== decidePermission：三种模式 + 记忆 ==');
const writeCall = { title: 'WriteFile', kind: 'edit' };
const readCall = { title: 'ReadFile', kind: 'read' };
const granted = new Set(['edit:WriteFile']);
eq(pp.decidePermission('ask', readCall, new Set()), 'ask', 'ask 模式只读也询问');
eq(pp.decidePermission('ask', writeCall, new Set()), 'ask', 'ask 模式写操作询问');
eq(pp.decidePermission('ask', writeCall, granted), 'auto-allow', 'ask 模式命中记忆 → 自动允许');
eq(pp.decidePermission('smart', readCall, new Set()), 'auto-allow', 'smart 只读自动允许');
eq(pp.decidePermission('smart', writeCall, new Set()), 'ask', 'smart 写操作仍询问');
eq(pp.decidePermission('smart', writeCall, granted), 'auto-allow', 'smart 命中记忆 → 自动允许');
eq(pp.decidePermission('yolo', writeCall, new Set()), 'auto-allow', 'yolo 全部允许');
eq(pp.decidePermission('yolo', { title: '删除重要文件', kind: 'delete' }, new Set()), 'auto-allow', 'yolo 删除也允许');

console.log('== migratePermissionMode：旧设置迁移 ==');
eq(pp.migratePermissionMode({ autoApprove: true }), 'yolo', 'autoApprove=true → yolo');
eq(pp.migratePermissionMode({ autoApprove: false }), 'ask', 'autoApprove=false → ask');
eq(pp.migratePermissionMode({}), 'ask', '空设置 → ask');
eq(pp.migratePermissionMode(null), 'ask', 'null → ask');
eq(pp.migratePermissionMode({ permissionMode: 'smart' }), 'smart', '已有新字段不迁移');
eq(pp.migratePermissionMode({ permissionMode: 'smart', autoApprove: true }), 'smart', '新字段优先于旧布尔');

console.log('== cliModeFor：CLI 双写映射 ==');
eq(pp.cliModeFor('ask'), 'default', 'ask → default');
eq(pp.cliModeFor('smart'), 'default', 'smart → default');
eq(pp.cliModeFor('yolo'), 'yolo', 'yolo → yolo');

console.log('== isNearBottom / ScrollFollow：滚动跟随 ==');
eq(sf.isNearBottom(940, 500, 1500), true, '距底 60px 内 → true（边界）');
eq(sf.isNearBottom(939, 500, 1500), false, '距底 61px → false');
eq(sf.isNearBottom(1000, 500, 1500), true, '正好贴底 → true');
eq(sf.isNearBottom(0, 500, 1500), false, '顶部 → false');
eq(sf.isNearBottom(0, 500, 400), true, '无滚动（内容不满一屏）→ true');
const f = new sf.ScrollFollow();
eq(f.shouldAutoScroll(), true, '初始跟随');
f.onScroll(0, 500, 1500);
eq(f.shouldAutoScroll(), false, '上翻后不再自动滚');
f.onScroll(0, 500, 1600);
eq(f.shouldAutoScroll(), false, '新内容增长仍不跟随');
f.onScroll(1450, 500, 2000);
eq(f.shouldAutoScroll(), true, '滚回底部附近恢复跟随');
f.onScroll(0, 500, 2000);
f.stick();
eq(f.shouldAutoScroll(), true, 'stick() 强制恢复');

console.log('== parseWireUsage / computeContextUsage：上下文用量 ==');
// 真实 wire.jsonl 样本（来自实测会话，含无关行与坏行）
const wireSample = [
  '{"type":"metadata","protocol_version":"1.4"}',
  '{"type":"llm.request","kind":"loop","model":"kimi-for-coding","modelAlias":"kimi-code/kimi-for-coding","maxTokens":262144,"time":1}',
  '{"type":"turn.prompt","input":[{"type":"text","text":"hi"}]}',
  'not json at all',
  '{"type":"usage.record","model":"kimi-code/kimi-for-coding","usage":{"inputOther":3099,"output":32,"inputCacheRead":18176,"inputCacheCreation":0},"usageScope":"turn","time":2}',
  '{"type":"usage.record","model":"kimi-code/kimi-for-coding","usage":{"inputOther":5000,"output":100,"inputCacheRead":20000,"inputCacheCreation":1000},"usageScope":"turn","time":3}',
].join('\n');
const parsed = us.parseWireUsage(wireSample);
eq(parsed.maxTokens, 262144, '解析 llm.request 的 maxTokens');
eq(parsed.usage?.inputOther, 5000, '取最后一次 usage.record');
eq(parsed.usage?.model, 'kimi-code/kimi-for-coding', '解析模型名');
const cu = us.computeContextUsage(parsed);
eq(cu?.used, 5000 + 100 + 20000 + 1000, 'used = 输入总量 + 输出');
eq(cu?.total, 262144, 'total 来自 wire 实测');
eq(cu?.pct, Math.round((26100 / 262144) * 100), '百分比换算');
eq(cu?.exact, true, 'exact 标记（wire 提供窗口）');
// 无 maxTokens → 按模型查内置表
const noMax = us.computeContextUsage({
  usage: { model: 'kimi-code/kimi-for-coding', inputOther: 131072, output: 0, inputCacheRead: 0, inputCacheCreation: 0 },
  maxTokens: null,
});
eq(noMax?.total, 262144, '无 maxTokens 时查内置表（kimi-for-coding）');
eq(noMax?.pct, 50, '内置表 50% 换算');
eq(noMax?.exact, false, 'exact=false（内置估值）');
// 未知模型且无 maxTokens → null（不造假）
eq(us.computeContextUsage({
  usage: { model: 'unknown-model', inputOther: 1, output: 0, inputCacheRead: 0, inputCacheCreation: 0 },
  maxTokens: null,
}), null, '未知模型无窗口 → null');
// 无 usage 记录 → null
eq(us.computeContextUsage({ usage: null, maxTokens: 262144 }), null, '无用量记录 → null');
eq(us.parseWireUsage('').usage, null, '空文本 → 无用量');
eq(us.parseWireUsage('{"type":"x"}\n{bad').maxTokens, null, '坏行跳过');
// k3 内置表
const k3 = us.computeContextUsage({
  usage: { model: 'kimi-code/k3', inputOther: 524288, output: 0, inputCacheRead: 0, inputCacheCreation: 0 },
  maxTokens: null,
});
eq(k3?.total, 1048576, 'k3 内置窗口 1048576');
eq(k3?.pct, 50, 'k3 50% 换算');

console.log('== 字符估算兜底（无 usage.record 时） ==');
// 估算样本：含中文/英文/数字的混合内容记录（模拟 OAuth 截断 wire）
const estSample = [
  '{"type":"config.update","systemPrompt":"You are Kimi Code CLI, an interactive general AI agent."}',
  '{"type":"turn.prompt","input":[{"type":"text","text":"只回复ok"}]}',
  '{"type":"context.append_loop_event","event":{"type":"content.part","part":{"type":"think","think":"用户要求只回复ok。"}}}',
  'not json',
].join('\n');
const chars = us.estimateWireChars(estSample);
eq(chars.cjk, 10, 'CJK 字符计数（只回复3 + 用户要求只回复7）');
eq(chars.other > 60, true, `英文字符计数（实际 ${chars.other}）`);
eq(us.estimateTokens(100, 400), 150, 'token 换算：100 CJK÷2 + 400÷4');
eq(us.estimateTokens(0, 0), 0, '空内容 → 0');
const est = us.computeEstimatedUsage({ ...chars, maxTokens: 262144, model: 'kimi-code/kimi-for-coding' });
eq(est?.estimated, true, '估算标记 estimated=true');
eq(est?.exact, true, '分母来自 wire 实测 maxTokens');
eq(est?.pct, Math.min(100, Math.round((us.estimateTokens(chars.cjk, chars.other) / 262144) * 100)), '估算百分比');
eq(us.computeEstimatedUsage({ cjk: 0, other: 0, maxTokens: 262144, model: null }), null, '无内容 → null');
const estFb = us.computeEstimatedUsage({ cjk: 100, other: 0, maxTokens: null, model: 'kimi-code/k3' });
eq(estFb?.total, 1048576, '估算分母查内置表');
eq(estFb?.exact, false, '内置分母 exact=false');

console.log('== configOptions → 下拉状态映射 ==');
// 探针实测结构（对象形 options）
const OPTS = [
  { id: 'model', name: 'Model', category: 'model', currentValue: 'kimi-code/kimi-for-coding',
    options: [
      { value: 'kimi-code/kimi-for-coding', name: 'K2.7 Coding' },
      { value: 'kimi-code/kimi-for-coding-highspeed', name: 'K2.7 Coding Highspeed' },
      { value: 'kimi-code/k3', name: 'K3' },
    ] },
  { id: 'thinking', name: 'Thinking', category: 'thought_level', currentValue: 'on',
    options: [{ value: 'on', name: 'On' }] },
  { id: 'mode', name: 'Mode', category: 'mode', currentValue: 'default',
    options: [{ value: 'default', name: 'Default' }, { value: 'yolo', name: 'Yolo' }] },
];
eq(co.pickModelOption(OPTS)?.id, 'model', 'pickModelOption 命中 model');
eq(co.pickThinkingOption(OPTS)?.id, 'thinking', 'pickThinkingOption 命中 thinking');
eq(co.pickModelOption([OPTS[2]])?.id, undefined, 'mode 项不会误判为 model');
eq(co.pickModelOption(null), null, 'null → null');
// selectViewState 状态机
const model = co.pickModelOption(OPTS);
const thinking = co.pickThinkingOption(OPTS);
eq(co.selectViewState({ option: model, label: '模型', hasSession: false, fallbackText: 'K3' }),
  { kind: 'placeholder', text: '模型：K3' }, '无会话 → 占位文本');
eq(co.selectViewState({ option: null, label: '思考', hasSession: true, fallbackText: null }),
  { kind: 'hidden' }, '思考无数据 → 隐藏');
eq(co.selectViewState({ option: thinking, label: '思考', hasSession: true, fallbackText: null }),
  { kind: 'hidden' }, '思考单档 → 隐藏不占位');
eq(co.selectViewState({ option: { id: 'model', options: [{ value: 'a', name: 'A' }], currentValue: 'a' }, label: '模型', hasSession: true, fallbackText: 'x' }),
  { kind: 'single', text: '模型：A' }, '模型单档 → 文本');
const selState = co.selectViewState({ option: model, label: '模型', hasSession: true, fallbackText: null });
eq(selState.kind, 'select', '多档 → select');
eq(selState.options.length, 3, 'select 3 选项');
eq(selState.current, 'kimi-code/kimi-for-coding', 'select 当前值');
eq(selState.options[2], { value: 'kimi-code/k3', label: 'K3' }, '选项 label 用显示名');
// normalizeModelInput：完整 ID / 显示名 / 末段短名 / 空 / 非法
eq(co.normalizeModelInput('kimi-code/k3', model, ''), { value: 'kimi-code/k3', recognized: true }, '完整 ID 原样');
eq(co.normalizeModelInput('K3', model, ''), { value: 'kimi-code/k3', recognized: true }, '显示名（大小写不敏感）→ 完整 ID');
eq(co.normalizeModelInput('k3', model, ''), { value: 'kimi-code/k3', recognized: true }, '末段短名 → 完整 ID');
eq(co.normalizeModelInput('', model, 'kimi-code/k3'), { value: 'kimi-code/k3', recognized: true }, '空输入 → 默认模型');
eq(co.normalizeModelInput('gpt-5', model, '').recognized, false, '非法值 recognized=false');
eq(co.normalizeModelInput('k3', null, '').recognized, false, '无选项表 → 未证实');
// summarizeConfigOptions：诊断摘要
eq(co.summarizeConfigOptions(OPTS),
  'configOptions: 3 项 [model=kimi-code/kimi-for-coding(3 选项), thinking=on(1 选项), mode=default(2 选项)]',
  '诊断摘要格式');
eq(co.summarizeConfigOptions([]), 'configOptions: <空>', '空摘要');
eq(co.DEFAULT_MODEL, 'kimi-code/k3', '默认模型 = K3');

console.log('== attachments：分类 / mime / 截断 / 注入格式 ==');
eq(at.classifyFile('a.png'), 'image', 'png → image');
eq(at.classifyFile('photo.JPG'), 'image', 'JPG 大写 → image');
eq(at.classifyFile('notes.MD'), 'text', 'MD 大写 → text');
eq(at.classifyFile('data.csv'), 'text', 'csv → text');
eq(at.classifyFile('archive.zip'), 'binary', 'zip → binary');
eq(at.classifyFile('report.pdf'), 'binary', 'pdf → binary');
eq(at.classifyFile('noext'), 'binary', '无扩展名 → binary');
eq(at.imageMimeFor('a.png'), 'image/png', 'png mime');
eq(at.imageMimeFor('a.jpeg'), 'image/jpeg', 'jpeg mime');
eq(at.imageMimeFor('a.gif'), 'image/gif', 'gif mime');
eq(at.imageMimeFor('a.webp'), 'image/webp', 'webp mime');
eq(at.imageMimeFor('a.txt'), null, '非图片 mime → null');
eq(at.truncateText('短文本', 100), { text: '短文本', truncated: false }, '短文本不截断');
const longT = at.truncateText('x'.repeat(500), 100);
eq(longT.truncated, true, '超长标记截断');
eq(longT.text.length, 100, '截断到 maxChars');
eq(at.fileRefXml('C:/v/n.md', '内容', false), '<file path="C:/v/n.md">\n内容\n</file>', 'fileRefXml 未截断格式');
eq(at.fileRefXml('C:/v/n.md', '内容', true).includes('…（内容过长，已截断）'), true, 'fileRefXml 截断标注');
eq(at.binaryRefLine('attachments/kimidian/a.zip'),
  '[附件] attachments/kimidian/a.zip（已存入仓库，可用工具读取）', 'binaryRefLine 格式');
eq(at.formatSize(500), '500 B', 'formatSize B');
eq(at.formatSize(2048), '2.0 KB', 'formatSize KB');
eq(at.formatSize(10 * 1024 * 1024), '10.0 MB', 'formatSize MB');
eq(at.bytesToBase64(new Uint8Array([104, 105])), 'aGk=', 'bytesToBase64 编码');
eq(at.bytesToBase64(new Uint8Array(0)), '', '空字节 → 空串');
eq(Buffer.from(at.bytesToBase64(new Uint8Array([1, 2, 3, 255])), 'base64').toString('hex'),
  '010203ff', 'base64 往返一致');
eq(at.MAX_IMAGE_BYTES, 10 * 1024 * 1024, '图片上限 10MB');
eq(at.BINARY_STORE_DIR, 'attachments/kimidian', '二进制附件目录');

console.log('== copyTextFor：可复制的消息种类 ==');
eq(cp.copyTextFor('user', '你好'), '你好', 'user 可复制');
eq(cp.copyTextFor('assistant', '回复'), '回复', 'assistant 可复制');
eq(cp.copyTextFor('thought', '思考'), '思考', 'thought 可复制');
eq(cp.copyTextFor('tool', 'x'), null, 'tool 不可复制');
eq(cp.copyTextFor('system', 'x'), null, 'system 不可复制');
eq(cp.copyTextFor('error', 'x'), null, 'error 不可复制');
eq(cp.copyTextFor('user', ''), null, '空文本 → null');

console.log('== message-filter：内部注入剥离 ==');
eq(mf.stripInternalBlocks('你好'), '你好', '无注入原样');
eq(mf.stripInternalBlocks('问个问题<system-reminder>\n内部提醒内容\n</system-reminder>'),
  '问个问题', '成对 reminder 块剥离');
eq(mf.stripInternalBlocks('<system-reminder>abc</system-reminder>用户正文<system-reminder>def</system-reminder>'),
  '用户正文', '多个 reminder 块全剥');
eq(mf.stripInternalBlocks('正文<system-reminder>未闭合的尾巴'),
  '正文', '未闭合尾巴剥离');
eq(mf.INTERNAL_BLOCK_TAGS.includes('system-reminder'), true, '过滤列表可扩展且含 system-reminder');

console.log('== message-filter：上下文引用折叠 ==');
const r1 = mf.extractContextRefs('看看这个<active-note path="笔记/计划.md" />');
eq(r1.text, '看看这个', 'active-note 从正文移除');
eq(r1.refs, [{ kind: 'note', path: '笔记/计划.md', label: '计划.md' }], 'active-note → note ref');
const r2 = mf.extractContextRefs('正文<file path="C:/v/a.md">\n文件内容很多\n</file>结尾');
eq(r2.text, '正文结尾', 'file 块（含内容）移除');
eq(r2.refs, [{ kind: 'file', path: 'C:/v/a.md', label: 'a.md' }], 'file → file ref（basename）');
const r3 = mf.extractContextRefs('正文<file path="C:/v/b.md">\n未闭合内容一直到结束');
eq(r3.refs.length, 1, '未闭合 file 尾巴也折叠');
eq(r3.text, '正文', '未闭合 file 尾巴从正文移除');
const r4 = mf.extractContextRefs('帮我分析\n[附件] attachments/kimidian/data.zip（已存入仓库，可用工具读取）');
eq(r4.text, '帮我分析', '[附件] 行移除');
eq(r4.refs, [{ kind: 'attachment', path: 'attachments/kimidian/data.zip', label: 'data.zip' }],
  '[附件] → attachment ref');

console.log('== message-filter：formatUserDisplay 组合 ==');
const d1 = mf.formatUserDisplay('我的问题<system-reminder>todo 提醒</system-reminder>');
eq(d1, { text: '我的问题', refs: [] }, '正文+注入 → 只留正文');
const d2 = mf.formatUserDisplay('<system-reminder>\n纯注入消息\n</system-reminder>');
eq(d2, { text: '', refs: [] }, '纯注入 → 空（调用方跳过渲染）');
const d3 = mf.formatUserDisplay('总结这个文件\n\n<file path="C:/v/n.md">\n内容\n</file>');
eq(d3.text, '总结这个文件', '正文保留');
eq(d3.refs.length, 1, '引用折叠为标签');
eq(mf.formatUserDisplay('a\n\n\n\nb').text, 'a\n\nb', '剥离留下的空行收拢');

console.log('== selection-pop：选区信息提取 ==');
const selRoot = { contains: (n) => n === 'inside' };
eq(sp.selectionInfoIn(selRoot, null), null, '无选区 → null');
eq(sp.selectionInfoIn(selRoot, { isCollapsed: true, rangeCount: 0, anchorNode: 'inside', toString: () => '' }),
  null, '折叠选区 → null');
eq(sp.selectionInfoIn(selRoot, { isCollapsed: false, rangeCount: 1, anchorNode: 'inside', toString: () => '   ' }),
  null, '纯空白选中 → null');
eq(sp.selectionInfoIn(selRoot, { isCollapsed: false, rangeCount: 1, anchorNode: 'outside', toString: () => 'abc' }),
  null, '锚点在容器外 → null');
const si1 = sp.selectionInfoIn(selRoot, {
  isCollapsed: false, rangeCount: 1, anchorNode: 'inside', toString: () => '选中文字',
  getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 10, top: 20, right: 110, bottom: 40 }) }),
});
eq(si1.text, '选中文字', '提取选中文字');
eq(si1.rect.top, 20, '带选区包围盒');
eq(sp.selectionInfoIn(selRoot, { isCollapsed: false, rangeCount: 0, anchorNode: 'inside', toString: () => 'x' }).rect,
  null, '无 range → rect null 兜底');
eq(sp.selectionInfoIn(selRoot, {
  isCollapsed: false, rangeCount: 1, anchorNode: 'inside', toString: () => 'x',
  getRangeAt: () => { throw new Error('dead range'); },
}).rect, null, 'getRangeAt 异常 → rect null 兜底');

console.log('== selection-pop：浮层定位 ==');
const rootRect = { left: 0, top: 0, right: 400, bottom: 600, width: 400, height: 600 };
const btnSize = { width: 64, height: 26 };
eq(sp.selCopyPos({ left: 100, top: 200, right: 200, bottom: 220 }, rootRect, btnSize),
  { left: 136, top: 168 }, '正常：选区上方右对齐');
eq(sp.selCopyPos({ left: 380, top: 10, right: 398, bottom: 26 }, rootRect, btnSize).left,
  332, '右越界夹回容器内');
eq(sp.selCopyPos({ left: 380, top: 10, right: 398, bottom: 26 }, rootRect, btnSize).top,
  4, '上越界夹回容器内');
eq(sp.selCopyPos(null, rootRect, btnSize), { left: 328, top: 8 }, '无矩形 → 容器右上角兜底');

console.log('== msg-time：formatMsgTime 当天/跨天 ==');
{
  const day = (h, m) => new Date(2026, 6, 24, h, m).getTime(); // 2026-07-24 本地
  const nowSame = day(18, 0);
  const nowNext = new Date(2026, 6, 25, 8, 0).getTime();
  eq(mt.formatMsgTime(day(9, 5), nowSame), '09:05', '当天 → HH:MM（补零）');
  eq(mt.formatMsgTime(day(23, 59), nowSame), '23:59', '当天深夜 → HH:MM');
  eq(mt.formatMsgTime(day(9, 5), nowNext), '7/24 09:05', '跨天 → M/D HH:MM（月日不补零）');
  eq(mt.formatMsgTime(new Date(2025, 11, 31, 3, 7).getTime(), nowSame),
    '12/31 03:07', '跨年 → M/D HH:MM');
}

console.log('== msg-time：parseWireMsgTimes 提取与过滤 ==');
{
  const wire = [
    JSON.stringify({ type: 'context.append_message', message: { role: 'user', content: [], origin: { kind: 'user' } }, time: 1000 }),
    JSON.stringify({ type: 'context.append_message', message: { role: 'user', content: [], origin: { kind: 'injection', variant: 'todo_list_reminder' } }, time: 1500 }),
    JSON.stringify({ type: 'context.append_message', message: { role: 'user', content: [], origin: { kind: 'system_trigger', name: 'subagent' } }, time: 1600 }),
    JSON.stringify({ type: 'context.append_loop_event', event: { type: 'step.begin', turnId: '0' }, time: 1700 }),
    JSON.stringify({ type: 'context.append_loop_event', event: { type: 'step.end', turnId: '0' }, time: 2000 }),
    JSON.stringify({ type: 'context.append_message', message: { role: 'user', content: [], origin: { kind: 'user' } }, time: 3000 }),
    JSON.stringify({ type: 'context.append_loop_event', event: { type: 'step.end', turnId: '1' }, time: 4000 }),
    JSON.stringify({ type: 'context.append_loop_event', event: { type: 'step.end', turnId: '1' }, time: 4500 }),
    JSON.stringify({ type: 'usage.record', usageScope: 'turn', time: 4600 }),
    'not-json-line',
  ].join('\n');
  const times = mt.parseWireMsgTimes(wire);
  eq(times, [
    { role: 'user', time: 1000 },
    { role: 'assistant', time: 2000 },
    { role: 'user', time: 3000 },
    { role: 'assistant', time: 4500 },
  ], 'user 取 append_message、assistant 取该轮最后 step.end，注入/触发/step.begin 过滤');
  eq(mt.parseWireMsgTimes(''), [], '空内容 → 空序列');
}

console.log('== msg-time：backfillEntryTimes 对位与兜底 ==');
{
  const times = [
    { role: 'user', time: 1000 },
    { role: 'assistant', time: 2000 },
    { role: 'user', time: 3000 },
    { role: 'assistant', time: 4500 },
  ];
  const entries = [
    { kind: 'user', ts: 999, tsEst: true },
    { kind: 'assistant', ts: 999, tsEst: true },
    { kind: 'thought', text: 'x' },
    { kind: 'assistant', ts: 999, tsEst: true }, // 同轮被工具切段：共享该轮回答时间
    { kind: 'user', ts: 999, tsEst: true },
    { kind: 'assistant', ts: 999, tsEst: true },
  ];
  const changed = mt.backfillEntryTimes(entries, times, 5000);
  eq(changed, true, '有改动返回 true');
  eq(entries.map((e) => [e.kind, e.ts, !!e.tsEst]), [
    ['user', 1000, false],
    ['assistant', 2000, false],
    ['thought', undefined, false],
    ['assistant', 2000, false],
    ['user', 3000, false],
    ['assistant', 4500, false],
  ], '按轮对位，同轮多个 assistant 共享回答时间，thought 不动');
  eq(mt.backfillEntryTimes(entries, times, 5000), false, '已回填再跑 → 无改动返回 false');
  // wire 缺 assistant 记录：assistant 兜底估算
  const e2 = [{ kind: 'user', ts: 111, tsEst: true }, { kind: 'assistant' }];
  mt.backfillEntryTimes(e2, [{ role: 'user', time: 1000 }], 5000);
  eq(e2[0].ts === 1000 && e2[0].tsEst === false, true, 'user 回填');
  eq(e2[1].ts === 5000 && e2[1].tsEst === true, true, 'assistant 无记录 → 兜底时间 + 估算标记');
  // wire 为空：全部估算
  const e3 = [{ kind: 'user' }, { kind: 'assistant' }];
  mt.backfillEntryTimes(e3, [], 7000);
  eq(e3.every((e) => e.ts === 7000 && e.tsEst === true), true, 'wire 空 → 全部兜底估算');
}

console.log(failed === 0 ? '\n===== 全部单测通过 =====' : `\n===== ${failed} 项失败 =====`);
process.exit(failed === 0 ? 0 : 1);
