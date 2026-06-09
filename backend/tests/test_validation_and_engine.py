from app.domain.simulation.engine import SimulationEngine
from app.schemas.scura_dataset import ScuraDataset, SimulationConfig
from app.services.validation_service import ValidationService


def sample_dataset() -> dict:
    return {
        "schema_version": "0.3.0",
        "project": {"name": "Test Project"},
        "scenario": {"name": "Baseline"},
        "schedule": {
            "activities": [
                {"activity_id": "A100", "name": "Design", "baseline_duration_days": 10, "remaining_duration_days": 10, "calendar_id": "standard_5_day", "status": "not_started"},
                {"activity_id": "A200", "name": "Build", "baseline_duration_days": 20, "remaining_duration_days": 20, "calendar_id": "standard_5_day", "status": "not_started"},
            ],
            "relationships": [
                {"relationship_id": "R1", "predecessor_activity_id": "A100", "successor_activity_id": "A200", "relationship_type": "FS", "lag_days": 0}
            ],
            "duration_uncertainties": [
                {"activity_id": "A100", "distribution": "triangular", "minimum": 8, "most_likely": 10, "maximum": 15},
                {"activity_id": "A200", "distribution": "triangular", "minimum": 18, "most_likely": 22, "maximum": 30},
            ],
            "calendars": [{"calendar_id": "standard_5_day", "name": "Standard", "workdays_per_week": 5}],
            "milestones": [{"milestone_id": "M1", "name": "Complete", "activity_id": "A200", "target_day": 45}],
        },
        "cost": {
            "cost_items": [
                {"cost_id": "C100", "description": "Labor", "baseline_cost": 1000, "cost_type": "duration_dependent", "currency": "USD"},
                {"cost_id": "C200", "description": "PM", "baseline_cost": 100, "cost_type": "monthly_burn", "currency": "USD"},
            ],
            "cost_uncertainties": [{"cost_id": "C100", "distribution": "triangular", "minimum": 900, "most_likely": 1000, "maximum": 1400}],
            "cost_schedule_mappings": [{"mapping_id": "M1", "cost_id": "C100", "activity_id": "A200", "behavior": "scale_with_duration"}],
        },
        "risks": {
            "risk_events": [{"risk_id": "K1", "name": "Supplier delay", "probability": 0.25, "status": "active"}],
            "risk_impacts": [{"impact_id": "I1", "risk_id": "K1", "activity_id": "A200", "cost_id": "C100", "schedule_impact": {"distribution": "triangular", "minimum": 1, "most_likely": 3, "maximum": 5}, "cost_impact": {"distribution": "triangular", "minimum": 100, "most_likely": 200, "maximum": 400}}],
        },
        "correlations": [],
        "assumptions": [],
    }


def test_sample_dataset_validates():
    response = ValidationService().validate_dataset_payload(sample_dataset())
    assert response.valid, response.issues


def test_engine_returns_summary():
    dataset = ScuraDataset.model_validate(sample_dataset())
    config = SimulationConfig(scenario_id="test", run_name="Unit Test", iterations=50, random_seed=123, target_duration_days=45, target_budget=5000)
    result = SimulationEngine().run(dataset, config)
    assert result["summary"]["iterations"] == 50
    assert "p80" in result["summary"]["duration_percentiles"]
    assert "p80" in result["summary"]["cost_percentiles"]
