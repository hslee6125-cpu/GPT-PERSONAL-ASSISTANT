const http = require("http");
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-nano";
const PUBLIC_DIR = path.join(__dirname, "public");
const APP_VERSION = fs.existsSync(path.join(__dirname, "VERSION")) ? fs.readFileSync(path.join(__dirname, "VERSION"), "utf8").trim() : "unknown";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function send(res, status, body, type="application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

function extractResponseText(data) {
  const out = [];
  for (const item of (data?.output || [])) {
    for (const c of (item?.content || [])) {
      if (typeof c?.text === "string") out.push(c.text);
    }
  }
  return out.join("\n").trim();
}

function cleanJSON(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJsonObject(raw) {
  const clean = cleanJSON(raw);
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  const candidate = first >= 0 && last > first ? clean.slice(first, last + 1) : clean;
  return JSON.parse(candidate);
}

async function callOpenAI(instructions, input, max_output_tokens=3000) {
  if (!OPENAI_API_KEY) {
    const err = new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
    err.code = "NO_API_KEY";
    throw err;
  }

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions,
      input,
      max_output_tokens
    })
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `OpenAI API 오류 (${r.status})`);

  const raw = extractResponseText(data);
  if (!raw) throw new Error("GPT 응답이 비어 있습니다.");
  return parseJsonObject(raw);
}

async function analyzeInbox(text, currentDate) {
  const instructions = `
너는 한국어 개인 비서의 인박스 정리 엔진이다.
현재 날짜: ${currentDate || "알 수 없음"}
시간대: Asia/Seoul

사용자 입력을 todo, memo, project로 구조화한다.
- todo: 구체적인 실행 항목
- memo: 참고/기억 정보
- project: 여러 단계가 필요한 장기 목표
- 한 입력에 프로젝트와 세부 할 일이 같이 있으면 project + todo들로 분리
- 날짜는 사용자가 명시했거나 상대 날짜를 계산할 수 있을 때만 YYYY-MM-DD
- priority는 high/medium/low
- projectTitle은 특정 프로젝트 연결이 명확할 때만
반드시 JSON만 출력:
{
  "summary":"요약",
  "items":[
    {
      "type":"todo|memo|project",
      "title":"제목",
      "details":"설명",
      "priority":"high|medium|low",
      "dueDate":"YYYY-MM-DD 또는 null",
      "tags":["태그"],
      "projectTitle":"연결 프로젝트 또는 null"
    }
  ]
}`.trim();

  return callOpenAI(instructions, text, 1800);
}

function recipeInstructions(sourceLabel="직접 입력") {
  return `
너는 전문 주방용 레시피 구조화 엔진이다.
입력 출처: ${sourceLabel}

사용자가 제공한 문서나 텍스트 안의 레시피를 찾아 각각 독립된 레시피로 구조화한다.
문서에 레시피가 1개면 recipes 배열에 1개만 넣고, 여러 개면 전부 분리한다.

중요 규칙:
- 원문에 없는 재료, 숫자, 조리법을 추측하거나 만들어내지 않는다.
- baseServings는 기준 인분이 명시된 경우 숫자로, 아니면 null.
- ingredient amount는 숫자로 파싱 가능할 때 숫자, 아니면 null.
- 범위(예: 10~12g)는 임의로 평균내지 말고 amount=null로 두고 rawAmount에 원문을 기록한다.
- unit은 원문 단위를 보존하되 g, kg, ml, L, 개, 장, tsp, tbsp 등 명확한 단위는 짧게 정리한다.
- prep은 해당 재료의 손질/전처리.
- steps는 실제 조리 순서만.
- notes는 테스트 노트, 보관, 주의사항, 기타 메모.
- yieldAmount/yieldUnit은 완성량이 명시된 경우만.
- portionAmount/portionUnit은 1인 사용량이 명시된 경우만.
- 문서 표의 열이 재료/수량/단위를 의미하면 각 행을 ingredient로 읽는다.
- 제목/섹션을 이용해 여러 레시피를 분리한다.
- 소스/가니시/젤/무스 등이 각각 독립적으로 배합되어 있고 별도 제목이 있다면 별도 레시피로 분리한다.
- 단순한 코스명/메뉴명만 있고 배합이 없으면 레시피로 만들지 않는다.

반드시 JSON만 출력:
{
  "documentSummary":"문서 전체에 대한 짧은 요약",
  "recipes":[
    {
      "name":"레시피명",
      "baseServings":10,
      "yieldAmount":950,
      "yieldUnit":"g",
      "portionAmount":22,
      "portionUnit":"g",
      "ingredients":[
        {
          "name":"민어살",
          "amount":500,
          "rawAmount":"500",
          "unit":"g",
          "prep":"껍질 제거"
        }
      ],
      "steps":["..."],
      "notes":"..."
    }
  ]
}`.trim();
}

