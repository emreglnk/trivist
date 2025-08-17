#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generates challenging English MCQs via DeepSeek and stores them into MongoDB.
- Categories default: science, history, art, sports, geography, entertainment
- Filters near-duplicates with Jaccard similarity (batch & recent DB sample)
- Enforces JSON output; attempts salvage if model returns extra text
"""

import os
import re
import json
import math
import argparse
from typing import List, Dict, Any
from dotenv import load_dotenv, find_dotenv
import requests
from pymongo import MongoClient
from pymongo.errors import BulkWriteError

# -------------------------- utils --------------------------

def jaccard(s1: str, s2: str) -> float:
	def norm(t: str) -> List[str]:
		return [w for w in re.sub(r"[^a-z0-9 ]+", " ", t.lower()).split() if w]
	a, b = set(norm(s1)), set(norm(s2))
	if not a and not b:
		return 1.0
	return len(a & b) / max(1, len(a | b))

def is_valid_item(it: Dict[str, Any]) -> bool:
	if not isinstance(it, dict):
		return False
	if not isinstance(it.get("q"), str) or not it["q"].strip():
		return False
	opts = it.get("opts")
	if not isinstance(opts, list) or len(opts) != 4:
		return False
	if not all(isinstance(o, str) and o.strip() for o in opts):
		return False
	a = it.get("a")
	if not isinstance(a, int) or not (0 <= a <= 3):
		return False
	# Soft length caps (keeps things tight as requested)
	if len(it["q"]) > 180 or any(len(o) > 80 for o in opts):
		return False
	return True

def salvage_json_block(text: str) -> dict:
	"""Try to extract largest JSON object from a messy response."""
	start = text.find("{")
	end = text.rfind("}")
	if start >= 0 and end > start:
		return json.loads(text[start:end+1])
	raise ValueError("No JSON object found in model response.")

# -------------------------- deepseek call --------------------------

def call_deepseek(api_key: str, model: str, category: str, wanted: int, max_tokens: int = 1800, api_base: str = "https://api.deepseek.com") -> List[Dict[str, Any]]:
	oversample = math.ceil(wanted * 1.6)
	system_prompt = (
		"You are a generator of concise, challenging, upper high-school to early-college "
		"multiple-choice quiz questions. Output strictly valid JSON only. No explanations, "
		"no prose. All content must be in English."
	)
	user_prompt = f"""
Generate {oversample} distinct multiple-choice questions for the category "{category}" with these rules:

- Difficulty: upper high-school to early-college. Avoid trivial facts.
- Variety: mix formats (definition, cause-effect, identify-the-exception, chronology, short scenario/application).
- Avoid near-duplicates and avoid two questions testing the same micro-fact.
- Each item: exactly four options ("opts"), ONE correct answer by index "a" (0..3).
- Distractors: plausible but clearly wrong to a knowledgeable student.
- Prefer globally relevant knowledge, not hyper-local.
- Keep it concise: question ≤ 180 chars; each option ≤ 80 chars.

