// Vercel 서버리스 함수: POST /api/analyze
// 환경변수 ANTHROPIC_API_KEY 필요 (Vercel 대시보드에서 설정)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 허용됩니다" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "서버에 API 키가 설정되지 않았습니다 (ANTHROPIC_API_KEY)" });
  }

  const name = (req.body?.name || "").toString().trim().slice(0, 100);
  if (!name) {
    return res.status(400).json({ error: "화학물질 이름이 비어 있습니다" });
  }

  const prompt = `당신은 화학물질 안전 전문가입니다. 사용자가 화학물질 "${name}"에 노출되었거나 사용하려는 상황입니다. 아래 JSON 형식으로만 응답하세요.

규칙:
- 첫 글자부터 마지막 글자까지 오직 유효한 JSON만 출력하세요. 마크다운 코드블록(백틱), 인사말, 설명 등 JSON 외의 텍스트는 절대 출력하지 마세요.
- 모든 문장은 초등학생도 이해할 수 있는 쉬운 한국어로 쓰고, 전문 용어를 쓰지 마세요.
- 각 문자열은 70자 이내로 간결하게 쓰세요.
- 입력이 화학물질이나 화학제품이 아니면 {"found": false, "message": "이유"} 만 출력하세요.

JSON 형식:
{
  "found": true,
  "name_ko": "한글 이름",
  "name_en": "영문 이름",
  "formula": "화학식(없으면 빈 문자열)",
  "risk_level": "danger|caution|safe 중 하나",
  "summary": "이 물질이 무엇이고 어떤 점이 위험한지 한 문장",
  "first_aid": {
    "inhale": {"steps": "들이마셨을 때 대처법 1~2문장", "call119": true/false},
    "skin":   {"steps": "피부에 닿았을 때 대처법 1~2문장", "call119": true/false},
    "eye":    {"steps": "눈에 들어갔을 때 대처법 1~2문장", "call119": true/false},
    "ingest": {"steps": "삼켰을 때 대처법 1~2문장", "call119": true/false}
  },
  "precautions": ["사용하기 전·사용 중 꼭 지켜야 할 주의사항 4개 (환기, 보호장비, 사용 장소 등)"],
  "mixing": [{"with": "섞으면 위험한 물질", "why": "섞으면 어떤 일이 생기는지"}],
  "storage": ["보관 방법 최대 3개"],
  "disposal": ["폐기 방법 최대 3개"]
}
mixing은 최대 3개입니다.`;

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!apiRes.ok) {
      let detail = "";
      try { detail = (await apiRes.json())?.error?.message || ""; } catch (e) {}
      return res.status(502).json({ error: `Anthropic API 오류 (${apiRes.status}) ${detail}` });
    }

    const data = await apiRes.json();
    const text = (data.content || [])
      .map(b => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n");

    // JSON 추출 (백틱 제거 + 중괄호 블록 추출)
    const clean = text.replace(/```json|```/g, "").trim();
    let info;
    try {
      info = JSON.parse(clean);
    } catch (e) {
      const s = clean.indexOf("{");
      const eIdx = clean.lastIndexOf("}");
      if (s !== -1 && eIdx > s) info = JSON.parse(clean.slice(s, eIdx + 1));
      else throw new Error("AI 응답을 JSON으로 해석하지 못했습니다");
    }

    return res.status(200).json(info);
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
