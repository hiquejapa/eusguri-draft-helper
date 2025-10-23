import os, argparse, sys, json, pathlib
from dotenv import load_dotenv

def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description="É us guri — Draft Helper (CLI)")
    parser.add_argument("--riot-api-key", default=os.getenv("RIOT_API_KEY"))
    parser.add_argument("--regions", default=os.getenv("REGIONS", "br1"))
    parser.add_argument("--window-days", type=int, default=int(os.getenv("WINDOW_DAYS", "30")))
    parser.add_argument("--output", default=os.getenv("OUTPUT_DIR", "out"))
    args = parser.parse_args()

    if not args.riot_api_key or args.riot_api_key == "YOUR_RIOT_API_KEY_HERE":
        print("ERROR: Set RIOT_API_KEY via --riot-api-key or .env", file=sys.stderr)
        sys.exit(1)

    pathlib.Path(args.output).mkdir(parents=True, exist_ok=True)

    # Placeholder: here you'd call your real collectors/calculators
    demo = {
        "status": "ok",
        "regions": [r.strip() for r in args.regions.split(",") if r.strip()],
        "window_days": args.window_days,
        "outputs": {
            "synergy": f"{args.output}/synergy.csv",
            "matchups": f"{args.output}/matchups.csv",
            "recs": f"{args.output}/recs.csv",
        }
    }
    print(json.dumps(demo, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