Return ONLY JSON with:
{{
  "items": [
    {{ "q": "Question text", "opts": ["A","B","C","D"], "a": 2 }}
  ]
}}
""".strip()

	payload = {
		"model": model,
		"messages": [
			{"role": "system", "content": system_prompt},
			{"role": "user", "content": user_prompt},
		],
		# Encourage diversity but keep it sane
		"temperature": 0.9,
		"top_p": 0.9,
		"max_tokens": max_tokens,
		# If DeepSeek supports it in your account, this helps force JSON:
		"response_format": {"type": "json_object"},
	}

	api_key = (api_key or "").strip()
	url = f"{api_base.rstrip('/')}/v1/chat/completions"
	resp = requests.post(
		url,
		headers={
			"Authorization": f"Bearer {api_key}",
			"Content-Type": "application/json",
			"Accept": "application/json",
		},
		json=payload,
		timeout=60,
	)
	resp.raise_for_status()
	content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "") or ""

	try:
		data = json.loads(content)
	except json.JSONDecodeError:
		data = salvage_json_block(content)

	items = data.get("items") or []
	cleaned = []
	for it in items:
		if not is_valid_item(it):
			continue
		# intra-batch near-duplicate filter
		too_similar = any(jaccard(it["q"], kept["q"]) >= 0.8 for kept in cleaned)
		if too_similar:
			continue
		cleaned.append({
			"category": category,
			"q": it["q"].strip(),
			"opts": [o.strip() for o in it["opts"]],
			"a": int(it["a"]),
		})
		if len(cleaned) >= wanted:
			break
	return cleaned

# -------------------------- main --------------------------

DEFAULT_CATEGORIES = ["science", "history", "art", "sports", "geography", "entertainment"]

def validate_deepseek_credentials(api_key: str, api_base: str) -> None:
	api_key = (api_key or "").strip()
	url = f"{api_base.rstrip('/')}/v1/models"
	try:
		r = requests.get(
			url,
			headers={
				"Authorization": f"Bearer {api_key}",
				"Accept": "application/json",
			},
			timeout=20,
		)
		if r.status_code == 401:
			raise SystemExit("DeepSeek authentication failed (401). Check DEEPSEEK_API_KEY and account access.")
		r.raise_for_status()
	except requests.HTTPError as http_err:
		if getattr(http_err.response, "status_code", None) == 401:
			raise SystemExit("DeepSeek authentication failed (401). Check DEEPSEEK_API_KEY and account access.")
		raise

def main():
	env_path = find_dotenv(usecwd=True)
	load_dotenv(dotenv_path=env_path if env_path else None)

	parser = argparse.ArgumentParser(description="Generate & seed MCQ questions via DeepSeek into MongoDB.")
	parser.add_argument("--per", type=int, default=8, help="Questions per category (default: 8)")
	parser.add_argument("--cats", type=str, default=",".join(DEFAULT_CATEGORIES),
						help="Comma-separated categories (default: all)")
	parser.add_argument("--model", type=str, default=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
						help="DeepSeek model name (default from env or deepseek-chat)")
	parser.add_argument("--deepseek-base", type=str, default=os.getenv("DEEPSEEK_BASE", "https://api.deepseek.com"),
						help="DeepSeek API base URL (default: https://api.deepseek.com)")
	parser.add_argument("--max-tokens", type=int, default=1800, help="max_tokens for generation")
	parser.add_argument("--dry-run", action="store_true", help="Do not write to DB; just print sample.")
	parser.add_argument("--db-sample", type=int, default=600,
						help="How many recent questions per category to sample for near-duplicate checks (default: 600)")
	parser.add_argument("--target-per-cat", type=int, default=1000,
						help="Target total questions per category to reach (default: 1000)")
	args = parser.parse_args()

	api_key = os.getenv("DEEPSEEK_API_KEY")
	mongo_uri = os.getenv("MONGODB_URI")
	db_name = os.getenv("DB_NAME", "quizdb")
	collection_name = os.getenv("COLLECTION", "questions")

	if not api_key:
		raise SystemExit("Missing DEEPSEEK_API_KEY in environment/.env")
	if not mongo_uri:
		raise SystemExit("Missing MONGODB_URI in environment/.env")

	categories = [c.strip() for c in args.cats.split(",") if c.strip()]
	if not categories:
		raise SystemExit("No categories provided.")

	# Validate DeepSeek credentials early to fail-fast on 401
	validate_deepseek_credentials(api_key, args.deepseek_base)

	client = MongoClient(mongo_uri)
	db = client[db_name]
	col = db[collection_name]

	# Unique index: category+q
	col.create_index([("category", 1), ("q", 1)], unique=True)

	total_inserted = 0
	target_per_cat = args.target_per_cat

	for cat in categories:
		current_count = col.count_documents({"category": cat})
		print(f"\n[{cat}] Starting with {current_count}/{target_per_cat} questions.")

		if args.dry_run:
			# In dry-run, just do one generation cycle for preview
			wanted = max(1, min(args.per, max(0, target_per_cat - current_count)))
			print(f"[{cat}] Dry-run: would request up to {wanted} new questions.")
			try:
				batch = call_deepseek(api_key, args.model, cat, wanted, max_tokens=args.max_tokens, api_base=args.deepseek_base)
			except Exception as e:
				print(f"[{cat}] DeepSeek error:", e)
				continue
			recent_qs = [d["q"] for d in col.find({"category": cat}, {"q": 1, "_id": 0})
						 .sort([("_id", -1)]).limit(max(50, args.db_sample))]
			filtered = []
			for it in batch:
				too_similar_db = any(jaccard(it["q"], q_old) >= 0.8 for q_old in recent_qs)
				if too_similar_db:
					continue
				filtered.append(it)
			print(f"[{cat}] Dry-run sample (first 2):")
			for x in filtered[:2]:
				print(json.dumps(x, ensure_ascii=False, indent=2))
			continue

		no_progress_rounds = 0
		while current_count < target_per_cat:
			remaining = target_per_cat - current_count
			wanted = min(args.per, remaining)
			print(f"[{cat}] Have {current_count}/{target_per_cat}. Generating up to {wanted}...")

			try:
				batch = call_deepseek(api_key, args.model, cat, wanted, max_tokens=args.max_tokens, api_base=args.deepseek_base)
			except Exception as e:
				print(f"[{cat}] DeepSeek error:", e)
				no_progress_rounds += 1
				if no_progress_rounds >= 10:
					print(f"[{cat}] Too many consecutive errors; moving on.")
					break
				continue

			if not batch:
				print(f"[{cat}] No valid items generated in this round.")
				no_progress_rounds += 1
				if no_progress_rounds >= 10:
					print(f"[{cat}] No progress after several rounds; moving on.")
					break
				continue

			recent_qs = [d["q"] for d in col.find({"category": cat}, {"q": 1, "_id": 0})
						 .sort([("_id", -1)]).limit(max(50, args.db_sample))]
			filtered = []
			for it in batch:
				too_similar_db = any(jaccard(it["q"], q_old) >= 0.8 for q_old in recent_qs)
				if too_similar_db:
					continue
				filtered.append(it)

			if not filtered:
				print(f"[{cat}] Everything looked too similar to existing DB; nothing to insert this round.")
				no_progress_rounds += 1
				if no_progress_rounds >= 10:
					print(f"[{cat}] No progress after several rounds; moving on.")
					break
				continue

			try:
				res = col.insert_many(filtered, ordered=False)
				inserted = len(res.inserted_ids)
				total_inserted += inserted
				print(f"[{cat}] Inserted: {inserted}")
			except BulkWriteError as bwe:
				print(f"[{cat}] Partial insert. Duplicates or errors encountered.")
				# We cannot reliably count inserted from the exception; recalc from DB
			finally:
				# Refresh progress from DB to be exact
				new_count = col.count_documents({"category": cat})
				if new_count <= current_count:
					no_progress_rounds += 1
				else:
					no_progress_rounds = 0
				current_count = new_count

		print(f"[{cat}] Reached {current_count}/{target_per_cat}.")

	print(f"\nDone. Total inserted this run: {total_inserted}")
	client.close()

if __name__ == "__main__":
	main()
