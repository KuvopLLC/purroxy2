// App lock state machine (PRD §7.7, §9.6).
//
// PIN is hashed with argon2id (no plaintext PIN persisted). Inactivity
// timeout starts on every recorded interaction; lock latches when the
// timeout elapses or on an explicit lock request. Unlock requires a
// matching PIN. While locked, every privileged operation refuses.

use anyhow::{Context, Result};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::keychain::Keystore;

const PIN_HASH_KEY: &str = "app-lock-pin-hash-v1";

#[derive(Debug)]
pub enum LockError {
    PinNotSet,
    AlreadyLocked,
}

impl std::fmt::Display for LockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LockError::PinNotSet => write!(f, "PIN must be set before lock can be enabled"),
            LockError::AlreadyLocked => write!(f, "already locked"),
        }
    }
}
impl std::error::Error for LockError {}

#[derive(Debug)]
pub enum UnlockError {
    NoPinSet,
    WrongPin,
}

impl std::fmt::Display for UnlockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UnlockError::NoPinSet => write!(f, "no PIN configured"),
            UnlockError::WrongPin => write!(f, "wrong PIN"),
        }
    }
}
impl std::error::Error for UnlockError {}

#[derive(Clone)]
pub struct AppLock<K: Keystore + Clone> {
    state: Arc<Mutex<State>>,
    store: K,
}

struct State {
    locked: bool,
    last_activity: Instant,
    inactivity_timeout: Duration,
}

impl<K: Keystore + Clone> AppLock<K> {
    pub fn new(store: K, inactivity_timeout: Duration) -> Self {
        AppLock {
            state: Arc::new(Mutex::new(State {
                locked: false,
                last_activity: Instant::now(),
                inactivity_timeout,
            })),
            store,
        }
    }

    pub fn set_pin(&self, pin: &str) -> Result<()> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let hash = argon2
            .hash_password(pin.as_bytes(), &salt)
            .map_err(|e| anyhow::anyhow!("hashing PIN: {e}"))?
            .to_string();
        self.store
            .set(PIN_HASH_KEY, hash.as_bytes())
            .context("persisting PIN hash")?;
        Ok(())
    }

    pub fn has_pin(&self) -> Result<bool> {
        Ok(self.store.get(PIN_HASH_KEY)?.is_some())
    }

    pub fn lock(&self) {
        self.state.lock().unwrap().locked = true;
    }

    pub fn unlock(&self, pin: &str) -> Result<(), UnlockError> {
        let raw = self
            .store
            .get(PIN_HASH_KEY)
            .map_err(|_| UnlockError::NoPinSet)?
            .ok_or(UnlockError::NoPinSet)?;
        let hash_str = std::str::from_utf8(&raw).map_err(|_| UnlockError::NoPinSet)?;
        let parsed = PasswordHash::new(hash_str).map_err(|_| UnlockError::NoPinSet)?;
        Argon2::default()
            .verify_password(pin.as_bytes(), &parsed)
            .map_err(|_| UnlockError::WrongPin)?;
        let mut state = self.state.lock().unwrap();
        state.locked = false;
        state.last_activity = Instant::now();
        Ok(())
    }

    pub fn record_activity(&self) {
        let mut state = self.state.lock().unwrap();
        if !state.locked {
            state.last_activity = Instant::now();
        }
    }

    pub fn is_locked(&self) -> bool {
        let mut state = self.state.lock().unwrap();
        if !state.locked && state.last_activity.elapsed() >= state.inactivity_timeout {
            state.locked = true;
        }
        state.locked
    }

    /// Gate function: every privileged command should call this first.
    pub fn gate<R, F: FnOnce() -> R>(&self, op: F) -> Result<R, LockError> {
        if self.is_locked() {
            return Err(LockError::AlreadyLocked);
        }
        self.record_activity();
        Ok(op())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keychain::MemoryKeystore;
    use std::thread::sleep;

    fn lock(timeout: Duration) -> AppLock<MemoryKeystore> {
        AppLock::new(MemoryKeystore::new(), timeout)
    }

    #[test]
    fn no_pin_initially() {
        let l = lock(Duration::from_secs(60));
        assert!(!l.has_pin().unwrap());
    }

    #[test]
    fn set_pin_persists() {
        let l = lock(Duration::from_secs(60));
        l.set_pin("0000").unwrap();
        assert!(l.has_pin().unwrap());
    }

    #[test]
    fn wrong_pin_fails_unlock() {
        let l = lock(Duration::from_secs(60));
        l.set_pin("1234").unwrap();
        l.lock();
        assert!(l.is_locked());
        let r = l.unlock("9999");
        assert!(matches!(r, Err(UnlockError::WrongPin)));
        assert!(l.is_locked());
    }

    #[test]
    fn correct_pin_unlocks() {
        let l = lock(Duration::from_secs(60));
        l.set_pin("1234").unwrap();
        l.lock();
        l.unlock("1234").unwrap();
        assert!(!l.is_locked());
    }

    #[test]
    fn inactivity_locks_after_timeout() {
        let l = lock(Duration::from_millis(50));
        l.set_pin("1234").unwrap();
        assert!(!l.is_locked());
        sleep(Duration::from_millis(100));
        assert!(l.is_locked());
    }

    #[test]
    fn record_activity_resets_inactivity() {
        let l = lock(Duration::from_millis(150));
        l.set_pin("1234").unwrap();
        sleep(Duration::from_millis(100));
        l.record_activity();
        sleep(Duration::from_millis(100));
        assert!(!l.is_locked());
    }

    #[test]
    fn gate_refuses_while_locked() {
        let l = lock(Duration::from_secs(60));
        l.set_pin("1234").unwrap();
        l.lock();
        let r: Result<_, LockError> = l.gate(|| 42);
        assert!(matches!(r, Err(LockError::AlreadyLocked)));
    }

    #[test]
    fn gate_runs_op_when_unlocked() {
        let l = lock(Duration::from_secs(60));
        let r = l.gate(|| 42).unwrap();
        assert_eq!(r, 42);
    }

    #[test]
    fn no_pin_means_cannot_unlock_anyway() {
        let l = lock(Duration::from_secs(60));
        l.lock();
        let r = l.unlock("anything");
        assert!(matches!(r, Err(UnlockError::NoPinSet)));
    }
}
