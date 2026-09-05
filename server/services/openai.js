const https = require('https');
const { runRecipeParseWithRetry, isOutputLimitReason } = require('../../recipe-policy');
const { runAssistantAnalyzeWithRetry } = require('./assistant-policy');

const KEEP_ALIVE_AGENT = new https.Agent({ keepAlive: true, keepAliveMsecs: 10_000, maxSockets: 4 });
const INBOX_SCHEMA = {
  type:'object', additionalProperties:false,
  properties:{
    summary:{type:'string'},
    items:{type:'array',items:{type:'object',additionalProperties:false,properties:{
      type:{type:'string',enum:['todo','memo','project']}, title:{type:'string'}, details:{type:'string'},
      priority:{type:'string',enum:['high','medium','low']}, dueDate:{type:['string','null']},
      tags:{type:'array',items:{type:'string'}}, projectTitle:{type:['string','null']}
    },required:['type','title','details','priority','dueDate','tags','projectTitle']}}
  }, required:['summary','items']
};

const DAILY_BRIEF_SCHEMA = {
  type:'object', additionalProperties:false,
  properties:{
    sentences:{type:'array',minItems:1,maxItems:4,items:{type:'string'}}
  }, required:['sentences']
};
function buildDailyBriefInstructions(mode='day') {
  const review=mode==='review';
  return `너는 한국어 개인 비서의 Daily Assistant 요약 엔진이다.
입력은 앱이 이미 계산한 구조화된 사실 데이터다.
- 입력에 없는 일정, 할 일, 사람, 장소, 숫자, 중요도를 추측하거나 만들어내지 않는다.
- 일정 수와 할 일 수는 입력 metrics 값을 그대로 따른다.
- ${review?'저녁 Daily Review':'오늘 Daily Brief'} 문장만 작성한다.
- 짧고 자연스러운 한국어 문장 1~${review?3:4}개로 작성한다.
- 행동 제안은 openTimeWindows처럼 입력에 근거가 있을 때만 한다.
- 사용자의 데이터를 수정하라고 명령하지 않는다.
- 과장, 감정적 평가, 근거 없는 우선순위 판단을 하지 않는다.`;
}

