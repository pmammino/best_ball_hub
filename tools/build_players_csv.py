"""
Build / refresh players.csv — the canonical bridge between the RotoWire
projection feed and the Underdog player universe.

Columns: nfl_news_id, first_name, last_name, position, team, underdog_id

  * nfl_news_id  — RotoWire player id. Equals the <Player Id="…"> attribute in
                   the NFLceilfloor feed and the NFLNewsID column in the old
                   projections CSVs. This is what the app's projections are
                   keyed on.
  * underdog_id  — Underdog's STABLE player id (not the per-slate appearance id
                   found in a draft export). Maintained across offseasons.

Why this file exists
--------------------
Projections join to players by name today, which is fuzzy. This table lets you
join by id instead, and gives you one place to reconcile RotoWire <-> Underdog
players. It is meant to be refreshed each offseason.

Refresh workflow (each offseason)
---------------------------------
  1. Save the current RotoWire "NFLceilfloor" feed to a file, e.g. feed.xml.
  2. Run:
       python tools/build_players_csv.py --feed feed.xml --out public/players.csv
     - Existing underdog_id values in players.csv are carried forward by
       nfl_news_id (so any ids you filled in by hand are preserved).
     - Players new to the feed appear with a blank underdog_id for you to fill.
     - Players no longer in the feed drop off (pass --keep-stale to retain them).

You can also seed / merge extra id mappings from other CSVs with --seed
(repeatable). A seed CSV just needs an id column (nfl_news_id / NFLNewsID) and an
underdog column (underdog_id / underdogid).

Roster source
-------------
--feed FILE      RotoWire feed XML (preferred; the live source of truth).
--names-csv FILE Fallback: a projections CSV with NFLNewsID + firstname/lastname
                 /position/team columns (used to bootstrap the first build).
"""

import argparse
import csv
import sys
import xml.etree.ElementTree as ET


def norm(s):
    return (s or "").strip()


def load_roster_from_feed(path):
    """Return {nfl_news_id: {first,last,position,team}} from a RotoWire feed XML."""
    tree = ET.parse(path)
    root = tree.getroot()
    roster = {}
    for player in root.iter("Player"):
        pid = norm(player.get("Id"))
        if not pid:
            continue
        first = norm(player.findtext("FirstName"))
        last = norm(player.findtext("LastName"))
        pos = norm(player.findtext("Position"))
        # Team = Code of the enclosing <Team>, empty for free agents. ElementTree
        # has no parent pointers, so we resolve team in a second pass below.
        roster[pid] = {"first": first, "last": last, "position": pos, "team": ""}

    # Second pass: assign team codes to players nested under <Team Code="…">.
    for team in root.iter("Team"):
        code = norm(team.get("Code"))
        for player in team.iter("Player"):
            pid = norm(player.get("Id"))
            if pid in roster:
                roster[pid]["team"] = code
    return roster


def load_roster_from_names_csv(path):
    """Bootstrap roster from a projections CSV (NFLNewsID + name columns)."""
    roster = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            pid = norm(row.get("NFLNewsID"))
            if not pid:
                continue
            team = norm(row.get("team"))
            if team == "NULL":
                team = ""
            if pid not in roster:
                roster[pid] = {
                    "first": norm(row.get("firstname")),
                    "last": norm(row.get("lastname")),
                    "position": norm(row.get("position")),
                    "team": team,
                }
            elif not roster[pid]["team"] and team:
                roster[pid]["team"] = team
    return roster


def load_id_map(path):
    """Return {nfl_news_id: underdog_id} from any CSV with recognizable columns."""
    out = {}
    try:
        f = open(path, newline="")
    except FileNotFoundError:
        return out
    with f:
        reader = csv.DictReader(f)
        cols = {c.lower(): c for c in (reader.fieldnames or [])}
        id_col = cols.get("nfl_news_id") or cols.get("nflnewsid")
        ud_col = cols.get("underdog_id") or cols.get("underdogid")
        if not id_col or not ud_col:
            return out
        for row in reader:
            pid = norm(row.get(id_col))
            uid = norm(row.get(ud_col))
            if pid and uid and uid != "NULL":
                out[pid] = uid
    return out


def main():
    ap = argparse.ArgumentParser(description="Build/refresh players.csv")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--feed", help="RotoWire feed XML file (roster source)")
    src.add_argument("--names-csv", help="Projections CSV with NFLNewsID + names")
    ap.add_argument("--seed", action="append", default=[],
                    help="CSV providing nfl_news_id->underdog_id (repeatable)")
    ap.add_argument("--out", default="public/players.csv", help="Output CSV path")
    ap.add_argument("--keep-stale", action="store_true",
                    help="Keep players from --out that are no longer in the roster")
    args = ap.parse_args()

    roster = (load_roster_from_feed(args.feed) if args.feed
              else load_roster_from_names_csv(args.names_csv))

    # Merge id mappings: seeds first (low precedence), then the existing output
    # file (so any hand-maintained underdog_id values win and persist).
    id_map = {}
    for seed in args.seed:
        id_map.update(load_id_map(seed))
    id_map.update(load_id_map(args.out))

    rows = []
    for pid, m in roster.items():
        rows.append({
            "nfl_news_id": pid,
            "first_name": m["first"],
            "last_name": m["last"],
            "position": m["position"],
            "team": m["team"],
            "underdog_id": id_map.get(pid, ""),
        })

    if args.keep_stale:
        # Carry forward players present in --out but absent from the new roster.
        existing = load_id_map(args.out)
        seen = set(roster)
        for pid, uid in existing.items():
            if pid not in seen:
                rows.append({"nfl_news_id": pid, "first_name": "", "last_name": "",
                             "position": "", "team": "", "underdog_id": uid})

    rows.sort(key=lambda r: (r["position"], r["last_name"].lower(), r["first_name"].lower()))

    fields = ["nfl_news_id", "first_name", "last_name", "position", "team", "underdog_id"]
    with open(args.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    filled = sum(1 for r in rows if r["underdog_id"])
    print(f"Wrote {len(rows)} players to {args.out}", file=sys.stderr)
    print(f"  with underdog_id: {filled}", file=sys.stderr)
    print(f"  missing underdog_id: {len(rows) - filled}", file=sys.stderr)


if __name__ == "__main__":
    main()
