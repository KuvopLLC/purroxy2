// Replay engine. Reads a recording manifest, instantiates the named
// WASM capability component in a fresh wasmtime Store with budgets,
// drives the browser through each step, and produces a run record.
//
// Phase 3 scope: iterate steps, capture before/after snapshots, call
// preflight/postflight, call extract/redact at the end. Action
// execution (clicks/input/nav) and repair flow are stubbed so the
// integration shape can be validated end to end before adding
// CDP-action plumbing in followups.

use anyhow::{Context, Result};
use chromiumoxide::{Browser, BrowserConfig};
use futures::StreamExt;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use wasmtime::component::{Component, Linker, Resource, ResourceTable};
use wasmtime::{Config, Engine, Store};
use wasmtime_wasi::{WasiCtx, WasiCtxBuilder, WasiView};

use recorder::types::{ActionKind, RecordingManifest};

use crate::run_record::{ExportOutcome, RunOutcome, RunRecord, StepOutcome};

wasmtime::component::bindgen!({
    world: "capability",
    path: "../reference-capability/wit/world.wit",
    with: {
        "purroxy:capability/types/page-snapshot": SnapshotState,
    },
});

use purroxy::capability::types::{Host as TypesHost, HostPageSnapshot};

#[derive(Clone)]
pub struct SnapshotState {
    url: String,
    title: String,
    viewport: (u32, u32),
}

impl SnapshotState {
    fn from_recorder(s: &recorder::types::PageSnapshot) -> Self {
        SnapshotState {
            url: s.url.clone(),
            title: s.title.clone(),
            viewport: s.viewport,
        }
    }
}

struct HostState {
    table: ResourceTable,
    wasi: WasiCtx,
    log_buf: Vec<String>,
    monotonic_origin: Instant,
}

impl HostState {
    fn new() -> Self {
        HostState {
            table: ResourceTable::new(),
            wasi: WasiCtxBuilder::new().build(),
            log_buf: Vec::new(),
            monotonic_origin: Instant::now(),
        }
    }
}

impl WasiView for HostState {
    fn ctx(&mut self) -> &mut WasiCtx {
        &mut self.wasi
    }
    fn table(&mut self) -> &mut ResourceTable {
        &mut self.table
    }
}

impl HostPageSnapshot for HostState {
    fn url(&mut self, this: Resource<SnapshotState>) -> String {
        self.table.get(&this).unwrap().url.clone()
    }
    fn title(&mut self, this: Resource<SnapshotState>) -> String {
        self.table.get(&this).unwrap().title.clone()
    }
    fn viewport_width(&mut self, this: Resource<SnapshotState>) -> u32 {
        self.table.get(&this).unwrap().viewport.0
    }
    fn viewport_height(&mut self, this: Resource<SnapshotState>) -> u32 {
        self.table.get(&this).unwrap().viewport.1
    }
    fn root_handle(&mut self, _this: Resource<SnapshotState>) -> ElementHandle {
        ElementHandle { id: 0 }
    }
    fn drop(&mut self, rep: Resource<SnapshotState>) -> wasmtime::Result<()> {
        self.table.delete(rep)?;
        Ok(())
    }
}

impl TypesHost for HostState {}

impl purroxy::capability::dom_shape::Host for HostState {
    fn find_by_role(&mut self, _: Resource<SnapshotState>, _: String) -> Vec<ElementHandle> { vec![] }
    fn find_by_name_pattern(&mut self, _: Resource<SnapshotState>, _: String) -> Vec<ElementHandle> { vec![] }
    fn find_by_text_contains(&mut self, _: Resource<SnapshotState>, _: String) -> Vec<ElementHandle> { vec![] }
    fn role_of(&mut self, _: Resource<SnapshotState>, _: ElementHandle) -> Option<String> { None }
    fn name_of(&mut self, _: Resource<SnapshotState>, _: ElementHandle) -> Option<String> { None }
    fn text_of(&mut self, _: Resource<SnapshotState>, _: ElementHandle) -> Option<String> { None }
    fn value_of(&mut self, _: Resource<SnapshotState>, _: ElementHandle) -> Option<String> { None }
    fn attribute_of(&mut self, _: Resource<SnapshotState>, _: ElementHandle, _: String) -> Option<String> { None }
    fn attributes_of(&mut self, _: Resource<SnapshotState>, _: ElementHandle) -> Vec<(String, String)> { vec![] }
    fn parent_of(&mut self, _: Resource<SnapshotState>, _: ElementHandle) -> Option<ElementHandle> { None }
    fn children_of(&mut self, _: Resource<SnapshotState>, _: ElementHandle) -> Vec<ElementHandle> { vec![] }
    fn ancestors_of(&mut self, _: Resource<SnapshotState>, _: ElementHandle) -> Vec<ElementHandle> { vec![] }
}

