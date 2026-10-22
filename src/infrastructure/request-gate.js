// Process-local provider pressure control. Queued work does not consume quota.
export function createRequestGate(maximum) {
  let active=0, limit=maximum, notBefore=0, timer;
  const pending=[];
  function pump() {
    clearTimeout(timer);
    const delay=notBefore-Date.now();
    if(delay>30000){while(pending.length)pending.shift().reject(Error('服务要求较长限流等待，已保留检查点，请稍后重试。'));return;}
    if (delay>0) { if(pending.length)timer=setTimeout(pump,delay); return; }
    while(active<limit && pending.length) { active++; pending.shift().resolve(); }
  }
  return {
    async run(work) {
      const queuedAt=Date.now();
      await new Promise((resolve,reject)=>{pending.push({resolve,reject});pump();});
      try { return await work({queueMs:Date.now()-queuedAt,concurrency:limit}); }
      finally {active--;pump();}
    },
    rateLimited(header) {
      const seconds=Number(header), date=Date.parse(header);
      const delayMs=header && Number.isFinite(seconds)?Math.max(1000,seconds*1000):Number.isFinite(date)?Math.max(1000,date-Date.now()):3000;
      limit=1;notBefore=Math.max(notBefore,Date.now()+delayMs);pump();
      return delayMs;
    },
  };
}
