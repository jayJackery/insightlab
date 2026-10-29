// Explicit, user-triggered export; never includes service configuration.
export function researchDiagnostic(repository, buildId, redact) {
  const task = repository.rawTasks().slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (!task) throw Error('尚无研究记录。');
  const blocked = /^(?:api[_-]?key|.*_API_KEY|authorization|password|token|services|serviceConfig|rawResponse|rawModelResponse)$/i;
  const raw = JSON.stringify({format:'insightlab-research-diagnostic',buildId,exportedAt:new Date().toISOString(),task}, (key,value)=>blocked.test(key)?undefined:value,2);
  return redact(raw);
}

export function installResearchDiagnostics(repository, buildId, redact) {
  let button=document.getElementById('research-diagnostic-export');
  if(!button){
    button=document.createElement('button');button.id='research-diagnostic-export';button.type='button';
    button.textContent='导出最近研究诊断';
    const host=document.querySelector('.browser-session-notice')||document.querySelector('.topbar');
    if(!host)return;
    host.append(button);
  }
  button.onclick=()=>{
    try {
      const blob=new Blob([researchDiagnostic(repository,buildId,redact)],{type:'application/json;charset=utf-8'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='InsightLab研究诊断_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
      link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    } catch(error){button.title=redact(error.message);button.textContent='诊断导出失败：'+button.title;}
  };
  let inspect=document.getElementById('research-diagnostic-inspect');
  if(!inspect){inspect=document.createElement('button');inspect.id='research-diagnostic-inspect';inspect.type='button';inspect.textContent='查看最近研究诊断';button.after(inspect);}
  inspect.onclick=()=>{
    const task=repository.rawTasks().slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    if(!task)return;
    const research=task.research||{},evidence=task.evidence||{};
    const summary={title:task.title,status:task.status,phaseIndex:task.phaseIndex,contract:research.contract,contractSignature:research.contractSignature,runtime:research.runtime,searchQuality:research.searchQuality,extractionBuildId:research.extractionBuildId,evidenceProgress:research.evidenceProgress,audit:evidence.audit,claims:evidence.claims,competitorRows:evidence.competitorRows,answerAudit:task.report?.answerAudit,quality:task.quality};
    let panel=document.getElementById('research-diagnostic-panel');
    if(!panel){panel=document.createElement('details');panel.id='research-diagnostic-panel';const label=document.createElement('summary');label.textContent='最近研究的脱敏诊断（仅在本页显示）';panel.append(label,document.createElement('pre'));inspect.closest('.browser-session-notice').after(panel);}
    panel.querySelector('pre').textContent=redact(JSON.stringify(summary,null,2));panel.open=true;
  };
}
