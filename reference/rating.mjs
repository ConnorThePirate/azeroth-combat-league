// Community Elo v1. Pure reference, not production auth/storage code.
export const INITIAL = 1500000;
export const WEEK = 7 * 24 * 60 * 60 * 1000;
export function roundAway(x) {
  return Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
}
export function weightFor(priorCount) {
  if (!Number.isSafeInteger(priorCount) || priorCount < 0) throw new Error('Invalid prior count');
  return [1, 0.5, 0.25][priorCount] ?? 0;
}
export function update(a, b, score, weight) {
  if (![a,b].every(Number.isSafeInteger) || ![0,0.5,1].includes(score) || ![0,0.25,0.5,1].includes(weight)) throw new Error('Invalid rating input');
  if (weight === 0) return {a,b,delta:0};
  const exponent = Math.max(-16,Math.min(16,(b-a)/400000));
  const expected = 1/(1+10**exponent);
  const delta = roundAway(32000*weight*(score-expected));
  if (![a+delta,b-delta].every(Number.isSafeInteger)) throw new Error('Rating overflow');
  return {a:a+delta,b:b-delta,delta};
}
export function replay(events) {
  // Inputs are already server-validated and adjudicated. No client clocks here.
  const seenIds = new Set(), seenSeq = new Set();
  for (const e of events) {
    if (seenIds.has(e.id) || seenSeq.has(e.seq)) throw new Error('Duplicate event/receipt');
    seenIds.add(e.id); seenSeq.add(e.seq);
    if (!Number.isSafeInteger(e.seq) || e.seq<0 || !Number.isSafeInteger(e.firstSeen) || !['open','mirror'].includes(e.ladder)) throw new Error('Invalid event');
    if (![e.id,e.season,e.pool,e.bracket,e.a,e.b,e.accountA,e.accountB].every(x=>typeof x==='string'&&x.length>0)) throw new Error('Invalid identity');
    if (!(e.a < e.b)) throw new Error('Participants must use canonical character order');
    if (e.ladder==='mirror' && e.classA!==e.classB) throw new Error('Mirror mismatch');
  }
  const sorted=[...events].sort((a,b)=>a.firstSeen-b.firstSeen || a.seq-b.seq);
  const ratings=new Map(), pairs=new Map(), ledger=[];
  for(const e of sorted) {
    if(!e.eligible || e.accountA===e.accountB) continue;
    const pair=JSON.stringify([e.season,...[e.accountA,e.accountB].sort()]);
    const history=(pairs.get(pair)||[]).filter(t=>t>e.firstSeen-WEEK);
    const weight=weightFor(history.length);
    const ladderKey=[e.season,e.pool,e.bracket,e.ladder,e.ladder==='mirror'?e.classA:null];
    const keyA=JSON.stringify([...ladderKey,e.a]),keyB=JSON.stringify([...ladderKey,e.b]);
    const beforeA=ratings.get(keyA)??INITIAL,beforeB=ratings.get(keyB)??INITIAL;
    const result=update(beforeA,beforeB,e.score,weight);
    ratings.set(keyA,result.a);ratings.set(keyB,result.b);
    ledger.push({id:e.id,seq:e.seq,priorCount:history.length,weight,beforeA,beforeB,...result});
    history.push(e.firstSeen);pairs.set(pair,history);
  }
  return {ratings,ledger};
}
