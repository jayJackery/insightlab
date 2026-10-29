import {mapConcurrent} from './concurrency.js?v=983914e21674fb3e';
export async function extractWithSplitRecovery({batch,extract,save,combine,onSplit=()=>{},depth=0,maxDepth=4,singleRetry=1,singleRetryTruncated=0,formatRecovery=false,onRetry=()=>{},recovery=null,feedback=''}) {
  let value;
  try {
    value=await extract(batch,{depth,recovery,feedback});
  } catch(error) {
    const recoverable=['MODEL_TRUNCATED','MODEL_TIMEOUT','MODEL_NETWORK','MODEL_STREAM_INCOMPLETE'].includes(error?.code)||(formatRecovery&&['MODEL_SCHEMA_INVALID','MODEL_JSON_INVALID','MODEL_EMPTY'].includes(error?.code));
    if(!recoverable)throw error;
    if(batch.length<2){
      if(singleRetry>0&&['MODEL_TIMEOUT','MODEL_NETWORK','MODEL_STREAM_INCOMPLETE'].includes(error.code)){
        onRetry({depth,sourceCount:1,code:error.code});
        return extractWithSplitRecovery({batch,extract,save,combine,onSplit,depth,maxDepth,singleRetry:singleRetry-1,singleRetryTruncated,formatRecovery,onRetry,recovery:error.code,feedback:error.message});
      }
      if(singleRetryTruncated>0&&(error.code==='MODEL_TRUNCATED'||formatRecovery&&['MODEL_SCHEMA_INVALID','MODEL_JSON_INVALID','MODEL_EMPTY'].includes(error.code))){
        onRetry({depth,sourceCount:1,code:error.code});
        return extractWithSplitRecovery({batch,extract,save,combine,onSplit,depth,maxDepth,singleRetry,singleRetryTruncated:singleRetryTruncated-1,formatRecovery,onRetry,recovery:error.code,feedback:error.message});
      }
      throw error;
    }
    if(depth>=maxDepth)throw error;
    const midpoint=Math.ceil(batch.length/2),parts=[batch.slice(0,midpoint),batch.slice(midpoint)];
    onSplit({depth,code:error.code,sourceCount:batch.length,partSizes:parts.map(part=>part.length)});
    const values=await mapConcurrent(parts,parts.length,part=>extractWithSplitRecovery({batch:part,extract,save,combine,onSplit,depth:depth+1,maxDepth,singleRetry,singleRetryTruncated,formatRecovery,onRetry,recovery:error.code,feedback:error.message}));
    return combine(values);
  }
  await save(batch,value);
  return value;
}
