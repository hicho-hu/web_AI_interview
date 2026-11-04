"""Read report metadata and scoring availability; never print answers, resumes, or secrets."""
import argparse
import json
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("backend", type=Path)
    args = parser.parse_args()
    sys.path.insert(0, str(args.backend))
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.core.config import Settings
    from app.core.security import Security
    from app.db.models import AICallLog, Interview, Report, Turn
    settings = Settings(_env_file=args.backend / ".env")
    security = Security(settings)
    engine = create_engine(settings.database_url)
    with Session(engine) as db:
        reports = db.scalars(select(Report).order_by(Report.created_at.desc()).limit(6)).all()
        output = []
        for report in reports:
            content = json.loads(security.decrypt(report.content_encrypted))
            interview = db.get(Interview, report.interview_id)
            turns = db.scalars(select(Turn).where(Turn.interview_id == report.interview_id)).all()
            calls = db.scalars(select(AICallLog).where(AICallLog.interview_id == report.interview_id, AICallLog.call_type == "report").order_by(AICallLog.created_at.desc()).limit(2)).all()
            output.append({"interview_id": report.interview_id, "created_at": str(report.created_at), "report_version": report.report_version,
                "report_model": report.model_name, "mode": interview.mode, "status": interview.status,
                "scored_dimensions": sum(d.get("score") is not None for d in content.get("dimensions", [])),
                "dimension_evidence_counts": [len(d.get("evidence", [])) for d in content.get("dimensions", [])],
                "dimension_feedback": [d.get("feedback", "")[:160] for d in content.get("dimensions", [])],
                "answers": [{"status": turn.status, "characters": len(security.decrypt(turn.transcript_encrypted)), "confidence": turn.confidence} for turn in turns],
                "report_calls": [{"provider": call.provider, "model": call.model, "status": call.status} for call in calls]})
    engine.dispose()
    print(json.dumps({"configured_provider": settings.provider_mode, "configured_model": settings.provider_model, "reports": output}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": type(error).__name__, "message": "Report metadata diagnostic failed"}))
        sys.exit(1)
