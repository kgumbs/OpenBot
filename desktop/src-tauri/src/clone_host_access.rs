//! Opt-in native folder approvals for an already-running local source deployment.
//! The launcher supplies an ephemeral token to both processes. No grant is automatic.
use openbot_desktop_lib::{engine, host_access};
use tauri::Manager;

pub fn attach(app: &tauri::AppHandle) -> Result<Option<host_access::HostAccess>, Box<dyn std::error::Error>> {
    let Ok(raw) = std::env::var("OPENBOT_CLONE_HOST_URL") else {
        return Ok(None);
    };
    let url = reqwest::Url::parse(&raw)?;
    if url.scheme() != "http" || url.host_str() != Some("127.0.0.1")
        || !url.username().is_empty() || url.password().is_some()
        || url.path() != "/" || url.query().is_some() || url.fragment().is_some()
    {
        return Err("Clone host access requires an HTTP origin on 127.0.0.1".into());
    }
    let token = std::env::var("OPENBOT_DESKTOP_HOST_TOKEN")?;
    let root = std::path::PathBuf::from(std::env::var("OPENBOT_CLONE_ROOT")?).canonicalize()?;
    let config = host_access::HostAccessConfig::new(
        url.to_string(), token,
        engine::Address::new(engine::Engine::Docker, None),
        "openbot-agent-computer:latest", vec![root],
    );
    let broker = host_access::HostAccess::start_with_approval(
        config, std::sync::Arc::new(crate::desktop_host_access::NativeApproval(app.clone())),
    )?;
    if let Some(window) = app.get_webview_window("main") {
        let page = reqwest::Url::parse(&std::env::var("OPENBOT_CLONE_APP_URL")?)?;
        if page.scheme() != "http" || page.host_str() != Some("127.0.0.1")
            || !page.username().is_empty() || page.password().is_some()
        {
            return Err("Clone app must be on HTTP 127.0.0.1".into());
        }
        window.navigate(page)?;
    }
    Ok(Some(broker))
}