async function parseRecipes(text, sourceLabel) {
  if (text.length > 160000) {
    throw new Error("문서 내용이 너무 깁니다. 레시피 문서를 여러 파일로 나눠 업로드해 주세요.");
  }
  const result = await callOpenAI(recipeInstructions(sourceLabel), text, 5200);
  if (!Array.isArray(result?.recipes)) {
    throw new Error("GPT가 레시피 목록을 올바르게 반환하지 않았습니다.");
  }
  result.recipes = result.recipes.filter(r => r && String(r.name || "").trim());
  if (!result.recipes.length) {
    throw new Error("문서에서 저장 가능한 레시피를 찾지 못했습니다.");
  }
  return result;
}

function decodeEntities(s) {
  const map = {
    "&nbsp;":" ",
    "&amp;":"&",
    "&lt;":"<",
    "&gt;":">",
    "&quot;":'"',
    "&#39;":"' "
  };
  return String(s).replace(/&(nbsp|amp|lt|gt|quot|#39);/g, m => map[m] ?? m);
}

function htmlToStructuredText(html) {
  let s = String(html || "");
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h1[^>]*>/gi, "\n# ")
    .replace(/<h2[^>]*>/gi, "\n## ")
    .replace(/<h3[^>]*>/gi, "\n### ")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<table[^>]*>/gi, "\n[TABLE]\n")
    .replace(/<\/table>/gi, "\n[/TABLE]\n")
    .replace(/<tr[^>]*>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, " | ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocxText(buffer) {
  const converted = await mammoth.convertToHtml({buffer}, {
    includeDefaultStyleMap: true
  });
  const structured = htmlToStructuredText(converted.value);

  // convertToHtml이 아주 특이한 DOCX에서 빈 결과를 내면 raw text로 보완
  if (structured.length < 20) {
    const raw = await mammoth.extractRawText({buffer});
    return String(raw.value || "").trim();
  }
  return structured;
}

function serveStatic(req, res) {
  const raw = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = raw === "/" ? "index.html" : raw.replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "Not Found", "text/plain; charset=utf-8");
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    fs.createReadStream(file).pipe(res);
  });
}

function readJsonBody(req, maxBytes=30_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", c => {
      body += c;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error("업로드 파일이 너무 큽니다."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(new Error("잘못된 요청 형식입니다.")); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/config") {
      return send(res, 200, JSON.stringify({
        configured: Boolean(OPENAI_API_KEY),
        model: OPENAI_MODEL,
        version: APP_VERSION
      }));
    }

    if (req.method === "POST" && req.url === "/api/analyze") {
      const p = await readJsonBody(req, 1_000_000);
      const text = String(p.text || "").trim();
      if (!text) return send(res, 400, JSON.stringify({error:"내용을 입력해 주세요."}));
      const result = await analyzeInbox(text, p.currentDate);
      return send(res, 200, JSON.stringify(result));
    }

    if (req.method === "POST" && req.url === "/api/parse-recipes") {
      const p = await readJsonBody(req, 4_000_000);
      const text = String(p.text || "").trim();
      if (!text) return send(res, 400, JSON.stringify({error:"레시피 내용을 입력해 주세요."}));
      const result = await parseRecipes(text, "직접 입력");
      return send(res, 200, JSON.stringify(result));
    }

    if (req.method === "POST" && req.url === "/api/parse-docx") {
      const p = await readJsonBody(req, 30_000_000);
      const filename = String(p.filename || "recipe.docx");
      if (!filename.toLowerCase().endsWith(".docx")) {
        return send(res, 400, JSON.stringify({error:".docx Word 파일만 지원합니다."}));
      }
      const base64 = String(p.base64 || "");
      if (!base64) return send(res, 400, JSON.stringify({error:"Word 파일 데이터가 없습니다."}));

      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length) return send(res, 400, JSON.stringify({error:"Word 파일을 읽을 수 없습니다."}));
      if (buffer.length > 20_000_000) return send(res, 413, JSON.stringify({error:"Word 파일은 20MB 이하로 업로드해 주세요."}));

      const extracted = await extractDocxText(buffer);
      if (!extracted || extracted.length < 10) {
        return send(res, 400, JSON.stringify({
          error:"Word 파일에서 텍스트를 찾지 못했습니다. 사진/스캔 이미지로만 된 문서는 현재 버전에서 인식하지 못합니다."
        }));
      }

      const result = await parseRecipes(extracted, `Word 파일: ${filename}`);
      result.sourceFilename = filename;
      result.extractedChars = extracted.length;
      return send(res, 200, JSON.stringify(result));
    }

    if (req.method === "GET") return serveStatic(req, res);
    return send(res, 405, "Method Not Allowed", "text/plain; charset=utf-8");
  } catch (e) {
    const status = e?.code === "NO_API_KEY" ? 503 : 500;
    return send(res, status, JSON.stringify({error:e?.message || "오류가 발생했습니다."}));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("GPT Personal Assistant v4");
  console.log(`http://127.0.0.1:${PORT}`);
  console.log(`Model: ${OPENAI_MODEL}`);
  console.log(`API key: ${OPENAI_API_KEY ? "configured" : "NOT configured"}`);
  console.log("");
});
