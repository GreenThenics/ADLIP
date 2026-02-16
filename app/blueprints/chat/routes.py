import os
import requests
from flask import request, jsonify
from . import chat_bp
import logging

logger = logging.getLogger(__name__)

# MVP Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# Using the specific requested model
# Flash model chosen for low-latency, short-form explanatory output (not analysis or reasoning)
GEMINI_MODEL = "gemini-3-flash-preview" 

ALLOWED_KEYS = {"severity", "risk_score", "risk_factors", "ml_summary", "prompt_type", "category", "pattern"}

def sanitize_input(data):
    return {k: data[k] for k in ALLOWED_KEYS if k in data}


def build_prompt(data):
    severity = data.get("severity", "Unknown")
    risk_score = data.get("risk_score", "Unknown")
    risk_factors = "\n".join([f"- {f}" for f in data.get("risk_factors", [])])
    ml_summary = "\n".join([f"- {m}" for m in data.get("ml_summary", [])])
    prompt_type = data.get("prompt_type", "explain")
    category = data.get("category", "General Secret")
    pattern = data.get("pattern", "Suspicious Pattern")

    base_instruction = """You are an AI explanation assistant for a security tool.

You MUST:
- Explain what the detected vulnerability is generally (e.g., "What is an AWS Key?")
- Explain the specific risk context based *only* on the provided factors
- NEVER speculate about the target's internal network unless stated in factors
- NEVER contradict severity
- NEVER suggest exploitation steps
- ALWAYS state that the final severity is enforced by security rules, and that machine learning is advisory only

Tone:
- Explanatory, not authoritative
- Professional and concise
- No markdown bold/italics
"""

    if prompt_type == "executive":
        task_instruction = f"""
Task: Generate an Executive Summary for a potential {category} leak.
1. Focus on business impact (e.g., "Exposure of {category} can lead to data breaches/financial loss").
2. Explain *why* this specific finding is rated {severity} based on the provided factors.
3. Keep it very concise (2-3 sentences max).
4. Start with: "Executive Summary:"
"""
    elif prompt_type == "client":
        task_instruction = f"""
Task: Simplify for Client / Non-Technical Stakeholder.
1. Explain what a "{category}" is in simple terms (analogy allowed).
2. Explain why exposing it is risky.
3. Reference the specific risk factors (like whether it is Valid or Active) in simple terms.
4. Start with: "Client Brief:"
"""
    else: # "explain" (default)
        task_instruction = f"""
Task: Explain this {category} Vulnerability.
1. Start with the required sentence: "The severity was determined by security rules, with machine learning providing additional contextual support."
2. Explain what a {category} is and why it was flagged.
3. Justify the {severity} rating using the specific list of "Factors" provided below.
4. If ML analysis is present, mention which features (e.g. Entropy, Validation) contributed.
"""

    template = f"""{base_instruction}

Input:
Category: {category}
Pattern: {pattern}
Severity: {severity}
Risk Score: {risk_score}
Factors:
{risk_factors}
ML Summary:
{ml_summary}

{task_instruction}"""
    return template

def call_llm(prompt):
    """
    Calls Google Gemini API using the official google-genai SDK.
    """
    if not GEMINI_API_KEY:
        logger.warning("No GEMINI_API_KEY found. Returning mock response.")
        return (
            "AI Explanation Unavailable: No GEMINI_API_KEY configured.\n\n"
            "This finding is marked as **" + prompt.split("Severity: ")[1].split("\n")[0] + "** risk. "
            "Please configure the backend with a valid GEMINI_API_KEY."
        )

    try:
        # Import inside function to avoid ImportError if package is missing at startup (though we added it)
        from google import genai
        
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        
        content = response.text
        # Safeguard: Strip markdown code blocks if present
        content = content.replace("```", "").strip()
        return content
        
    except Exception as e:
        logger.error(f"Gemini Call Failed: {e}")
        return "Error: Unable to generate explanation at this time. (API Error)"

@chat_bp.route("/ai/explain", methods=["POST"])
def explain_risk():
    raw_data = request.json or {}
    
    # 1. Strict Allowlisting
    data = sanitize_input(raw_data)
    
    # 2. Length & Count Limits (Prevent prompt stuffing)
    data["risk_factors"] = data.get("risk_factors", [])[:5]
    data["ml_summary"] = data.get("ml_summary", [])[:3]

    prompt = build_prompt(data)
    
    # Enforce MVP constraints: "The chatbot never sees... raw secrets" -> The 'data' passed from Frontend MUST adhere.
    # We trust the frontend sends the specific JSON structure as we don't have the full finding object here to filter.
    
    response_text = call_llm(prompt)

    # 3. Explicit Role Metadata
    return jsonify({
        "role": "explanation_assistant",
        "authority": "non-decision",
        "explanation": response_text
    })
