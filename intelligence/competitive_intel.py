"""
Competitive Intelligence — part of Layer 2 (Brand Intelligence).

Tracks which newsletters competitors sponsor, and uses that signal to
improve matching. If Brand A's competitor sponsors Newsletter X, then
Newsletter X is likely a good match for Brand A too.

Data source: the `sponsor_mentions` field extracted by Layer 1 (Content
Intelligence) from each newsletter issue analysis. We cross-reference
these mentions with brand competitor lists from Layer 2.

This is NOT a separate data collection step — it's a synthesis layer
that connects data already being collected by Layers 1 and 2.
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from typing import Optional

from brand_intelligence import _supabase_get, get_all_brands
from content_intelligence import get_signed_up_creators

logger = logging.getLogger(__name__)


def build_sponsor_map() -> dict[str, list[str]]:
    """Build a map of sponsor_name → [creator_ids] from all creator intelligence data.

    Returns e.g. {"Amplitude": ["uuid1", "uuid2"], "Notion": ["uuid3"]}
    """
    creators = get_signed_up_creators()
    sponsor_map: dict[str, list[str]] = defaultdict(list)

    for creator in creators:
        intel = creator.get("content_intelligence")
        if not intel:
            continue
        if isinstance(intel, str):
            try:
                intel = json.loads(intel)
            except json.JSONDecodeError:
                continue

        # Collect sponsor mentions from individual issue analyses
        for analysis in intel.get("issue_analyses", []):
            for sponsor in analysis.get("sponsor_mentions", []):
                sponsor_lower = sponsor.strip().lower()
                if sponsor_lower and creator["id"] not in sponsor_map[sponsor_lower]:
                    sponsor_map[sponsor_lower].append(creator["id"])

        # Also from synthesized profile
        for sponsor in intel.get("synthesized", {}).get("existing_sponsors", []):
            sponsor_lower = sponsor.strip().lower()
            if sponsor_lower and creator["id"] not in sponsor_map[sponsor_lower]:
                sponsor_map[sponsor_lower].append(creator["id"])

    return dict(sponsor_map)


def get_competitor_sponsored_creators(brand_id: str) -> dict:
    """Find which creators are sponsored by a brand's competitors.

    Returns:
    {
      "competitor_name": {
        "sponsors": ["creator_id_1", "creator_id_2"],
        "creator_names": ["Newsletter A", "Newsletter B"]
      }
    }
    """
    from brand_intelligence import get_brand

    brand = get_brand(brand_id)
    if not brand:
        return {}

    intel = brand.get("brand_intelligence")
    if not intel:
        return {}
    if isinstance(intel, str):
        try:
            intel = json.loads(intel)
        except json.JSONDecodeError:
            return {}

    competitors = intel.get("synthesized", {}).get("competitors", [])
    if not competitors:
        return {}

    # Build the sponsor map
    sponsor_map = build_sponsor_map()

    # Look up creator names for display
    creators_by_id = {}
    for creator in get_signed_up_creators():
        creators_by_id[creator["id"]] = creator.get("newsletter_name", "Unknown")

    # Cross-reference
    result = {}
    for competitor in competitors:
        comp_lower = competitor.strip().lower()
        creator_ids = sponsor_map.get(comp_lower, [])
        if creator_ids:
            result[competitor] = {
                "sponsors": creator_ids,
                "creator_names": [creators_by_id.get(cid, "Unknown") for cid in creator_ids],
            }

    return result


def get_competitor_signal(brand_id: str, creator_id: str) -> float:
    """Get a 0-1 signal for how much competitor activity there is on a creator.

    Used by the matching engine (Layer 3) as one factor in the match score.
    Higher = brand's competitors are sponsoring this creator = strong signal.
    """
    competitor_data = get_competitor_sponsored_creators(brand_id)
    if not competitor_data:
        return 0.0

    # Count how many of the brand's competitors sponsor this creator
    total_competitors = len(competitor_data)
    competitors_on_creator = sum(
        1 for data in competitor_data.values()
        if creator_id in data["sponsors"]
    )

    if total_competitors == 0:
        return 0.0

    # Normalize: if 2 out of 3 competitors sponsor this creator, signal = 0.67
    return min(competitors_on_creator / total_competitors, 1.0)


def get_full_competitive_landscape(brand_id: str) -> dict:
    """Full competitive intelligence report for a brand.

    Returns which competitors sponsor which newsletters, and recommends
    creators that competitors are using but this brand isn't.
    """
    competitor_data = get_competitor_sponsored_creators(brand_id)

    # Flatten all creator IDs that competitors sponsor
    all_competitor_creators = set()
    for data in competitor_data.values():
        all_competitor_creators.update(data["sponsors"])

    return {
        "brand_id": brand_id,
        "competitors_tracked": list(competitor_data.keys()),
        "competitor_sponsorships": competitor_data,
        "total_competitor_creators": len(all_competitor_creators),
        "recommended_creators": list(all_competitor_creators),  # These are high-signal matches
    }


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) > 1:
        brand_id = sys.argv[1]
        print(f"Competitive landscape for brand {brand_id}:")
        result = get_full_competitive_landscape(brand_id)
        print(json.dumps(result, indent=2))
    else:
        print("Building sponsor map...")
        smap = build_sponsor_map()
        print(f"Found {len(smap)} unique sponsors across creators:")
        for sponsor, creators in sorted(smap.items(), key=lambda x: -len(x[1]))[:20]:
            print(f"  {sponsor}: {len(creators)} creators")
