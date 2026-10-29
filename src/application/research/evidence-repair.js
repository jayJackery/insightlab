import {knownCatalogMetrics,redundantCatalogQuery} from '../../domain/research/catalog-policy.js?v=7860f20d981283d9';
import {inspectSources} from './search-workflow.js?v=7860f20d981283d9';
import {deduplicateSources} from '../../infrastructure/search/search.js?v=7860f20d981283d9';
import {independentDocumentCount} from '../../domain/evidence/source-document.js?v=7860f20d981283d9';
import {EVIDENCE_REPAIR_LIMITS,evidenceGaps,queryKey} from '../../domain/evidence/evidence-gaps.js?v=7860f20d981283d9';
import {mapConcurrent} from './concurrency.js?v=7860f20d981283d9';
import {digest} from '../../domain/evidence/source-document.js?v=7860f20d981283d9';

// Budget is persisted before each external request; retrying a task cannot reset its spend.
export async function repairEvidence({input,plan,research,evidence,sources,search,review,snapshotSources,rebuild,persist}) {
  const delivery=plan.delivery;
  const limits=delivery?{...EVIDENCE_REPAIR_LIMITS,rounds:delivery.repairRounds,totalQueries:delivery.repairQueries,queriesPerRound:Math.min(EVIDENCE_REPAIR_LIMITS.queriesPerRound,delivery.repairQueries),maxSources:delivery.maxSources+delivery.repairQueries*3}:EVIDENCE_REPAIR_LIMITS;
  research.queryRuns ||= [];research.searchRounds ||= [];research.searchWarnings ||= [];
  if(research.evidenceRepair?.contractSignature!==research.contractSignature)research.evidenceRepair={contractSignature:research.contractSignature,roundsUsed:0,queriesUsed:0,attempts:[],events:[],limits};
  const state=research.evidenceRepair;
  if(state.stopReason) {state.previousStops=[...(state.previousStops || []).slice(-9),{reason:state.stopReason,at:new Date().toISOString()}];delete state.stopReason;}
  for(const attempt of [...state.attempts,...research.queryRuns])if(attempt.kind==='evidence_followup'&&attempt.status==='running') {attempt.status='failed';attempt.error='上次执行被中断，已保留消耗的查询预算';}
  const record=()=>persist({research,evidence});
  let current=sources;
  state.gaps=evidenceGaps(evidence,input);
  await record();
  while(state.gaps.length&&state.roundsUsed<limits.rounds&&state.queriesUsed<limits.totalQueries&&current.length<limits.maxSources) {
    const used=new Set([...(research.queryRuns || []).map((item)=>queryKey(item.query)),...state.attempts.map((item)=>queryKey(item.query))]);
    const selected=[];
    for(const gap of state.gaps) {
      const query=(gap.queries || [gap.query]).find((value)=>!used.has(queryKey(value))&&!redundantCatalogQuery(value,knownCatalogMetrics(current,input,plan)));
      if(!query)continue;
      used.add(queryKey(query));selected.push({...gap,query});
      if(selected.length===Math.min(limits.queriesPerRound,limits.totalQueries-state.queriesUsed))break;
    }
    if(!selected.length) {state.stopReason='no_new_queries';break;}
    state.roundsUsed++;
    const round={kind:'evidence_followup',round:state.roundsUsed,queries:selected.map((gap)=>gap.query),gapIds:selected.map((gap)=>gap.id),sourceCount:current.length,status:'running'};
    research.searchRounds.push(round);
    const attempts=selected.map(gap=>({gapId:gap.id,query:gap.query,product:gap.product,metric:gap.metric,reason:gap.reason,kind:'evidence_followup',round:state.roundsUsed,status:'pending'}));
    state.queriesUsed+=attempts.length;state.attempts.push(...attempts);research.queryRuns.push(...attempts);
    // Reserve the entire bounded round before any parallel request can start.
    await record();
    const foundByQuery=await mapConcurrent(selected,3,async(gap,index)=>{
      const attempt=attempts[index];attempt.status='running';attempt.startedAt=new Date().toISOString();
      research.currentActivity='核验后补查 '+state.roundsUsed+'/'+limits.rounds+'：'+gap.query;
      research.searchProgress={...research.searchProgress,currentQuery:gap.query,currentQueries:attempts.filter(item=>item.status==='running').map(item=>item.query),totalQueries:research.queryRuns.length};
      await record();
      try {
        const found=await search(gap.query,input);
        if(!Array.isArray(found))throw Error('搜索服务没有返回来源数组');
        attempt.status='completed';attempt.resultCount=found.length;
        return found;
      } catch(error) {
        attempt.status='failed';attempt.error=error.message;
        research.searchWarnings.push('核验后补查失败：'+error.message);
      } finally {
        attempt.completedAt=new Date().toISOString();
        research.searchProgress.completedQueries=research.queryRuns.filter(run=>run.status==='completed').length;
        research.searchProgress.currentQueries=attempts.filter(item=>item.status==='running').map(item=>item.query);
        await record();
      }
      return [];
    });
    const previousGapIds=new Set(state.gaps.map(gap=>gap.id));
    const beforeFingerprint=digest(JSON.stringify(current.map(source=>[source.id,source.url,source.content,source.relevance,source.sourceType,source.contentKind,source.catalogRecord])));
    const inspected=await inspectSources(deduplicateSources(foundByQuery.flat()),input,review);
    const oldIds=new Set(current.map(source=>source.id)),previous=new Map(current.map(source=>[source.id,source.document?.contentHash]));
    let nextId=Math.max(0,...current.map(source=>Number(String(source.id).slice(1))||0));
    const next=deduplicateSources([...current,...inspected.accepted]).map(source=>({...source,id:oldIds.has(source.id)?source.id:'S'+(++nextId),retrievedAt:source.retrievedAt||new Date().toISOString()})).slice(0,limits.maxSources);
    current=await snapshotSources(next);research.sources=current;
    research.rejectedSources=[...(research.rejectedSources||[]),...inspected.rejected];
    for(const attempt of attempts){attempt.acceptedCount=inspected.accepted.filter(source=>source.queries?.includes(attempt.query)).length;}
    round.addedCount=current.filter(source=>!previous.has(source.id)).length;
    round.updatedCount=current.filter(source=>previous.has(source.id)&&previous.get(source.id)!==source.document?.contentHash).length;
    research.searchProgress={...research.searchProgress,sourceCount:current.length,independentDocumentCount:independentDocumentCount(current),currentQueries:[]};
    const changed=beforeFingerprint!==digest(JSON.stringify(current.map(source=>[source.id,source.url,source.content,source.relevance,source.sourceType,source.contentKind,source.catalogRecord])));
    round.reusedUnchangedEvidence=!changed;
    await record();
    if(changed)evidence=await rebuild(current);
    state.gaps=evidenceGaps(evidence,input);
    const remainingIds=new Set(state.gaps.map(gap=>gap.id));
    const resolvedGap=[...previousGapIds].some(id=>!remainingIds.has(id));
    state.events.push({round:state.roundsUsed,remainingGapIds:state.gaps.map((gap)=>gap.id),checkedAt:new Date().toISOString()});
    round.status='completed';round.completedAt=new Date().toISOString();round.sourceCount=current.length;
    research.searchQuality={...research.searchQuality,acceptedCount:current.length,independentDocumentCount:independentDocumentCount(current),evidenceRepairRounds:state.roundsUsed};
    await record();
    if(state.roundsUsed>1&&round.addedCount+round.updatedCount===0&&!resolvedGap){state.stopReason='low_yield';state.events.push({round:state.roundsUsed,reason:'low_yield',remainingGapIds:state.gaps.map(gap=>gap.id)});break;}
  }
  state.stopReason ||= !state.gaps.length?'resolved':current.length>=limits.maxSources?'source_limit':state.roundsUsed>=limits.rounds||state.queriesUsed>=limits.totalQueries?'budget_exhausted':'no_new_queries';
  research.currentActivity=state.gaps.length?'核验补查已结束，仍有'+state.gaps.length+'项缺口':'证据核验与补查已完成';
  await record();
  return {sources:current,evidence};
}
