// Thin wrapper around the OS keyring. Tests use an in-memory
// backend so they don't pollute the host's actual keychain.

use anyhow::{Context, Result};

const SERVICE: &str = "com.purroxy.desktop";

pub trait Keystore: Send + Sync {
    fn set(&self, key: &str, value: &[u8]) -> Result<()>;
    fn get(&self, key: &str) -> Result<Option<Vec<u8>>>;
    fn delete(&self, key: &str) -> Result<()>;
}

pub struct OsKeystore;

impl Keystore for OsKeystore {
    fn set(&self, key: &str, value: &[u8]) -> Result<()> {
        let entry = keyring::Entry::new(SERVICE, key)
            .with_context(|| format!("opening keychain entry {key}"))?;
        // keyring stores secret-bytes via set_secret in v3
        entry
            .set_secret(value)
            .with_context(|| format!("writing {key}"))?;
        Ok(())
    }

    fn get(&self, key: &str) -> Result<Option<Vec<u8>>> {
        let entry = keyring::Entry::new(SERVICE, key)
            .with_context(|| format!("opening keychain entry {key}"))?;
        match entry.get_secret() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(anyhow::anyhow!("reading {key}: {e}")),
        }
    }

    fn delete(&self, key: &str) -> Result<()> {
        let entry = keyring::Entry::new(SERVICE, key)
            .with_context(|| format!("opening keychain entry {key}"))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(anyhow::anyhow!("deleting {key}: {e}")),
        }
    }
}

// In-memory keystore. Unit tests and integration tests use this so
// they never touch the host's actual keychain.
#[derive(Default, Clone)]
pub struct MemoryKeystore {
    inner: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, Vec<u8>>>>,
}

impl MemoryKeystore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl Keystore for MemoryKeystore {
    fn set(&self, key: &str, value: &[u8]) -> Result<()> {
        self.inner.lock().unwrap().insert(key.into(), value.into());
        Ok(())
    }

    fn get(&self, key: &str) -> Result<Option<Vec<u8>>> {
        Ok(self.inner.lock().unwrap().get(key).cloned())
    }

    fn delete(&self, key: &str) -> Result<()> {
        self.inner.lock().unwrap().remove(key);
        Ok(())
    }
}
