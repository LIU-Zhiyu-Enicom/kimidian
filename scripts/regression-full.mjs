import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
/**
 * 全流程回归（干净环境）：
 * initialize → session/new → 流式 prompt → fs 反向 RPC →
 * 切模型(k3) → 切 effort(thinking=low) → 再发一条 prompt 验证切换后可用
 */
const KIMI = 'C:/Users/rh/.kimi-code/bin/kimi.exe';
const CWD = 'D:/warehouse/Stock';
const p = spawn(KIMI, ['acp'], { stdio: ['pipe','pipe','pipe'], cwd: CWD, windowsHide: true });
let buf = '';
let sid = null;
let fsReads = 0;
let step = '';
const send = (o) => p.stdin.write(JSON.stringify(o)+'\n');
const mark = (s) => { step = s; console.log(`\n===== ${s} =====`); };

p.stdout.on('data', d => { buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0,i).trim(); buf = buf.slice(i+1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.method === 'session/update') {
      const u = m.params?.update;
      if (u?.sessionUpdate === 'agent_message_chunk') process.stdout.write(u.content?.text ?? '');
      continue;
    }
    if (m.method && m.id != null) {
      if (m.method === 'fs/read_text_file') {
        fsReads++;
        console.log(`\n[fs/read #${fsReads}] ${m.params.path}`);
        fsp.readFile(m.params.path, 'utf8').then(
          c => p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{content:c}})+'\n'),
          e => p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32603,message:String(e)}})+'\n'));
      } else if (m.method === 'session/request_permission') {
        const opts = m.params?.options ?? [];
        const opt = opts.find(o=>o.kind==='allow_always') ?? opts.find(o=>o.kind==='allow_once');
        p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{outcome: opt?{outcome:'selected',optionId:opt.optionId}:{outcome:'cancelled'}}})+'\n');
      }
      continue;
    }
    if (m.method) continue;
    if (m.error) { console.log(`\n[${step}] 错误:`, JSON.stringify(m.error)); p.kill(); process.exit(1); }
    switch (m.id) {
      case 1:
        mark('initialize OK');
        send({jsonrpc:'2.0',id:2,method:'session/new',params:{cwd:CWD,mcpServers:[]}});
        break;
      case 2:
        sid = m.result.sessionId;
        console.log('session/new OK, sessionId =', sid);
        console.log('初始 model =', m.result.configOptions.find(o=>o.id==='model')?.currentValue);
        mark('prompt #1（要求读文件，验证 fs 反向 RPC + 流式）');
        send({jsonrpc:'2.0',id:3,method:'session/prompt',params:{sessionId:sid,prompt:[{type:'text',text:'读取 SCHEMA.md，用一句话概括它是什么。'}]}});
        break;
      case 3:
        console.log('\nprompt #1 stopReason =', m.result.stopReason, '| fs 读取次数 =', fsReads);
        if (fsReads === 0) { console.log('FAIL: 未触发 fs 反向 RPC'); p.kill(); process.exit(1); }
        mark('切换模型 → k3');
        send({jsonrpc:'2.0',id:4,method:'session/set_config_option',params:{sessionId:sid,configId:'model',value:'kimi-code/k3'}});
        break;
      case 4: {
        const opts = m.result.configOptions;
        console.log('model 现在 =', opts.find(o=>o.id==='model')?.currentValue);
        const th = opts.find(o=>o.id==='thinking');
        console.log('thinking 选项 =', JSON.stringify(th?.options?.map(x=>x.value)), '当前 =', th?.currentValue);
        mark('切换 effort → low');
        send({jsonrpc:'2.0',id:5,method:'session/set_config_option',params:{sessionId:sid,configId:'thinking',value:'low'}});
        break;
      }
      case 5: {
        const th = m.result.configOptions.find(o=>o.id==='thinking');
        console.log('thinking 现在 =', th?.currentValue);
        mark('prompt #2（验证 k3+low effort 下可用）');
        send({jsonrpc:'2.0',id:6,method:'session/prompt',params:{sessionId:sid,prompt:[{type:'text',text:'只回复两个字：你好。不要使用任何工具。'}]}});
        break;
      }
      case 6:
        console.log('\nprompt #2 stopReason =', m.result.stopReason);
        console.log('\n===== 全部通过 =====');
        console.log('sessionId 供 state.json 核查:', sid);
        p.kill(); process.exit(0);
    }
  }});
p.stderr.on('data', d => console.error('[stderr]', d.toString().trim().slice(0,300)));
p.on('error', e => { console.error('spawn err', e); process.exit(1); });
send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:1,clientCapabilities:{fs:{readTextFile:true,writeTextFile:true},terminal:false},clientInfo:{name:'kimidian',version:'0.1.0'}}});
setTimeout(()=>{ console.error('TIMEOUT at step:', step); p.kill(); process.exit(2); }, 240000);
