"""
Risk Engine Module.
Orchestrates the fusion of Rule-based enforcement and ML-based refinement.
"""
from .rules import calculate_base_score
from .model import RiskClassifier

class RiskEngine:
    def __init__(self):
        self.classifier = RiskClassifier()
        # Ensure model is ready
        self.classifier.load()

    def assess_risk(self, findings):
        """
        Process a list of findings and attach risk assessments.
        """
        for finding in findings:
            # 1. Rule Entry
            rule_score, rule_severity, rule_factors = calculate_base_score(finding)
            
            # 2. ML Entry
            ml_score, ml_severity, ml_top_features = self.classifier.predict(finding)
            
            # 3. Fusion Logic
            # Balance ML and Rules evenly (50/50).
            
            weighted_score = (rule_score * 0.5) + (ml_score * 0.5)
            
            # Safety checks: Priority is to not miss high-value secrets.
            # If rules found something very dangerous, don't let ML drag it down.
            if rule_score >= 80:
                final_score = max(weighted_score, 80)
            elif rule_score >= 60:
                final_score = max(weighted_score, 60)
            else:
                final_score = max(weighted_score, rule_score)
                
            # Cap at 100
            final_score = min(100, int(final_score))
            
            # Severity Hierarchy
            if final_score >= 70:
                final_severity = "High"
            elif final_score >= 40:
                final_severity = "Medium"
            else:
                final_severity = "Low"
            
            # Add ML factors for explainability
            if final_score != rule_score:
                diff = final_score - rule_score
                direction = "+" if diff > 0 else ""
                rule_factors.append(f"ML Model adjusted risk ({direction}{int(diff)})")
            
            # 4. Attach Result
            finding["risk"] = {
                "score": final_score,
                "severity": final_severity,
                "factors": rule_factors,
                "ml_analysis": {
                    "predicted_severity": ml_severity,
                    "confidence_score": int(ml_score),
                    "model_used": "RandomForestClassifier (En200)",
                    "top_features": ml_top_features
                }
            }
            
        return findings

# Singleton instance for easy import
risk_engine = RiskEngine()
