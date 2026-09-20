import test from 'node:test';
import assert from 'node:assert/strict';
import {INITIAL,WEEK,roundAway,update,weightFor,replay} from './rating.mjs';
const event=(id,seq,extra={})=>({id,seq,firstSeen:seq*1000,season:'s',pool:'p',bracket:'20',ladder:'open',a:'char-a',b:'char-b',accountA:'acct-a',accountB:'acct-b',classA:'mage',classB:'mage',score:1,eligible:true,...extra});
test('equal-rating golden examples',()=>{
  for(const [w,d] of [[1,16000],[.5,8000],[.25,4000],[0,0]]) assert.deepEqual(update(INITIAL,INITIAL,1,w),{a:INITIAL+d,b:INITIAL-d,delta:d});
  assert.equal(update(INITIAL,INITIAL,.5,1).delta,0);
});
test('favorite and underdog golden examples',()=>{
  assert.equal(update(1700000,1500000,1,1).delta,7688);
  assert.equal(update(1700000,1500000,0,1).delta,-24312);
});
test('three wins and repeat cutoff',()=>{
  const {ledger}=replay([1,2,3,4].map(n=>event(String(n),n)));
  assert.deepEqual(ledger.map(x=>x.weight),[1,.5,.25,0]);
  assert.equal(ledger[2].a,1526732);
  assert.equal(ledger[3].delta,0);
});
test('round ties away from zero',()=>{assert.equal(roundAway(1.5),2);assert.equal(roundAway(-1.5),-2);});
test('exact seven-day boundary expires',()=>{
  const x=replay([event('1',1,{firstSeen:0}),event('2',2,{firstSeen:WEEK})]);
  assert.equal(x.ledger[1].weight,1);
});
test('before boundary counts and same-time sequence breaks tie',()=>{
  const x=replay([event('3',3,{firstSeen:WEEK-1}),event('2',2,{firstSeen:0}),event('1',1,{firstSeen:0})]);
  assert.deepEqual(x.ledger.map(x=>x.weight),[1,.5,.25]);
});
test('alt and ladder changes share repeat counter',()=>{
  const x=replay([event('1',1),event('2',2,{a:'char-c',b:'char-d',ladder:'mirror'})]);
  assert.equal(x.ledger[1].weight,.5);
  assert.equal(x.ledger[1].beforeA,INITIAL);
});
test('invalid and same-account events cannot consume credit',()=>{
  const x=replay([event('1',1,{eligible:false}),event('2',2,{accountB:'acct-a'}),event('3',3)]);
  assert.equal(x.ledger.length,1);assert.equal(x.ledger[0].weight,1);
});
test('replay is independent of input arrival order',()=>{
  const es=[event('1',1),event('2',2,{score:0}),event('3',3)];
  assert.deepEqual(replay(es),replay([...es].reverse()));
});
test('voiding an old event rebuilds weights and downstream ratings',()=>{
  const es=[event('1',1),event('2',2),event('3',3)];
  const fixed=replay(es.map(e=>({...e,eligible:e.id!=='1'})));
  assert.deepEqual(fixed,replay(es.slice(1)));
  assert.deepEqual(fixed.ledger.map(x=>x.weight),[1,.5]);
});
test('duplicate event and receipt rejected',()=>{
  assert.throws(()=>replay([event('1',1),event('1',2)]));
  assert.throws(()=>replay([event('1',1),event('2',1)]));
});
test('invalid numeric input rejected',()=>{
  assert.throws(()=>update(NaN,INITIAL,1,1));assert.throws(()=>weightFor(-1));
});
test('mass conservation, bounded delta, and monotonic upset reward',()=>{
  for(let a=0;a<=3000000;a+=150000) for(let b=0;b<=3000000;b+=150000) for(const w of [0,.25,.5,1]) for(const s of [0,.5,1]) {
    const x=update(a,b,s,w);assert.equal(x.a+x.b,a+b);assert.ok(Math.abs(x.delta)<=32000*w);
  }
  assert.ok(update(1300000,1700000,1,1).delta>update(1700000,1300000,1,1).delta);
});
