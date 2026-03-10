#!/usr/bin/env python3
"""
PubQuizParty Question Bank Ingestion Pipeline

Usage:
  python ingest.py --source trivia --file path/to/questions.csv
  python ingest.py --source jeopardy --file path/to/jeopardy.csv --reformat-questions
  python ingest.py --source trivia --file questions.csv --batch-size 100 --dry-run
  python ingest.py --semantic-dedup --threshold 0.92
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Optional, List

import pandas as pd
import requests
from dotenv import load_dotenv
from supabase import create_client, Client
from tqdm import tqdm

# ─── Load Environment Variables ────────────────────────────────────────────────

# Load from .env.local in project root
env_path = Path(__file__).parent.parent.parent / ".env.local"
load_dotenv(env_path)

# ─── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
EMBEDDING_API_URL = os.environ.get("EMBEDDING_API_URL", "")
EMBEDDING_API_KEY = os.environ.get("EMBEDDING_API_KEY", "")
LLM_API_URL = os.environ.get("LLM_API_URL", "")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: Missing required environment variables:", file=sys.stderr)
    print("  SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)", file=sys.stderr)
    print("  SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
    print("\nMake sure .env.local exists in the project root.", file=sys.stderr)
    sys.exit(1)

CATEGORY_TAXONOMY = [
    "Arts & Literature", "Business & Economics", "Entertainment",
    "Food & Drink", "Geography", "History", "Holidays & Traditions",
    "Language & Words", "Mathematics & Logic", "Music",
    "People & Places", "Religion & Mythology", "Science & Nature",
    "Sports & Leisure", "Technology & Gaming", "Transportation", "Other"
]

EMBEDDING_DIM = 384
BATCH_SIZE_DEFAULT = 50
CATEGORY_CACHE_FILE = "category_mapping_cache.json"

# ─── Supabase Client ────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ─── Hashing ───────────────────────────────────────────────────────────────────

def normalize_text(text: str) -> str:
    """Lowercase, strip punctuation and whitespace for dedup hashing."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def compute_hash(question_text: str, answer_text: str) -> str:
    normalized = f"{normalize_text(question_text)}|{normalize_text(answer_text)}"
    return hashlib.sha256(normalized.encode()).hexdigest()


# ─── Embedding ─────────────────────────────────────────────────────────────────

# Cache the embedding model globally to avoid reloading
_embedding_model = None

def get_embedding_model():
    """Lazy-load and cache the sentence-transformers model."""
    global _embedding_model
    if _embedding_model is None:
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
            print("Loading sentence-transformers model (one-time)...")
            _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        except ImportError:
            print("[ERROR] sentence-transformers not installed. Run: pip install sentence-transformers")
            return None
    return _embedding_model