const RECIPE_SCHEMA = {
  type:'object', additionalProperties:false,
  properties:{
    documentSummary:{type:'string'},
    recipes:{type:'array',items:{type:'object',additionalProperties:false,properties:{
      name:{type:'string'}, baseServings:{type:['number','null']}, yieldAmount:{type:['number','null']},
      yieldUnit:{type:['string','null']}, portionAmount:{type:['number','null']}, portionUnit:{type:['string','null']},
      ingredients:{type:'array',items:{type:'object',additionalProperties:false,properties:{
        name:{type:'string'}, amount:{type:['number','null']}, rawAmount:{type:['string','null']},
        unit:{type:['string','null']}, prep:{type:['string','null']}
      },required:['name','amount','rawAmount','unit','prep']}},
      steps:{type:'array',items:{type:'string'}}, notes:{type:'string'}
    },required:['name','baseServings','yieldAmount','yieldUnit','portionAmount','portionUnit','ingredients','steps','notes']}}
  }, required:['documentSummary','recipes']
};
function extractResponseText(data) {
  const out=[];
  for (const item of (data?.output || [])) for (const c of (item?.content || [])) if (typeof c?.text === 'string') out.push(c.text);
  return out.join('\n').trim();
}
function httpsJsonRequest(options, payload, timeoutMs=30_000) {
  return new Promise((resolve,reject) => {
    const body=JSON.stringify(payload);
    const req=https.request({
      ...options,
      agent:KEEP_ALIVE_AGENT,
      headers:{...(options.headers||{}),'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} ,
      timeout:timeoutMs
    }, res => {
      let raw=''; res.setEncoding('utf8'); res.on('data',c=>raw+=c);
      res.on('end',()=>{
        let parsed={};
        try{parsed=raw?JSON.parse(raw):{};}catch{return reject(new Error(`OpenAI 응답을 읽지 못했습니다. HTTP ${res.statusCode}`));}
        resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data:parsed});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('OpenAI API 연결 시간이 초과되었습니다.')));
    req.on('error',err=>{
      const code=err?.code?` [${err.code}]`:''; const cause=err?.cause?.code?` / ${err.cause.code}`:'';
      reject(new Error(`OpenAI API 연결 실패${code}${cause}: ${err.message}`));
    });
    req.end(body);
  });
}
function buildAssistantInstructions(currentDate) {
  return `너는 한국어 개인 비서의 통합 Inbox 정리 엔진이다.\n현재 날짜: ${currentDate||'알 수 없음'}\n시간대: Asia/Seoul\n\n사용자 입력을 todo, memo, project로 구조화한다.\n- todo: 구체적인 실행 항목. 해야 할 행동이 있으면 todo로 만든다.\n- memo: 참고/기억 정보. 별도의 행동이 필요하지 않은 사실이나 기록이다.\n- project: 여러 단계가 필요한 장기 목표나 지속적으로 관리할 결과다. 단순한 한 번의 행동은 project로 만들지 않는다.\n- 한 입력에 독립적인 행동이나 정보가 여러 개 있으면 서로 다른 항목으로 분리한다.\n- 같은 의도를 표현만 바꿔 반복한 중복 항목을 만들지 않는다.\n- 프로젝트 목표와 그 프로젝트에서 실제로 해야 할 행동이 함께 있으면 project와 필요한 todo를 각각 만든다.\n- title은 짧고 구체적으로 작성하고, details에는 원문의 맥락 중 실행/기억에 필요한 내용만 보존한다.\n- priority는 high/medium/low 중 하나다. 명시적 긴급성이나 임박한 기한이 없으면 medium을 기본으로 한다.\n- 날짜는 사용자가 명시했거나 상대 날짜를 정확히 계산할 수 있을 때만 YYYY-MM-DD로 넣는다. 정확한 날짜를 확정할 수 없으면 null이다.\n- tags는 검색에 도움이 되는 짧고 의미 있는 한국어 태그만 넣고, 중복 태그를 만들지 않는다.\n- projectTitle은 특정 프로젝트와의 관계가 명확하거나 같은 입력에서 강하게 연결될 때만 넣고, 그 외에는 null이다.\n- 사용자가 말하지 않은 약속, 기한, 사람, 장소, 숫자를 추측해서 추가하지 않는다.`;
}

function createOpenAIService({ apiKey, model='gpt-5-nano' }) {
  const cleanKey=String(apiKey||'').replace(/^\uFEFF/,'').trim().replace(/^["']+|["']+$/g,'').replace(/[\s\uFEFF]+/g,'');
  async function callOpenAI(instructions,input,maxOutputTokens=3000,schemaName=null,schema=null,options={}) {
    if(!cleanKey){const e=new Error('OPENAI_API_KEY가 설정되지 않았습니다.');e.code='NO_API_KEY';throw e;}
    if(!/^sk-[\x21-\x7E]+$/.test(cleanKey)) throw new Error('저장된 OpenAI API Key 형식이 올바르지 않습니다. SETUP.cmd를 다시 실행해서 API Key를 다시 입력해 주세요.');
    const body={model,instructions,input,max_output_tokens:maxOutputTokens};
    if(options.reasoningEffort) body.reasoning={effort:options.reasoningEffort};
    if(schemaName&&schema) body.text={format:{type:'json_schema',name:schemaName,strict:true,schema}};
    const result=await httpsJsonRequest({hostname:'api.openai.com',port:443,path:'/v1/responses',method:'POST',family:4,headers:{Authorization:`Bearer ${cleanKey}`}},body,Number(options.timeoutMs)||45_000);
    const data=result.data||{};
    if(!result.ok) throw new Error(data?.error?.message||`OpenAI API 오류 (${result.status})`);
    if(data?.status==='incomplete'){
      const reason=String(data?.incomplete_details?.reason||'unknown');
      const e=new Error(`GPT 응답이 중간에 종료되었습니다 (${reason}).`);
      if(isOutputLimitReason(reason)) e.code='MAX_OUTPUT_TOKENS';
      throw e;
    }
    const raw=extractResponseText(data);
    if(!raw) throw new Error('GPT 응답이 비어 있습니다.');
    try{return JSON.parse(raw);}catch{throw new Error('GPT 응답 형식을 읽지 못했습니다. 다시 시도해 주세요.');}
  }
  async function analyzeInbox(text,currentDate) {
    const instructions=buildAssistantInstructions(currentDate);
    return runAssistantAnalyzeWithRetry(policy => callOpenAI(instructions,text,policy.maxOutputTokens,'assistant_inbox',INBOX_SCHEMA,{reasoningEffort:policy.reasoningEffort,timeoutMs:30_000}));
  }
  async function dailyBrief(context,mode='day') {
    const safeMode=mode==='review'?'review':'day';
    const input=JSON.stringify(context||{});
    if(input.length>60_000)throw new Error('Daily Assistant 요약 데이터가 너무 큽니다.');
    return callOpenAI(buildDailyBriefInstructions(safeMode),input,700,'daily_assistant_brief',DAILY_BRIEF_SCHEMA,{reasoningEffort:'low',timeoutMs:20_000});
  }
  function recipeInstructions(sourceLabel='직접 입력') {
    return `너는 전문 주방용 레시피 구조화 엔진이다.\n입력 출처: ${sourceLabel}\n\n사용자가 제공한 문서나 텍스트 안의 레시피를 찾아 각각 독립된 레시피로 구조화한다.
문서에 레시피가 1개면 recipes 배열에 1개만 넣고, 여러 개면 전부 분리한다.\n- 원문에 없는 재료, 숫자, 조리법을 추측하거나 만들어내지 않는다.\n- baseServings는 기준 인분이 명시된 경우 숫자로, 아니면 null.\n- ingredient amount는 숫자로 파싱 가능할 때 숫자, 아니면 null.\n- 범위(예: 10~12g)는 임의로 평균내지 말고 amount=null로 두고 rawAmount에 원문을 기록한다.\n- unit은 원문 단위를 보존하되 명확한 단위는 짧게 정리한다.\n- prep은 해당 재료의 손질/전처리.\n- steps는 실제 조리 순서만.\n- notes는 테스트 노트, 보관, 주의사항, 기타 메모.\n- yieldAmount/yieldUnit은 완성량이 명시된 경우만.\n- portionAmount/portionUnit은 1인 사용량이 명시된 경우만.\n- 문서 표의 열이 재료/수량/단위를 의미하면 각 행을 ingredient로 읽는다.\n- 제목/섹션을 이용해 여러 레시피를 분리한다.\n- 소스/가니시/젤/무스 등이 각각 독립적으로 배합되어 있고 별도 제목이 있다면 별도 레시피로 분리한다.\n- 단순한 코스명/메뉴명만 있고 배합이 없으면 레시피로 만들지 않는다.`;
  }
  async function parseRecipes(text,sourceLabel) {
    if(text.length>160000) throw new Error('문서 내용이 너무 깁니다. 레시피 문서를 여러 파일로 나눠 업로드해 주세요.');
    const result=await runRecipeParseWithRetry(({maxOutputTokens,reasoningEffort})=>callOpenAI(recipeInstructions(sourceLabel),text,maxOutputTokens,'recipe_document',RECIPE_SCHEMA,{reasoningEffort,timeoutMs:120_000}));
    if(!Array.isArray(result?.recipes)) throw new Error('GPT가 레시피 목록을 올바르게 반환하지 않았습니다.');
    result.recipes=result.recipes.filter(r=>r&&String(r.name||'').trim());
    if(!result.recipes.length) throw new Error('문서에서 저장 가능한 레시피를 찾지 못했습니다.');
    return result;
  }
  return { configured:Boolean(cleanKey), model, analyzeInbox, dailyBrief, parseRecipes };
}

module.exports = { createOpenAIService, buildAssistantInstructions, buildDailyBriefInstructions, INBOX_SCHEMA, DAILY_BRIEF_SCHEMA, RECIPE_SCHEMA };
