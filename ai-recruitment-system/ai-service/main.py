"""
RecruitAI — Semantic Matching Microservice
==========================================
Uses sentence-transformers (all-MiniLM-L6-v2) for real AI-powered
resume–job matching. This model was trained on 1B+ sentence pairs and
understands semantic meaning (e.g. "React" ≈ "frontend development").

Deploy for free on: https://huggingface.co/spaces (Gradio SDK → FastAPI)
Or:                 https://render.com (free tier, ~512MB RAM is enough)

Run locally:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import re
import os

# ---------------------------------------------------------------------------
# Lazy-load the model so startup is fast even if torch is slow to import
# ---------------------------------------------------------------------------
_model = None

def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="RecruitAI Semantic Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Skill database (mirrors the TypeScript one so results are consistent)
# ---------------------------------------------------------------------------
SKILLS = [
    "JavaScript","TypeScript","Python","Java","C++","C#","Go","Rust","Swift","Kotlin",
    "React","Angular","Vue.js","Next.js","Node.js","Express","Django","Flask","FastAPI",
    "Spring Boot","ASP.NET","Laravel","HTML","CSS","Tailwind CSS","Bootstrap","Redux",
    "GraphQL","REST API","React Native","Flutter","iOS Development","Android Development",
    "SQL","PostgreSQL","MySQL","MongoDB","Redis","Firebase","Supabase","Elasticsearch",
    "AWS","Azure","Google Cloud","Docker","Kubernetes","CI/CD","GitHub Actions","Terraform",
    "Machine Learning","Deep Learning","TensorFlow","PyTorch","Scikit-learn","NLP",
    "Computer Vision","BERT","Transformers","Data Science","Pandas","NumPy",
    "Git","Agile","Scrum","Jira","Figma","Microservices","Leadership","Communication",
    "Problem Solving","Project Management","Data Analysis","Tableau","Power BI",
]

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class MatchRequest(BaseModel):
    resume_text: str
    job_description: str
    resume_skills: List[str] = []
    required_skills: List[str] = []
    resume_years_exp: int = 0
    required_years_exp: int = 0

class MatchResponse(BaseModel):
    match_score: float
    skill_match_score: float
    text_similarity: float
    experience_score: float
    matched_skills: List[str]
    missing_skills: List[str]
    explanation: str

class ParseRequest(BaseModel):
    text: str

class ParseResponse(BaseModel):
    skills: List[str]
    years_of_experience: int
    education: List[str]


# ---------------------------------------------------------------------------
# Core matching logic
# ---------------------------------------------------------------------------
def cosine_similarity(a, b) -> float:
    """Compute cosine similarity between two numpy vectors."""
    import numpy as np
    a, b = np.array(a), np.array(b)
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def semantic_similarity(text_a: str, text_b: str) -> float:
    """Use sentence-transformers to compute semantic similarity."""
    if not text_a.strip() or not text_b.strip():
        return 0.0
    model = get_model()
    # Truncate to avoid memory issues (model max is 256 tokens)
    ta = text_a[:2000]
    tb = text_b[:2000]
    embeddings = model.encode([ta, tb])
    return max(0.0, min(1.0, cosine_similarity(embeddings[0], embeddings[1])))


def skill_match(resume_skills: List[str], required_skills: List[str]) -> tuple[float, List[str], List[str]]:
    """Exact + case-insensitive skill matching. Returns score, matched, missing."""
    if not required_skills:
        return 0.5, [], []  # neutral when no requirements specified
    rs_lower = {s.lower() for s in resume_skills}
    matched = [s for s in required_skills if s.lower() in rs_lower]
    missing = [s for s in required_skills if s.lower() not in rs_lower]
    score = len(matched) / len(required_skills) if required_skills else 0.0
    return round(score, 4), matched, missing


def experience_score(resume_years: int, required_years: int) -> float:
    """Score how well experience matches requirement."""
    if required_years == 0:
        return 1.0
    if resume_years >= required_years:
        return 1.0
    if resume_years == 0:
        return 0.2
    return round(min(resume_years / required_years, 1.0), 4)


def extract_skills_from_text(text: str) -> List[str]:
    """Extract known skills from raw text."""
    text_lower = text.lower()
    found = []
    for skill in SKILLS:
        # Match whole word, case-insensitive
        pattern = r'\b' + re.escape(skill.lower()) + r'\b'
        if re.search(pattern, text_lower):
            found.append(skill)
    return found


def extract_years_of_experience(text: str) -> int:
    """Parse years of experience from resume text."""
    # Pattern 1: "5 years of experience"
    matches = re.findall(r'(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)', text, re.IGNORECASE)
    if matches:
        return max(int(m) for m in matches)
    # Pattern 2: Date ranges "2018 - 2022" or "2019 – Present"
    ranges = re.findall(r'(\d{4})\s*[-–]\s*(\d{4}|present|current)', text, re.IGNORECASE)
    if ranges:
        total = 0
        current_year = 2026
        for start, end in ranges:
            s = int(start)
            e = current_year if end.lower() in ('present', 'current') else int(end)
            total += max(0, e - s)
        return min(total, 30)  # cap at 30
    return 0


def extract_education(text: str) -> List[str]:
    """Extract education lines from resume text."""
    keywords = ['bachelor', 'master', 'phd', 'doctorate', 'diploma', 'degree',
                'b.s.', 'm.s.', 'b.sc', 'm.sc', 'b.a.', 'm.a.', 'mba', 'computer science']
    lines = text.split('\n')
    edu = []
    for line in lines:
        if any(kw in line.lower() for kw in keywords) and len(line.strip()) > 5:
            edu.append(line.strip())
    return edu[:5]


def build_explanation(match_score: float, skill_score: float, exp_score: float,
                      matched: List[str], missing: List[str],
                      resume_years: int, required_years: int) -> str:
    pct = round(match_score * 100)
    parts = []

    if pct >= 80:
        parts.append(f"Excellent match ({pct}%).")
    elif pct >= 60:
        parts.append(f"Good match ({pct}%).")
    elif pct >= 40:
        parts.append(f"Partial match ({pct}%).")
    else:
        parts.append(f"Weak match ({pct}%).")

    skill_pct = round(skill_score * 100)
    if matched:
        parts.append(f"Covers {len(matched)} of {len(matched)+len(missing)} required skills ({skill_pct}%).")
    if missing:
        top_missing = missing[:3]
        parts.append(f"Missing: {', '.join(top_missing)}{' and more' if len(missing) > 3 else ''}.")

    if required_years > 0:
        if resume_years >= required_years:
            parts.append(f"Experience requirement met ({resume_years} yrs ≥ {required_years} required).")
        else:
            parts.append(f"Experience gap: {resume_years} yrs vs {required_years} required.")

    return " ".join(parts)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "model": "all-MiniLM-L6-v2"}


@app.post("/score", response_model=MatchResponse)
def score_match(req: MatchRequest):
    """
    Main endpoint. Scores how well a resume matches a job.
    Called from the Supabase edge function when an applicant applies.
    """
    try:
        # 1. Semantic similarity between full texts
        text_sim = semantic_similarity(req.resume_text, req.job_description)

        # 2. Skill matching
        eff_required = req.required_skills
        if not eff_required:
            eff_required = extract_skills_from_text(req.job_description)

        skill_score, matched, missing = skill_match(req.resume_skills, eff_required)

        # 3. Experience
        exp_score = experience_score(req.resume_years_exp, req.required_years_exp)

        # 4. Weighted final score: skills 50%, semantics 30%, experience 20%
        raw_score = (skill_score * 0.50) + (text_sim * 0.30) + (exp_score * 0.20)

        # 5. Penalty: if skill match is very low, cap at 25%
        if eff_required and skill_score < 0.20:
            raw_score = min(raw_score, 0.25)

        final = round(raw_score, 4)

        explanation = build_explanation(
            final, skill_score, exp_score, matched, missing,
            req.resume_years_exp, req.required_years_exp
        )

        return MatchResponse(
            match_score=final,
            skill_match_score=round(skill_score, 4),
            text_similarity=round(text_sim, 4),
            experience_score=round(exp_score, 4),
            matched_skills=matched,
            missing_skills=missing,
            explanation=explanation,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/parse", response_model=ParseResponse)
def parse_resume(req: ParseRequest):
    """Parse skills, experience, and education from raw resume text."""
    skills = extract_skills_from_text(req.text)
    years = extract_years_of_experience(req.text)
    education = extract_education(req.text)
    return ParseResponse(skills=skills, years_of_experience=years, education=education)
