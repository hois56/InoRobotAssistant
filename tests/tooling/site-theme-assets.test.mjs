import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {once} from 'node:events';
import test from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

// Exercise the launcher server, whose public-directory allowlist differs from the test server.
test('로컬 실행 서버가 전체 페이지의 공통 테마 CSS를 제공한다',async t=>{
 const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
 const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const server=spawn(process.execPath,['tools/serve-local.cjs',String(port)],{stdio:'ignore',windowsHide:true});
 t.after(()=>server.kill());
 let response;
 for(let attempt=0;attempt<50;attempt++){
  try{response=await fetch(`http://127.0.0.1:${port}/shared/astryx-theme.css`);break;}catch{await delay(100);}
 }
 assert.ok(response,'Local preview server did not start');
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/text\/css/);
 assert.match(await response.text(),/--ino-bg:\s*#10151d/);
});