impl purroxy::capability::regex::Host for HostState {
    fn is_match(&mut self, _: String, _: String) -> Result<bool, purroxy::capability::regex::RegexError> { Ok(false) }
    fn find_first(&mut self, _: String, _: String) -> Result<Option<purroxy::capability::regex::MatchInfo>, purroxy::capability::regex::RegexError> { Ok(None) }
    fn find_all(&mut self, _: String, _: String) -> Result<Vec<purroxy::capability::regex::MatchInfo>, purroxy::capability::regex::RegexError> { Ok(vec![]) }
}

impl purroxy::capability::logging::Host for HostState {
    fn log(&mut self, lvl: purroxy::capability::logging::Level, message: String, kv: Vec<(String, String)>) {
        self.log_buf.push(format!("[{:?}] {} {:?}", lvl, message, kv));
    }
}

impl purroxy::capability::clock::Host for HostState {
    fn monotonic_now_ms(&mut self) -> u64 {
        self.monotonic_origin.elapsed().as_millis() as u64
    }
}

pub struct ReplayOptions {
    pub recording_dir: PathBuf,
    pub component_path: PathBuf,
    pub headless: bool,
    pub run_record_path: Option<PathBuf>,
}

pub async fn replay(opts: ReplayOptions) -> Result<RunRecord> {
    let manifest_path = opts.recording_dir.join("manifest.json");
    let raw = std::fs::read_to_string(&manifest_path)
        .with_context(|| format!("reading {}", manifest_path.display()))?;
    let manifest: RecordingManifest = serde_json::from_str(&raw)?;

    let (mut store, bindings) = init_component(&opts.component_path)?;

    // 1. validate-params (no params for the reference flow).
    use purroxy::capability::types::ParamSet;
    let _ = bindings
        .call_validate_params(&mut store, &ParamSet { entries: vec![] })?
        .map_err(|e| anyhow::anyhow!("validate-params rejected: {e:?}"))?;

    // 2. launch browser, navigate to start.
    let chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    let mut cfg = BrowserConfig::builder().chrome_executable(chrome_path);
    if opts.headless {
        // builder default is headless
    } else {
        cfg = cfg.with_head();
    }
    let (mut browser, mut handler) = Browser::launch(
        cfg.build()
            .map_err(|e| anyhow::anyhow!("browser config: {e}"))?,
    )
    .await?;
    let handler_task = tokio::task::spawn(async move {
        while handler.next().await.is_some() {}
    });
    let page = browser.new_page(&manifest.target_site).await?;

    let started_at_ms = epoch_ms();
    let mut step_outcomes: Vec<StepOutcome> = Vec::new();
    let mut outcome = RunOutcome::Success;

    // 3. iterate steps.
    for step in &manifest.steps {
        let live_before = recorder::snapshot::capture_snapshot(&page).await?;
        let before_res = store
            .data_mut()
            .table
            .push(SnapshotState::from_recorder(&live_before))?;
        let pre = match bindings.call_preflight(&mut store, &step.id, before_res)? {
            Ok(()) => ExportOutcome::Ok,
            Err(e) => ExportOutcome::Err {
                code: format!("{:?}", std::mem::discriminant(&e)),
                message: format!("{:?}", e),
            },
        };
        if matches!(pre, ExportOutcome::Err { .. }) {
            step_outcomes.push(StepOutcome {
                step_id: step.id.clone(),
                preflight: pre,
                postflight: ExportOutcome::Skipped,
                repaired: false,
                action_executed: false,
            });
            outcome = RunOutcome::NeedsReview {
                reason: "preflight failed".into(),
                step_id: step.id.clone(),
            };
            break;
        }

        // 4. execute action.
        // Phase 3 spike: only Navigate is fully implemented. Click
        // and Input are recorded but their CDP execution lands in
        // followups (need element-handle resolution against the live
        // page from intent fields).
        let action_executed = match &step.action {
            ActionKind::Navigate { url } => {
                page.goto(url).await.ok().is_some()
            }
            _ => false,
        };

        // wait for the page to settle.
        tokio::time::sleep(std::time::Duration::from_millis(400)).await;

        // 5. postflight.
        let live_after = recorder::snapshot::capture_snapshot(&page).await?;
        let before_res = store
            .data_mut()
            .table
            .push(SnapshotState::from_recorder(&live_before))?;
        let after_res = store
            .data_mut()
            .table
            .push(SnapshotState::from_recorder(&live_after))?;
        let post = match bindings.call_postflight(&mut store, &step.id, before_res, after_res)? {
            Ok(()) => ExportOutcome::Ok,
            Err(e) => ExportOutcome::Err {
                code: format!("{:?}", std::mem::discriminant(&e)),
                message: format!("{:?}", e),
            },
        };
        let post_failed = matches!(post, ExportOutcome::Err { .. });
        step_outcomes.push(StepOutcome {
            step_id: step.id.clone(),
            preflight: pre,
            postflight: post,
            repaired: false,
            action_executed,
        });
        if post_failed {
            outcome = RunOutcome::NeedsReview {
                reason: "postflight failed".into(),
                step_id: step.id.clone(),
            };
            break;
        }
    }

    // 6. extract + redact, only on success.
    let final_output = if matches!(outcome, RunOutcome::Success) {
        let live = recorder::snapshot::capture_snapshot(&page).await?;
        let res = store
            .data_mut()
            .table
            .push(SnapshotState::from_recorder(&live))?;
        match bindings.call_extract(&mut store, res)? {
            Ok(out) => {
                let redacted = bindings.call_redact(&mut store, &out)?;
                Some(serde_json::to_string(&output_to_json(&redacted))?)
            }
            Err(e) => {
                outcome = RunOutcome::Aborted {
                    reason: format!("extract failed: {:?}", e),
                };
                None
            }
        }
    } else {
        None
    };

    let _ = browser.close().await;
    let _ = browser.wait().await;
    handler_task.abort();

    let ended_at_ms = epoch_ms();
    let record = RunRecord {
        run_id: format!("run-{:x}", started_at_ms),
        recording_id: manifest.recording_id.clone(),
        started_at_ms,
        ended_at_ms,
        outcome,
        steps: step_outcomes,
        final_output,
        fuel_consumed: 0,
    };

    if let Some(path) = &opts.run_record_path {
        let json = serde_json::to_string_pretty(&record)?;
        std::fs::write(path, json)?;
    }

    Ok(record)
}

