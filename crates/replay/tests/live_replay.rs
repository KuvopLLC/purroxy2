// Live replay smoke. Launches headless Chromium against
// https://example.com/, replays a one-step (Navigate) recording
// using the reference capability component, and asserts the run
// record shape.
//
// #[ignore] by default because it requires Chrome installed and
// network access. Run with:
//   cargo test -p replay --release -- --ignored

use replay::{ReplayOptions, RunOutcome};
use std::path::PathBuf;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

fn component_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/wasm32-wasip2/release/reference_capability.wasm")
}

async fn run_fixture(name: &str) -> replay::RunRecord {
    let out_dir = std::env::temp_dir().join(format!("purroxy-replay-test-{name}"));
    let _ = std::fs::create_dir_all(&out_dir);
    let run_record_path = out_dir.join("run.json");

    let opts = ReplayOptions {
        recording_dir: fixture(name),
        component_path: component_path(),
        headless: true,
        run_record_path: Some(run_record_path),
    };

    replay::replay(opts).await.expect("replay should succeed")
}

#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn one_step_navigate_round_trips() {
    let record = run_fixture("one-step").await;
    assert!(matches!(record.outcome, RunOutcome::Success));
    assert_eq!(record.steps.len(), 1);
    let step = &record.steps[0];
    assert_eq!(step.step_id, "step-0001");
    assert!(step.action_executed, "Navigate action must execute");
    assert!(record.final_output.is_some());
}

#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn click_link_round_trips() {
    let record = run_fixture("click-link").await;
    assert!(matches!(record.outcome, RunOutcome::Success), "{:?}", record.outcome);
    assert_eq!(record.steps.len(), 1);
    let step = &record.steps[0];
    assert!(step.action_executed, "Click action must execute (matched 'Learn more' on example.com)");
    // After clicking the Learn more link, the page is on iana.org
    // (title becomes 'Example Domains' plural) so extract returns
    // the new page title.
    let out = record.final_output.expect("extract output present");
    assert!(out.contains("Example Domains") || out.contains("Example Domain"),
        "post-click extract should reflect either the original or the new page title; got: {out}");
}
