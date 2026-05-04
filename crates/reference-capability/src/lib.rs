// Reference capability for the purroxy:capability/v1 contract.
// Implements every export with minimal but type-correct behavior so
// the contract test suite can exercise the full integration path
// (load -> metadata -> validate-params -> preflight -> postflight ->
// score-repair-candidates -> extract -> redact).
//
// Not a useful capability: it claims to operate on a single fake
// site, accepts any params, and extracts a one-field output.

#[allow(warnings)]
mod bindings;

use bindings::purroxy::capability::types::{
    CapabilityMetadata, ElementHandle, ExtractError, Output, OutputField, OutputSchemaField,
    ParamSchemaField, ParamSet, ParamValue, PostflightError, PreflightError, ResourceBudget,
    ScoredCandidate, StepIntent, ValidationError, ValueKind,
};
use bindings::{Guest, PageSnapshot};

struct Component;

impl Guest for Component {
    fn metadata() -> CapabilityMetadata {
        CapabilityMetadata {
            name: "reference-capability".into(),
            description: "Contract reference; not a useful capability.".into(),
            target_site_pattern: "https://example.com/*".into(),
            parameter_schema: vec![ParamSchemaField {
                name: "query".into(),
                kind: ValueKind::StringKind,
                required: false,
                description: "Optional search string.".into(),
            }],
            output_schema: vec![OutputSchemaField {
                name: "title".into(),
                kind: ValueKind::StringKind,
                sensitive: false,
                description: "Page title at extract time.".into(),
            }],
            vault_references: vec![],
            budget: ResourceBudget {
                max_memory_bytes: 16 * 1024 * 1024,
                max_fuel: 10_000_000,
                max_wall_clock_ms: 5_000,
            },
            target_wit_version: "purroxy:capability@1.0.0".into(),
        }
    }

    fn validate_params(p: ParamSet) -> Result<ParamSet, ValidationError> {
        Ok(p)
    }

    fn preflight(_step_id: String, _page: &PageSnapshot) -> Result<(), PreflightError> {
        Ok(())
    }

    fn postflight(
        _step_id: String,
        _before: &PageSnapshot,
        _after: &PageSnapshot,
    ) -> Result<(), PostflightError> {
        Ok(())
    }

    fn score_repair_candidates(
        _step_id: String,
        _intent: StepIntent,
        candidates: Vec<ElementHandle>,
        _page: &PageSnapshot,
    ) -> Vec<ScoredCandidate> {
        // Reference scorer: linearly decreasing confidence by index.
        candidates
            .into_iter()
            .enumerate()
            .map(|(i, h)| ScoredCandidate {
                handle: h,
                score: (1.0_f64 - (i as f64) * 0.1).max(0.0),
                reason: format!("reference scorer position {i}"),
            })
            .collect()
    }

    fn extract(page: &PageSnapshot) -> Result<Output, ExtractError> {
        Ok(Output {
            fields: vec![OutputField {
                name: "title".into(),
                value: ParamValue::StringVal(page.title()),
                sensitive: false,
            }],
        })
    }

    fn redact(o: Output) -> Output {
        let fields = o
            .fields
            .into_iter()
            .map(|f| {
                if f.sensitive {
                    OutputField {
                        name: f.name,
                        value: ParamValue::None,
                        sensitive: true,
                    }
                } else {
                    f
                }
            })
            .collect();
        Output { fields }
    }
}

bindings::export!(Component with_types_in bindings);
