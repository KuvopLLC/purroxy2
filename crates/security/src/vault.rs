// Encrypted vault for sensitive non-credential data (PRD §7.6, §9.2).
//
// On-disk format:
//   [12 bytes nonce][ciphertext+16-byte tag (XChaCha20-Poly1305)]
//
// Wait — this module uses ChaCha20-Poly1305 (96-bit nonce) for the
// chacha20poly1305 crate's AEAD. For each encryption a fresh
// nonce is generated; the same encryption key (32 bytes) lives in
// the OS keychain. Decryption reverses the format.

use anyhow::{Context, Result};
use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng as AeadRng},
    ChaCha20Poly1305, Key, Nonce,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

use crate::keychain::Keystore;

const ENCRYPTION_KEY_NAME: &str = "vault-encryption-key-v1";

#[derive(Debug)]
pub enum VaultError {
    EntryNotFound,
    KeyMissing,
    DecryptionFailed,
    InvalidName,
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VaultError::EntryNotFound => write!(f, "vault entry not found"),
            VaultError::KeyMissing => write!(f, "vault encryption key missing"),
            VaultError::DecryptionFailed => write!(f, "vault decryption failed"),
            VaultError::InvalidName => write!(f, "invalid vault entry name"),
        }
    }
}

impl std::error::Error for VaultError {}

#[derive(Serialize, Deserialize)]
struct VaultEntry {
    /// nonce (12 bytes) || ciphertext (... + 16-byte tag)
    blob: Vec<u8>,
}

#[derive(Default, Serialize, Deserialize)]
struct VaultBlob {
    entries: std::collections::BTreeMap<String, VaultEntry>,
}

pub struct Vault<'a, K: Keystore> {
    store: &'a K,
    storage_path: std::path::PathBuf,
}

impl<'a, K: Keystore> Vault<'a, K> {
    pub fn new(store: &'a K, storage_path: impl Into<std::path::PathBuf>) -> Self {
        Vault {
            store,
            storage_path: storage_path.into(),
        }
    }

    fn key(&self) -> Result<Key> {
        if let Some(bytes) = self.store.get(ENCRYPTION_KEY_NAME)? {
            if bytes.len() == 32 {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                let k = Key::clone_from_slice(&arr);
                arr.zeroize();
                return Ok(k);
            }
        }
        let mut arr = [0u8; 32];
        AeadRng.fill_bytes(&mut arr);
        self.store
            .set(ENCRYPTION_KEY_NAME, &arr)
            .context("persisting fresh vault key")?;
        let k = Key::clone_from_slice(&arr);
        arr.zeroize();
        Ok(k)
    }

    fn read_blob(&self) -> Result<VaultBlob> {
        if !self.storage_path.exists() {
            return Ok(VaultBlob::default());
        }
        let raw = std::fs::read(&self.storage_path)
            .with_context(|| format!("reading {}", self.storage_path.display()))?;
        if raw.is_empty() {
            return Ok(VaultBlob::default());
        }
        Ok(serde_json::from_slice(&raw).context("parsing vault blob")?)
    }

    fn write_blob(&self, b: &VaultBlob) -> Result<()> {
        if let Some(parent) = self.storage_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let json = serde_json::to_vec(b)?;
        std::fs::write(&self.storage_path, json)
            .with_context(|| format!("writing {}", self.storage_path.display()))?;
        Ok(())
    }

    pub fn put(&self, name: &str, value: &str) -> Result<()> {
        if name.is_empty() || name.contains('\0') {
            return Err(VaultError::InvalidName.into());
        }
        let key = self.key()?;
        let cipher = ChaCha20Poly1305::new(&key);
        let mut nonce_bytes = [0u8; 12];
        AeadRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ct = cipher
            .encrypt(nonce, value.as_bytes())
            .map_err(|_| VaultError::DecryptionFailed)?;
        let mut blob = nonce_bytes.to_vec();
        blob.extend_from_slice(&ct);

        let mut all = self.read_blob()?;
        all.entries.insert(name.into(), VaultEntry { blob });
        self.write_blob(&all)?;
        Ok(())
    }

    pub fn get(&self, name: &str) -> Result<String> {
        let all = self.read_blob()?;
        let entry = all.entries.get(name).ok_or(VaultError::EntryNotFound)?;
        if entry.blob.len() < 12 {
            return Err(VaultError::DecryptionFailed.into());
        }
        let key = self.key()?;
        let cipher = ChaCha20Poly1305::new(&key);
        let nonce = Nonce::from_slice(&entry.blob[..12]);
        let plain = cipher
            .decrypt(nonce, &entry.blob[12..])
            .map_err(|_| VaultError::DecryptionFailed)?;
        Ok(String::from_utf8(plain).context("vault plaintext was not utf-8")?)
    }

    pub fn delete(&self, name: &str) -> Result<()> {
        let mut all = self.read_blob()?;
        all.entries.remove(name);
        self.write_blob(&all)?;
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<String>> {
        Ok(self.read_blob()?.entries.keys().cloned().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keychain::MemoryKeystore;

    fn tmp_path(name: &str) -> std::path::PathBuf {
        let mut p = std::env::temp_dir();
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        p.push(format!("purroxy-vault-test-{name}-{nonce:x}.json"));
        p
    }

    #[test]
    fn round_trips_a_value() {
        let store = MemoryKeystore::new();
        let path = tmp_path("round-trip");
        let v = Vault::new(&store, &path);
        v.put("ssn", "123-45-6789").unwrap();
        assert_eq!(v.get("ssn").unwrap(), "123-45-6789");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn missing_entry_returns_error() {
        let store = MemoryKeystore::new();
        let path = tmp_path("missing");
        let v = Vault::new(&store, &path);
        let r = v.get("not-there");
        assert!(r.is_err());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn delete_removes_entry() {
        let store = MemoryKeystore::new();
        let path = tmp_path("delete");
        let v = Vault::new(&store, &path);
        v.put("k", "v").unwrap();
        assert!(v.list().unwrap().contains(&"k".to_string()));
        v.delete("k").unwrap();
        assert!(!v.list().unwrap().contains(&"k".to_string()));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn list_returns_sorted_names() {
        let store = MemoryKeystore::new();
        let path = tmp_path("list");
        let v = Vault::new(&store, &path);
        v.put("b", "1").unwrap();
        v.put("a", "2").unwrap();
        v.put("c", "3").unwrap();
        assert_eq!(v.list().unwrap(), vec!["a", "b", "c"]);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn rejects_empty_or_null_name() {
        let store = MemoryKeystore::new();
        let path = tmp_path("invalid");
        let v = Vault::new(&store, &path);
        assert!(v.put("", "x").is_err());
        assert!(v.put("a\0b", "x").is_err());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn ciphertext_differs_each_put_due_to_nonce() {
        let store = MemoryKeystore::new();
        let path1 = tmp_path("nonce1");
        let path2 = tmp_path("nonce2");
        let v1 = Vault::new(&store, &path1);
        v1.put("k", "same-value").unwrap();
        let v2 = Vault::new(&store, &path2);
        v2.put("k", "same-value").unwrap();
        let raw1 = std::fs::read(&path1).unwrap();
        let raw2 = std::fs::read(&path2).unwrap();
        assert_ne!(raw1, raw2, "nonce must vary per encryption");
        let _ = std::fs::remove_file(&path1);
        let _ = std::fs::remove_file(&path2);
    }
}
