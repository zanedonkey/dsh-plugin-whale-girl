import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {actionPose,MOTION_ACTIONS} from '../src/motion.js';
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url));
const active=JSON.parse(read('assets/active-atlases.json'));

test('approved rice pixels remain unchanged and preview and production embed the active artwork',()=>{
  assert.equal(createHash('sha256').update(read(`assets/${active.eating}`)).digest('hex'),'1608aee6fcd437d511906bcff148ea344b7a3e8564c9419618bb538709992352');
  const context={window:{}};vm.runInNewContext(read('preview/runtime.js').toString(),context);
  const client=read('lib/client.js').toString();
  for(const [key,file] of Object.entries(active)){
    const bytes=read(`assets/${file}`),data=`data:image/png;base64,${bytes.toString('base64')}`;
    assert.equal(bytes.readUInt32BE(16),1254);assert.equal(bytes.readUInt32BE(20),1254);assert.equal(bytes[25],6);
    assert.equal(context.window.WhalePet.assets[key],data,`${key} preview must use the active original PNG`);
    assert.ok(client.includes(JSON.stringify(data)),`${key} production must embed the same original PNG`);
  }
});

test('all visible native action drawings fit their grounded viewport after the artwork update',()=>{
  const seen=new Set();
  for(const action of MOTION_ACTIONS)for(let elapsed=0;elapsed<=16000;elapsed+=20){
    const p=actionPose(action,elapsed),key=`${p.assetKey}/${p.sourceFrame??p.frame}`;
    if(seen.has(key))continue;seen.add(key);
    assert.ok(active[p.assetKey],`${action} must use the active atlas set`);
    const [x,y,w,h]=p.rect,[mx,my,mw,mh]=p.mask;
    assert.ok(mx>=x&&my>=y&&mx+mw<=x+w&&my+mh<=y+h,`${key} must retain its complete registered silhouette`);
  }
  assert.ok(seen.size>=45,'cover standing glances, loops, meal, recovery and static reactions');
});