def get_embedding(text: str) -> Optional[list]:
    """Fetch embedding from HuggingFace API or sentence-transformers fallback."""
    if EMBEDDING_API_URL:
        try:
            resp = requests.post(
                EMBEDDING_API_URL,
                headers={"Authorization": f"Bearer {EMBEDDING_API_KEY}", "Content-Type": "application/json"},
                json={"inputs": text},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            return data[0] if isinstance(data, list) and isinstance(data[0], list) else data
        except Exception as e:
            # Don't spam warnings - just fall through to local model
            pass

    # Local fallback using cached model
    model = get_embedding_model()
    if model:
        return model.encode(text).tolist()
    return None


# ─── LLM Category Tagging ──────────────────────────────────────────────────────

# Global category cache (loaded from file if available)
_category_cache = {}

def load_category_cache(cache_file: str = CATEGORY_CACHE_FILE) -> dict:
    """Load pre-classified category mappings from JSON file."""
    global _category_cache
    cache_path = Path(cache_file)
    if cache_path.exists():
        with open(cache_path, 'r') as f:
            _category_cache = json.load(f)
            print(f"Loaded {len(_category_cache)} category mappings from cache: {cache_file}")
    return _category_cache

def save_category_cache(cache: dict, cache_file: str = CATEGORY_CACHE_FILE) -> None:
    """Save category mappings to JSON file."""
    with open(cache_file, 'w') as f:
        json.dump(cache, f, indent=2)
    print(f"Saved {len(cache)} category mappings to: {cache_file}")

def classify_category(question_text: str, existing_category: str, source: str = "") -> str:
    """Map raw category to canonical taxonomy using cache, LLM, or heuristic fallback."""
    # Check cache first
    cache_key = existing_category.lower().strip()
    if cache_key in _category_cache:
        return _category_cache[cache_key]
    
    # For trivia source, categories are already clean - just use heuristic
    if source == "trivia" or not LLM_API_URL:
        return _heuristic_classify(existing_category)

    prompt = (
        f"Given this trivia question category '{existing_category}' and question text:\n"
        f"'{question_text[:200]}'\n\n"
        f"Map it to one category from this list:\n"
        f"{', '.join(CATEGORY_TAXONOMY)}\n\n"
        "Reply with ONLY the exact category name from the list."
    )

    try:
        resp = requests.post(
            LLM_API_URL,
            headers={"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "llama3-8b-8192",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 20,
                "temperature": 0,
            },
            timeout=20,
        )
        resp.raise_for_status()
        result = resp.json()["choices"][0]["message"]["content"].strip()
        for cat in CATEGORY_TAXONOMY:
            if cat.lower() in result.lower():
                return cat
    except Exception as e:
        print(f"  [WARN] LLM classify error: {e}", file=sys.stderr)

    return _heuristic_classify(existing_category)


def batch_classify_categories(categories: List[str], batch_size: int = 10) -> dict:
    """Classify multiple categories at once using LLM batching for efficiency.
    
    For 500k+ question datasets, this is MUCH more efficient than per-question classification.
    Extract unique categories first, batch classify them, then apply mapping during ingestion.
    
    Args:
        categories: List of unique category names to classify
        batch_size: Number of categories to classify per LLM call (default: 10)
    
    Returns:
        Dictionary mapping lowercase category name -> canonical taxonomy category
    """
    if not LLM_API_URL:
        print("[INFO] No LLM API configured, using heuristic classification")
        return {cat.lower().strip(): _heuristic_classify(cat) for cat in categories}
    
    result = {}
    categories = list(set(categories))  # Remove duplicates
    total = len(categories)
    
    print(f"Batch classifying {total} unique categories in batches of {batch_size}...")
    
    for i in tqdm(range(0, total, batch_size), desc="Classifying categories"):
        batch = categories[i:i + batch_size]
        
        # Build prompt for batch - keep it concise to avoid token limits
        prompt = (
            f"Map each category to ONE of these: {', '.join(CATEGORY_TAXONOMY)}\n\n"
            f"Categories:\n"
        )
        for idx, cat in enumerate(batch, 1):
            # Truncate very long category names
            cat_short = cat[:100] if len(cat) > 100 else cat
            prompt += f"{idx}. {cat_short}\n"
        
        prompt += (
            f"\nReturn JSON: {{\"1\": \"Category Name\", \"2\": \"Category Name\"}}\n"
            f"Only JSON, no explanation."
        )
        
        try:
            resp = requests.post(
                LLM_API_URL,
                headers={"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "llama3-8b-8192",  # Use standard model
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 400,
                    "temperature": 0.1,  # Low temp for consistent classification
                },
                timeout=30,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"].strip()
            
            # Extract JSON from response
            if "```" in content:
                match = re.search(r"```(?:json)?\s*([\s\S]+?)```", content)
                if match:
                    content = match.group(1).strip()
            
            mappings = json.loads(content)
            
            # Apply mappings to batch
            for idx, cat in enumerate(batch, 1):
                idx_str = str(idx)
                if idx_str in mappings:
                    classified = mappings[idx_str]
                    # Validate it's in taxonomy
                    if classified in CATEGORY_TAXONOMY:
                        result[cat.lower().strip()] = classified
                    else:
                        # Fuzzy match
                        for valid_cat in CATEGORY_TAXONOMY:
                            if valid_cat.lower() in classified.lower():
                                result[cat.lower().strip()] = valid_cat
                                break
                        else:
                            result[cat.lower().strip()] = _heuristic_classify(cat)
                else:
                    result[cat.lower().strip()] = _heuristic_classify(cat)
                    
        except requests.exceptions.HTTPError as e:
            # Show detailed error for HTTP issues
            error_detail = ""
            try:
                error_detail = e.response.json()
            except:
                error_detail = e.response.text[:200] if hasattr(e.response, 'text') else str(e)
            print(f"  [WARN] Batch classification HTTP error: {e}", file=sys.stderr)
            print(f"  [WARN] Error detail: {error_detail}", file=sys.stderr)
            # Fallback to heuristic for this batch
            for cat in batch:
                result[cat.lower().strip()] = _heuristic_classify(cat)
        except Exception as e:
            print(f"  [WARN] Batch classification error: {e}", file=sys.stderr)
            # Fallback to heuristic for this batch
            for cat in batch:
                result[cat.lower().strip()] = _heuristic_classify(cat)
        
        # Small delay to avoid rate limits
        time.sleep(0.5)
    
    return result

def _heuristic_classify(category: str) -> str:
    """Simple keyword heuristic for offline operation. Maps to spec taxonomy."""
    cat = category.lower()
    if any(k in cat for k in ["science", "nature", "biology", "chemistry", "physics", "astronomy"]):
        return "Science & Nature"
    if any(k in cat for k in ["history", "historical", "war", "ancient", "civil"]):
        return "History"
    if any(k in cat for k in ["geo", "country", "capital", "city", "continent", "ocean"]):
        return "Geography"
    if any(k in cat for k in ["entertain", "pop", "celebrity", "famous", "movie", "film", "tv", "television", "show"]):
        return "Entertainment"
    if any(k in cat for k in ["sport", "olympic", "athlete", "football", "basket", "baseball", "soccer", "leisure"]):
        return "Sports & Leisure"
    if any(k in cat for k in ["art", "literature", "book", "author", "novel", "poet", "painting"]):
        return "Arts & Literature"
    if any(k in cat for k in ["music", "song", "band", "album", "singer", "instrument"]):
        return "Music"
    if any(k in cat for k in ["food", "drink", "cuisine", "cook", "restaurant", "wine", "beer"]):
        return "Food & Drink"
    if any(k in cat for k in ["tech", "computer", "internet", "software", "hardware", "coding", "gaming", "game"]):
        return "Technology & Gaming"
    if any(k in cat for k in ["holiday", "tradition", "christmas", "festival", "celebration"]):
        return "Holidays & Traditions"
    if any(k in cat for k in ["word", "language", "grammar", "vocabulary", "spelling", "english"]):
        return "Language & Words"
    if any(k in cat for k in ["people", "place", "person", "biography"]):
        return "People & Places"
    if any(k in cat for k in ["math", "logic", "number", "equation", "puzzle"]):
        return "Mathematics & Logic"
    if any(k in cat for k in ["religion", "myth", "god", "bible", "church"]):
        return "Religion & Mythology"
    if any(k in cat for k in ["business", "economic", "finance", "stock", "company", "brand"]):
        return "Business & Economics"
    if any(k in cat for k in ["transport", "car", "vehicle", "train", "plane", "ship"]):
        return "Transportation"
    return "Other"


# ─── Auto-Tagging ──────────────────────────────────────────────────────────────

def generate_tags_batch(questions: List[str]) -> List[List[str]]:
    """Generate 2-5 descriptive tags for a batch of questions using LLM."""
    if not LLM_API_URL:
        return [["general"] for _ in questions]
    
    # Build prompt with all questions
    prompt_lines = ["For each of the following trivia questions, return a JSON array of 2–5 lowercase descriptive tags."]
    prompt_lines.append("Tags should describe the topic, not the category. Focus on the subject matter.\n")
    prompt_lines.append("Questions:")
    for i, q in enumerate(questions[:50], 1):  # Limit to 50 per batch
        prompt_lines.append(f"{i}. {q[:200]}")
    prompt_lines.append("\nReturn a JSON array of arrays, one per question.")
    prompt_lines.append("Example format: [[\"planets\",\"astronomy\",\"solar system\"],[\"geography\",\"europe\",\"capitals\"]]")
    prompt_lines.append("Return only the JSON. No explanation.")
    
    prompt = "\n".join(prompt_lines)
    
    try:
        resp = requests.post(
            LLM_API_URL,
            headers={"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "llama3-8b-8192",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500,
                "temperature": 0.3,
            },
            timeout=30,
        )
        resp.raise_for_status()
        result = resp.json()["choices"][0]["message"]["content"].strip()
        
        # Try to parse JSON from the response
        # Sometimes LLM wraps it in ```json blocks
        if "```" in result:
            result = re.search(r"```(?:json)?\s*([\s\S]+?)```", result)
            if result:
                result = result.group(1).strip()
        
        tags_list = json.loads(result)
        if isinstance(tags_list, list) and len(tags_list) == len(questions[:50]):
            # Pad if we sent fewer than requested
            while len(tags_list) < len(questions):
                tags_list.append(["general"])
            return tags_list[:len(questions)]
    except Exception as e:
        print(f"  [WARN] Auto-tagging batch error: {e}", file=sys.stderr)
    
    # Fallback: return generic tags
    return [["general"] for _ in questions]


# ─── Difficulty Estimation ─────────────────────────────────────────────────────

def estimate_difficulty(row: pd.Series, source: str) -> Optional[int]:
    """Return difficulty 1–5 based on available signals, per spec."""
    if source == "jeopardy":
        value = row.get("clue_value", row.get("value", 0))
        try:
            value = int(str(value).replace("$", "").replace(",", ""))
        except (ValueError, TypeError):
            value = 0
        # Spec mapping: 100-200→1, 300-400→2, 500-600→3, 800→4, 1000→5, 0→NULL
        if value == 0:
            return None
        if value <= 200:
            return 1
        if value <= 400:
            return 2
        if value <= 600:
            return 3
        if value <= 800:
            return 4
        return 5
    
    # Trivia source: map spec text values
    diff_raw = str(row.get("Difficulty", row.get("difficulty", ""))).strip()
    if "Common Knowledge" in diff_raw:
        return 1
    if "Moderate Knowledge" in diff_raw:
        return 2
    if "Specialized Knowledge" in diff_raw:
        return 3
    if "Obscure Knowledge" in diff_raw:
        return 4
    # Garbage values ("Brown", "Tango", etc.) → NULL
    if diff_raw and diff_raw not in ["nan", "None", ""]:
        # Check if it's one of the known garbage values
        if not any(k in diff_raw for k in ["Knowledge", "easy", "medium", "hard", "1", "2", "3", "4", "5"]):
            print(f"  [WARN] Unusual difficulty value: '{diff_raw}' - setting to NULL", file=sys.stderr)
            return None
    return None  # Default to NULL if not specified


# ─── Jeopardy Reformat ─────────────────────────────────────────────────────────

def reformat_jeopardy_question(clue: str, answer: str) -> str:
    """Convert Jeopardy clue + answer into a natural question sentence."""
    if not LLM_API_URL:
        return f"What is: {clue}"
    prompt = (
        f"Convert this Jeopardy clue into a standard trivia question.\n"
        f"Clue: {clue}\n"
        f"Answer: {answer}\n"
        "Reply with ONLY the question text, nothing else."
    )
    try:
        resp = requests.post(
            LLM_API_URL,
            headers={"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "llama3-8b-8192",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 80,
                "temperature": 0.3,
            },
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        return f"What is: {clue}"


# ─── Pre-classification for Large Datasets ────────────────────────────────────

def pre_classify_categories_from_file(source: str, filepath: str, output_file: str = CATEGORY_CACHE_FILE) -> None:
    """Pre-process a large dataset to extract and classify unique categories.
    
    This is the EFFICIENT approach for 500k+ question datasets:
    1. Extract all unique categories from CSV (maybe 100-5000 unique values)
    2. Batch classify them with LLM (or heuristic if no API)
    3. Save to cache file
    4. Use cache during actual ingestion (no per-question LLM calls)
    
    Usage:
        python ingest.py --pre-classify --source jeopardy --file huge_dataset.csv
        python ingest.py --source jeopardy --file huge_dataset.csv --use-cache
    """
    print(f"\n=== Pre-classifying categories from {filepath} ===")
    
    if source == "trivia":
        df = load_trivia_csv(filepath)
        category_col = "category"
        question_col = "question_text"
    elif source == "jeopardy":
        df = load_jeopardy_csv(filepath, reformat=False)
        category_col = "category_raw"
        question_col = "question_text"
    else:
        print(f"ERROR: Unknown source '{source}'", file=sys.stderr)
        sys.exit(1)
    
    # Extract unique categories
    unique_categories = df[category_col].dropna().unique().tolist()
    unique_categories = [str(cat).strip() for cat in unique_categories if str(cat).strip()]
    
    print(f"Found {len(unique_categories)} unique categories in dataset")
    print(f"Sample categories: {unique_categories[:10]}")
    
    # For Jeopardy, we need to analyze question text, not category names
    # Build a map by sampling questions from each category
    if source == "jeopardy":
        print("\n[INFO] Jeopardy categories are game-show format, analyzing question samples...")
        category_map = {}
        
        for raw_cat in tqdm(unique_categories, desc="Classifying by question content"):
            # Get sample questions from this category
            sample_questions = df[df[category_col] == raw_cat].head(5)
            
            if len(sample_questions) == 0:
                category_map[raw_cat.lower().strip()] = "Other"
                continue
            
            # Get the question text
            q_samples = []
            for _, row in sample_questions.iterrows():
                q_text = row.get(question_col, "").strip()
                if q_text:
                    q_samples.append(q_text[:150])
            
            if not q_samples:
                category_map[raw_cat.lower().strip()] = "Other"
                continue
            
            # Classify based on question content, not category name
            if not LLM_API_URL:
                # Heuristic: look for keywords in question text
                combined_text = ' '.join(q_samples).lower()
                classified = _heuristic_classify(combined_text)
            else:
                # Use LLM with sample questions
                prompt = (
                    f"Based on these sample trivia questions:\n"
                    + "\n".join(f"- {q}" for q in q_samples[:3])
                    + f"\n\nWhat is the main topic? Choose ONE from:\n{', '.join(CATEGORY_TAXONOMY)}\n"
                    + "Reply with ONLY the category name."
                )
                try:
                    resp = requests.post(
                        LLM_API_URL,
                        headers={"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"},
                        json={
                            "model": "llama3-8b-8192",
                            "messages": [{"role": "user", "content": prompt}],
                            "max_tokens": 20,
                            "temperature": 0,
                        },
                        timeout=20,
                    )
                    resp.raise_for_status()
                    result = resp.json()["choices"][0]["message"]["content"].strip()
                    classified = "Other"
                    for cat in CATEGORY_TAXONOMY:
                        if cat.lower() in result.lower():
                            classified = cat
                            break
                except Exception as e:
                    # Fallback to heuristic
                    combined_text = ' '.join(q_samples).lower()
                    classified = _heuristic_classify(combined_text)
            
            category_map[raw_cat.lower().strip()] = classified
    else:
        # For non-Jeopardy sources, category names are semantic
        if not LLM_API_URL:
            print("\n[INFO] No LLM API configured - using fast heuristic classification")
            category_map = {cat.lower().strip(): _heuristic_classify(cat) for cat in unique_categories}
        else:
            # Batch classify (using smaller batch size for reliability)
            category_map = batch_classify_categories(unique_categories, batch_size=10)
    
    # Save to cache file
    save_category_cache(category_map, output_file)
    
    print(f"\n✓ Category classification complete!")
    print(f"  Now run ingestion with --use-cache to use these mappings:")
    print(f"  python ingest.py --source {source} --file {filepath} --use-cache --batch-size 100")


# ─── Source Loaders ────────────────────────────────────────────────────────────

def load_trivia_csv(filepath: str, nrows: int = None, from_end: bool = False, skip_rows: int = 0) -> pd.DataFrame:
    """Load the Trivia_Collection CSV (30k+ rows) per spec."""
    if from_end and nrows:
        # Read entire file and take last N rows, optionally skipping some from the end
        df = pd.read_csv(filepath)
        if skip_rows > 0:
            df = df.iloc[-(nrows + skip_rows):-skip_rows]
        else:
            df = df.tail(nrows)
    else:
        df = pd.read_csv(filepath, nrows=nrows)
    
    # Map column names - look for exact matches first
    col_map = {}
    for col in df.columns:
        lc = col.lower().strip()
        col_stripped = col.strip()
        
        # Exact matches per spec
        if col_stripped == "Question":
            col_map[col] = "question_text"
        elif col_stripped == "Answer":
            col_map[col] = "answer_text"
        elif col_stripped == "Category":
            col_map[col] = "category"
        elif col_stripped == "SubCatName":
            col_map[col] = "subcategory_raw"
        elif col_stripped == "Difficulty":
            col_map[col] = "Difficulty"
        # Fuzzy fallbacks
        elif "question" in lc and "question_text" not in col_map:
            col_map[col] = "question_text"
        elif "answer" in lc and "answer_text" not in col_map:
            col_map[col] = "answer_text"
    
    df = df.rename(columns=col_map)
    
    # Verify required columns
    required = ["question_text", "answer_text"]
    for r in required:
        if r not in df.columns:
            raise ValueError(f"Column mapping failed for '{r}'. Available: {list(df.columns)}")
    
    # Set defaults for missing columns
    if "category" not in df.columns:
        df["category"] = "Other"
    
    # Extract subcategory from SubCatName (right side of pipe)
    if "subcategory_raw" in df.columns:
        def extract_subcat(val):
            if pd.isna(val):
                return None
            s = str(val).strip()
            if "|" in s:
                return s.split("|")[-1].strip()
            return s
        df["subcategory"] = df["subcategory_raw"].apply(extract_subcat)
    else:
        df["subcategory"] = None
    
    # Select final columns
    cols = ["question_text", "answer_text", "category", "subcategory"]
    if "Difficulty" in df.columns:
        cols.append("Difficulty")
    
    return df[cols]


def load_jeopardy_csv(filepath: str, reformat: bool = False, nrows: int = None, from_end: bool = False, skip_rows: int = 0) -> pd.DataFrame:
    """Load the Jeopardy combined_season CSV (997 rows) per spec."""
    if from_end and nrows:
        # Read entire file and take last N rows, optionally skipping some from the end
        df = pd.read_csv(filepath)
        if skip_rows > 0:
            df = df.iloc[-(nrows + skip_rows):-skip_rows]
        else:
            df = df.tail(nrows)
    else:
        df = pd.read_csv(filepath, nrows=nrows)
    col_map = {}
    for col in df.columns:
        lc = col.lower().strip()
        if lc in ("question", "clue") and "question_text" not in col_map:
            col_map[col] = "question_text"
        elif lc in ("answer", "correct_response") and "answer_text" not in col_map:
            col_map[col] = "answer_text"
        elif "category" in lc and "category" not in col_map:
            col_map[col] = "category_raw"
        elif lc in ("value", "clue_value") and "clue_value" not in col_map:
            col_map[col] = "clue_value"
        elif "air_date" in lc or "airdate" in lc:
            col_map[col] = "air_date"
        elif "round" in lc and "round" not in col_map:
            col_map[col] = "round"
    
    df = df.rename(columns=col_map)
    
    if "question_text" not in df.columns or "answer_text" not in df.columns:
        raise ValueError(f"Column mapping failed. Available: {list(df.columns)}")

    # Store original category as subcategory (title-cased per spec)
    if "category_raw" in df.columns:
        df["subcategory"] = df["category_raw"].apply(
            lambda x: str(x).strip().title() if pd.notna(x) else None
        )
        df["category"] = df["category_raw"]  # Will be normalized later
    else:
        df["category"] = "Other"
        df["subcategory"] = None

    if reformat:
        print("Reformatting Jeopardy clues with LLM (may be slow)...")
        new_questions = []
        for _, row in tqdm(df.iterrows(), total=len(df), desc="Reformatting"):
            new_questions.append(reformat_jeopardy_question(row["question_text"], row["answer_text"]))
            time.sleep(0.05)
        df["question_text"] = new_questions

    return df


# ─── Ingestion Pipeline ────────────────────────────────────────────────────────

def ingest(
    source: str,
    filepath: str,
    batch_size: int = BATCH_SIZE_DEFAULT,
    reformat_questions: bool = False,
    dry_run: bool = False,
    skip_tags: bool = False,
    use_cache: bool = False,
    limit: int = None,
    from_end: bool = False,
    skip_rows: int = 0,
) -> None:
    if limit:
        if from_end:
            if skip_rows > 0:
                limit_msg = f" (rows {skip_rows+1}-{skip_rows+limit} from end, most recent)"
            else:
                limit_msg = f" (last {limit} rows, most recent)"
        else:
            limit_msg = f" (first {limit} rows)"
    else:
        limit_msg = ""
    print(f"Loading {source} CSV from: {filepath}{limit_msg}")
    
    # Load category cache if requested (for efficient large dataset processing)
    if use_cache:
        load_category_cache()
    
    if source == "jeopardy":
        df = load_jeopardy_csv(filepath, reformat=reformat_questions, nrows=limit, from_end=from_end, skip_rows=skip_rows)
    else:
        df = load_trivia_csv(filepath, nrows=limit, from_end=from_end, skip_rows=skip_rows)

    print(f"Loaded {len(df)} rows.")
    supabase = get_supabase()

    # Fetch existing hashes for dedup
    print("Fetching existing question hashes for deduplication...")
    existing_hashes: set[str] = set()
    offset = 0
    page = 1000
    while True:
        resp = supabase.table("questions").select("normalized_hash").range(offset, offset + page - 1).execute()
        rows = resp.data or []
        for r in rows:
            if r.get("normalized_hash"):
                existing_hashes.add(r["normalized_hash"])
        if len(rows) < page:
            break
        offset += page

    print(f"Found {len(existing_hashes)} existing questions in DB.")

    inserted = 0
    skipped_dup = 0
    skipped_bad = 0
    failed_batches = 0
    batch: List[dict] = []
    questions_for_tagging: List[str] = []
    batch_count = 0

    for _, row in tqdm(df.iterrows(), total=len(df), desc="Processing"):
        q_text = str(row.get("question_text", "")).strip()
        a_text = str(row.get("answer_text", "")).strip()

        if not q_text or not a_text or q_text.lower() in ("nan", "none") or a_text.lower() in ("nan", "none"):
            skipped_bad += 1
            continue

        h = compute_hash(q_text, a_text)
        if h in existing_hashes:
            skipped_dup += 1
            continue

        existing_hashes.add(h)

        raw_category = str(row.get("category", "Other")).strip()
        category = classify_category(q_text, raw_category, source)
        difficulty = estimate_difficulty(row, source)
        subcategory = row.get("subcategory") if pd.notna(row.get("subcategory")) else None
        
        source_year = None
        if "air_date" in row and pd.notna(row.get("air_date")):
            try:
                source_year = int(str(row["air_date"])[:4])
            except (ValueError, TypeError):
                pass

        record = {
            "question_text": q_text,
            "answer": a_text,
            "category": category,
            "difficulty": difficulty,
            "source": source,
            "normalized_hash": h,
        }
        if subcategory:
            record["subcategory"] = subcategory
        if source_year:
            record["source_year"] = source_year

        batch.append(record)
        questions_for_tagging.append(q_text)

        # Flush batch when full
        if len(batch) >= batch_size:
            batch_count += 1
            
            # Recreate Supabase client every 50 batches to avoid stale connections
            if batch_count % 50 == 0:
                supabase = get_supabase()
            
            if not dry_run:
                try:
                    _flush_batch(supabase, batch, questions_for_tagging, skip_tags)
                except Exception as e:
                    print(f"\n[ERROR] Batch {batch_count} failed completely: {e}", file=sys.stderr)
                    print(f"[ERROR] Continuing with next batch...", file=sys.stderr)
                    failed_batches += 1
                    # Recreate client for next batch
                    supabase = get_supabase()
            inserted += len(batch)
            batch = []
            questions_for_tagging = []

    # Flush remaining
    if batch:
        if not dry_run:
            try:
                _flush_batch(supabase, batch, questions_for_tagging, skip_tags)
            except Exception as e:
                print(f"\n[ERROR] Final batch failed: {e}", file=sys.stderr)
                failed_batches += 1
        inserted += len(batch)

    summary = f"\n✓ Done. Inserted: {inserted} | Skipped (duplicate): {skipped_dup} | Skipped (bad data): {skipped_bad}"
    if failed_batches > 0:
        summary += f" | Failed batches: {failed_batches}"
    print(summary)


def _flush_batch(supabase: Client, records: List[dict], questions: List[str], skip_tags: bool = False) -> None:
    """Insert a batch of questions, generate tags, compute embeddings, and store."""
    
    # Step 1: Generate tags for this batch (if enabled)
    if not skip_tags and questions:
        print(f"  Generating tags for {len(questions)} questions...")
        tags_list = generate_tags_batch(questions)
        for i, record in enumerate(records):
            if i < len(tags_list):
                record["tags"] = tags_list[i]
    
    # Step 2: Insert questions with retry logic
    max_retries = 3
    for attempt in range(max_retries):
        try:
            resp = supabase.table("questions").insert(records).execute()
            inserted_rows = resp.data or []
            break
        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                print(f"  [WARN] Insert failed (attempt {attempt + 1}/{max_retries}), retrying in {wait_time}s: {e}", file=sys.stderr)
                time.sleep(wait_time)
                # Recreate client for fresh connection
                supabase = get_supabase()
            else:
                print(f"  [ERROR] Insert failed after {max_retries} attempts, skipping batch: {e}", file=sys.stderr)
                return

    # Step 3: Generate and store embeddings
    print(f"  Generating embeddings for {len(inserted_rows)} questions...")
    failed_embeddings = 0
    
    for row in inserted_rows:
        text = row["question_text"]
        emb = get_embedding(text)
        if emb and len(emb) == EMBEDDING_DIM:
            # Retry embedding insertion
            for attempt in range(max_retries):
                try:
                    supabase.table("question_embeddings").insert(
                        {"question_id": row["id"], "embedding": emb}
                    ).execute()
                    break
                except Exception as e:
                    if attempt < max_retries - 1:
                        time.sleep(0.5)
                        # Recreate client for fresh connection
                        supabase = get_supabase()
                    else:
                        failed_embeddings += 1
                        if failed_embeddings <= 5:  # Only show first few errors
                            print(f"  [WARN] Embedding insert failed for question {row['id']}: {e}", file=sys.stderr)
    
    if failed_embeddings > 0:
        print(f"  [WARN] Failed to insert {failed_embeddings} embeddings (questions saved, embeddings missing)", file=sys.stderr)


# ─── Semantic Deduplication ────────────────────────────────────────────────────

def semantic_dedup(threshold: float = 0.92, dry_run: bool = False) -> None:
    """
    Find semantic duplicates using cosine similarity on embeddings.
    For pairs above threshold, set canonical_id on the duplicate.
    Per spec: only checks top-3 neighbors per question for efficiency.
    """
    print(f"Running semantic deduplication with threshold={threshold}...")
    supabase = get_supabase()
    
    # Fetch all questions with embeddings
    print("Fetching all questions with embeddings...")
    questions = []
    offset = 0
    page_size = 1000
    
    while True:
        resp = supabase.table("questions").select(
            "id, question_text, verified, subcategory, created_at"
        ).range(offset, offset + page_size - 1).execute()
        rows = resp.data or []
        if not rows:
            break
        questions.extend(rows)
        offset += page_size
        if len(rows) < page_size:
            break
    
    print(f"Found {len(questions)} questions total.")
    
    # For each question, find its top-3 nearest neighbors using pgvector
    duplicates_found = 0
    
    for q in tqdm(questions, desc="Finding semantic duplicates"):
        q_id = q["id"]
        
        # Query for similar questions using cosine similarity
        # Note: This requires a raw SQL query since Supabase client doesn't support vector ops directly
        try:
            # Use RPC or raw SQL to find neighbors
            # For now, we'll use a simplified approach - in production this would use pgvector's knn search
            resp = supabase.rpc(
                "find_similar_questions",
                {
                    "query_question_id": q_id,
                    "similarity_threshold": threshold,
                    "max_results": 3
                }
            ).execute()
            
            similar = resp.data or []
            
            for sim in similar:
                similarity = sim.get("similarity", 0)
                similar_id = sim.get("id")
                
                if similarity > threshold and similar_id != q_id:
                    # Determine which to keep: prefer verified, then richer metadata, then older
                    keeper_id = q_id
                    duplicate_id = similar_id
                    
                    # Fetch the similar question details
                    similar_q = next((x for x in questions if x["id"] == similar_id), None)
                    if similar_q:
                        # Keep verified over unverified
                        if similar_q.get("verified") and not q.get("verified"):
                            keeper_id, duplicate_id = duplicate_id, keeper_id
                        # Keep one with subcategory over one without
                        elif similar_q.get("subcategory") and not q.get("subcategory"):
                            keeper_id, duplicate_id = duplicate_id, keeper_id
                    
                    if not dry_run:
                        # Set canonical_id on the duplicate
                        supabase.table("questions").update(
                            {"canonical_id": keeper_id}
                        ).eq("id", duplicate_id).execute()
                    
                    duplicates_found += 1
                    if dry_run:
                        print(f"  [DRY RUN] Would mark {duplicate_id} as duplicate of {keeper_id} (sim={similarity:.3f})")
        
        except Exception as e:
            # If RPC doesn't exist yet, skip semantic dedup
            if "find_similar_questions" in str(e):
                print(f"\n[ERROR] RPC function 'find_similar_questions' not found in database.")
                print("Semantic deduplication requires a custom RPC function. Skipping for now.")
                return
            # Other errors - just log and continue
            continue
    
    print(f"\n✓ Semantic dedup complete. Found {duplicates_found} duplicate pairs.")


# ─── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="PubQuizParty question bank ingestion pipeline")
    
    # Mode selection
    parser.add_argument("--semantic-dedup", action="store_true", 
                       help="Run semantic deduplication on existing questions (instead of ingestion)")
    parser.add_argument("--pre-classify", action="store_true",
                       help="Pre-classify categories from large dataset (efficient for 500k+ questions)")
    
    # Ingestion arguments
    parser.add_argument("--source", choices=["trivia", "jeopardy"], 
                       help="Dataset source type (required for ingestion)")
    parser.add_argument("--file", help="Path to the CSV file (required for ingestion)")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE_DEFAULT, 
                       help="Rows per insert batch")
    parser.add_argument("--reformat-questions", action="store_true", 
                       help="Reformat Jeopardy clues with LLM")
    parser.add_argument("--skip-tags", action="store_true",
                       help="Skip auto-tagging (faster, but questions won't have tags)")
    parser.add_argument("--use-cache", action="store_true",
                       help="Use pre-classified category cache (run --pre-classify first)")
    parser.add_argument("--limit", type=int, default=None,
                       help="Limit number of rows to process (useful for testing)")
    parser.add_argument("--from-end", action="store_true",
                       help="Read from end of file (most recent questions) when using --limit")
    parser.add_argument("--skip-rows", type=int, default=0,
                       help="Skip N rows from end before reading (use with --from-end to continue where you left off)")
    
    # Semantic dedup arguments
    parser.add_argument("--threshold", type=float, default=0.92,
                       help="Cosine similarity threshold for semantic dedup (default: 0.92)")
    
    # General arguments
    parser.add_argument("--dry-run", action="store_true", 
                       help="Parse and process but do not insert/update database")
    
    args = parser.parse_args()
    
    # Route to correct function
    if args.semantic_dedup:
        semantic_dedup(threshold=args.threshold, dry_run=args.dry_run)
    elif args.pre_classify:
        # Pre-classification mode - validate required args
        if not args.source or not args.file:
            parser.error("--source and --file are required for pre-classification mode")
        pre_classify_categories_from_file(source=args.source, filepath=args.file)
    else:
        # Ingestion mode - validate required args
        if not args.source or not args.file:
            parser.error("--source and --file are required for ingestion mode")
        
        ingest(
            source=args.source,
            filepath=args.file,
            batch_size=args.batch_size,
            reformat_questions=args.reformat_questions,
            dry_run=args.dry_run,
            skip_tags=args.skip_tags,
            use_cache=args.use_cache,
            limit=args.limit,
            from_end=args.from_end,
            skip_rows=args.skip_rows,
        )


if __name__ == "__main__":
    main()
