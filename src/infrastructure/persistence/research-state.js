// Concurrent stage snapshots may not erase usage or diagnostics saved meanwhile.
export function mergeResearchState(current={},incoming={}) {
  const next={...incoming},entries=new Map();
  for(const entry of [...(current.apiUsage?.entries||[]),...(next.apiUsage?.entries||[])]){
    const prior=entries.get(entry.id);if(!prior||entry.recordedAt>=prior.recordedAt)entries.set(entry.id,entry);
  }
  if(entries.size)next.apiUsage={version:1,entries:[...entries.values()]};
  if(current.sourceReviewStats)next.sourceReviewStats={reused:Math.max(current.sourceReviewStats.reused||0,next.sourceReviewStats?.reused||0),reviewed:Math.max(current.sourceReviewStats.reviewed||0,next.sourceReviewStats?.reviewed||0)};
  if(current.sourceRelevanceCache||next.sourceRelevanceCache)next.sourceRelevanceCache={...(current.sourceRelevanceCache||{}),...(next.sourceRelevanceCache||{})};
  const diagnostics=new Map([...(current.modelDiagnostics||[]),...(next.modelDiagnostics||[])].map(item=>[item.id||JSON.stringify(item),item]));
  if(diagnostics.size)next.modelDiagnostics=[...diagnostics.values()].sort((a,b)=>String(a.recordedAt).localeCompare(String(b.recordedAt))).slice(-20);
  return next;
}
