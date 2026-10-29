// Evidence not used in prose remains in the audit trail. A lexical match is a
// conservative warning, not proof of semantic support; independent review is
// still required for every report before publication.
export function classifyEvidenceGaps(gaps,report,decisions=[]){
  const text=JSON.stringify({summary:report?.executiveSummary,answers:report?.userQuestionAnswers,questions:report?.questionAnswers,routes:report?.technologyDeepDives,recommendations:report?.recommendations}).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
  return (gaps||[]).map(gap=>{
    const claim=String(gap.text||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
    const used=claim.length>=12&&text.includes(claim);
    const conflict=gap.kind==='condition_conflict'||/冲突|错配|不同|conflict|mismatch/i.test(gap.reason||'');
    // An absent literal string does not establish that a paraphrase was not
    // used. Leave that determination to the independent semantic review.
    const decision=decisions.find(item=>item.id===gap.id);
    const unsafe=used||decision?.status==='used_unverified';
    const resolved=['not_used','conflict_unused','conditional_inference'].includes(decision?.status);
    const category=unsafe?'影响关键结论':decision?.status==='conditional_inference'?'可标明前提的工程推断':conflict?'资料冲突':resolved?'未采用的存疑事实':gap.kind==='fact_verification'?'存疑事实：待独立复核是否采用':'需标明条件的证据缺口';
    return {...gap,category,usedInReport:unsafe?true:resolved?false:null,reviewDecision:decision?.status||'not_reviewed'};
  });
}