fn init_component(path: &Path) -> Result<(Store<HostState>, Capability)> {
    let mut config = Config::new();
    config.wasm_component_model(true);
    let engine = Engine::new(&config)?;

    let component = Component::from_file(&engine, path)
        .with_context(|| format!("loading {}", path.display()))?;

    let mut linker = Linker::<HostState>::new(&engine);
    wasmtime_wasi::add_to_linker_sync(&mut linker)?;
    Capability::add_to_linker(&mut linker, |s: &mut HostState| s)?;

    let mut store = Store::new(&engine, HostState::new());
    let bindings = Capability::instantiate(&mut store, &component, &linker)?;
    Ok((store, bindings))
}

fn output_to_json(o: &purroxy::capability::types::Output) -> serde_json::Value {
    let entries: Vec<serde_json::Value> = o
        .fields
        .iter()
        .map(|f| {
            serde_json::json!({
                "name": f.name,
                "sensitive": f.sensitive,
                "value": param_value_to_json(&f.value),
            })
        })
        .collect();
    serde_json::json!({ "fields": entries })
}

fn param_value_to_json(v: &purroxy::capability::types::ParamValue) -> serde_json::Value {
    use purroxy::capability::types::ParamValue::*;
    match v {
        StringVal(s) => serde_json::Value::String(s.clone()),
        S64Val(n) => serde_json::Value::from(*n),
        F64Val(n) => serde_json::Value::from(*n),
        BoolVal(b) => serde_json::Value::Bool(*b),
        None => serde_json::Value::Null,
    }
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}
