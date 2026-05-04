// Purroxy security primitives.
//
// Companion to PRD v2.0 §7.6 (vault), §7.7 (app lock), §9 (security
// requirements), §10 (signing key lifecycle).

pub mod keychain;
pub mod lock;
pub mod signing;
pub mod vault;

pub use lock::{AppLock, LockError, UnlockError};
pub use signing::{SigningKey, VerifyError, VerifyingKey};
pub use vault::{Vault, VaultError};
