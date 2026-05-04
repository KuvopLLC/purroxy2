// Bundle signing and verification.
//
// Ed25519 keypair. The signing key lives in the OS keychain; the
// public key (32 bytes) is embedded in every bundle so verifiers
// don't need out-of-band key distribution. PRD §10 specifies the
// rotation, loss, and compromise stories; this module owns the
// cryptographic primitives.

use anyhow::{Context, Result};
use ed25519_dalek::{
    Signature, Signer, SigningKey as Ed25519SigningKey, Verifier, VerifyingKey as Ed25519VerifyingKey,
};
use rand::rngs::OsRng;
use zeroize::Zeroize;

use crate::keychain::Keystore;

const KEY_NAME: &str = "user-signing-key-v1";

#[derive(Debug)]
pub enum VerifyError {
    BadSignature,
    BadKey,
    NotVerified,
}

impl std::fmt::Display for VerifyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VerifyError::BadSignature => write!(f, "signature is malformed"),
            VerifyError::BadKey => write!(f, "public key is malformed"),
            VerifyError::NotVerified => {
                write!(f, "signature does not verify against the supplied public key")
            }
        }
    }
}

impl std::error::Error for VerifyError {}

pub struct SigningKey {
    inner: Ed25519SigningKey,
}

#[derive(Clone, Copy)]
pub struct VerifyingKey {
    inner: Ed25519VerifyingKey,
}

impl SigningKey {
    /// Load the user's signing key from the keystore. If absent,
    /// generate a fresh keypair, persist it, and return.
    pub fn load_or_generate<K: Keystore>(store: &K) -> Result<Self> {
        if let Some(bytes) = store.get(KEY_NAME)? {
            if bytes.len() == 32 {
                let mut buf = [0u8; 32];
                buf.copy_from_slice(&bytes);
                let key = Ed25519SigningKey::from_bytes(&buf);
                buf.zeroize();
                return Ok(SigningKey { inner: key });
            }
        }
        let key = Ed25519SigningKey::generate(&mut OsRng);
        store
            .set(KEY_NAME, key.as_bytes())
            .context("persisting fresh signing key")?;
        Ok(SigningKey { inner: key })
    }

    pub fn sign(&self, data: &[u8]) -> Vec<u8> {
        let sig: Signature = self.inner.sign(data);
        sig.to_bytes().to_vec()
    }

    pub fn verifying_key(&self) -> VerifyingKey {
        VerifyingKey {
            inner: self.inner.verifying_key(),
        }
    }
}

impl VerifyingKey {
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, VerifyError> {
        if bytes.len() != 32 {
            return Err(VerifyError::BadKey);
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(bytes);
        let inner = Ed25519VerifyingKey::from_bytes(&arr).map_err(|_| VerifyError::BadKey)?;
        Ok(VerifyingKey { inner })
    }

    pub fn to_bytes(&self) -> [u8; 32] {
        self.inner.to_bytes()
    }

    pub fn verify(&self, data: &[u8], signature: &[u8]) -> Result<(), VerifyError> {
        if signature.len() != 64 {
            return Err(VerifyError::BadSignature);
        }
        let mut arr = [0u8; 64];
        arr.copy_from_slice(signature);
        let sig = Signature::from_bytes(&arr);
        self.inner
            .verify(data, &sig)
            .map_err(|_| VerifyError::NotVerified)
    }
}

// Convenience helpers for bundle verification: a bundle embeds its
// own VerifyingKey bytes plus a Signature over its canonical
// payload. Verification doesn't need the keystore at all (anyone
// can verify a signed bundle if they have the bundle).

pub struct SignedPayload<'a> {
    pub payload: &'a [u8],
    pub public_key: &'a [u8],
    pub signature: &'a [u8],
}

pub fn verify_bundle(p: &SignedPayload<'_>) -> Result<(), VerifyError> {
    let vk = VerifyingKey::from_bytes(p.public_key)?;
    vk.verify(p.payload, p.signature)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keychain::MemoryKeystore;

    #[test]
    fn round_trips_a_signed_payload() {
        let store = MemoryKeystore::new();
        let key = SigningKey::load_or_generate(&store).unwrap();
        let pk = key.verifying_key();
        let payload = b"hello purroxy bundle";
        let sig = key.sign(payload);
        verify_bundle(&SignedPayload {
            payload,
            public_key: &pk.to_bytes(),
            signature: &sig,
        })
        .expect("valid signature should verify");
    }

    #[test]
    fn detects_payload_tampering() {
        let store = MemoryKeystore::new();
        let key = SigningKey::load_or_generate(&store).unwrap();
        let pk = key.verifying_key();
        let payload = b"hello purroxy bundle";
        let sig = key.sign(payload);
        let tampered = b"hello purroxy attacker";
        let r = verify_bundle(&SignedPayload {
            payload: tampered,
            public_key: &pk.to_bytes(),
            signature: &sig,
        });
        assert!(matches!(r, Err(VerifyError::NotVerified)));
    }

    #[test]
    fn detects_signature_tampering() {
        let store = MemoryKeystore::new();
        let key = SigningKey::load_or_generate(&store).unwrap();
        let pk = key.verifying_key();
        let payload = b"hello purroxy bundle";
        let mut sig = key.sign(payload);
        sig[0] ^= 0xff;
        let r = verify_bundle(&SignedPayload {
            payload,
            public_key: &pk.to_bytes(),
            signature: &sig,
        });
        assert!(matches!(r, Err(VerifyError::NotVerified)));
    }

    #[test]
    fn second_load_returns_the_same_key() {
        let store = MemoryKeystore::new();
        let a = SigningKey::load_or_generate(&store).unwrap();
        let b = SigningKey::load_or_generate(&store).unwrap();
        assert_eq!(a.verifying_key().to_bytes(), b.verifying_key().to_bytes());
    }

    #[test]
    fn detects_bad_public_key_length() {
        let r = VerifyingKey::from_bytes(&[0u8; 31]);
        assert!(matches!(r, Err(VerifyError::BadKey)));
    }
}
