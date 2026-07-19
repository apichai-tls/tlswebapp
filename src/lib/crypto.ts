import crypto from 'crypto';

/**
 * Hash a password using Node.js built-in scrypt algorithm.
 * Output format: scrypt:salt:hash
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

/**
 * Verify a password against a stored value.
 * Supports timing-safe verification and plain-text fallback (for progressive migration).
 */
export function verifyPassword(password: string, storedValue: string): { isValid: boolean; shouldRehash: boolean } {
  // If stored value matches the format 'scrypt:salt:hash'
  if (storedValue.startsWith('scrypt:')) {
    const parts = storedValue.split(':');
    if (parts.length === 3) {
      const [, salt, hash] = parts;
      try {
        const calculatedHash = crypto.scryptSync(password, salt, 64).toString('hex');
        
        // Timing-safe comparison to prevent timing attacks
        const isValid = crypto.timingSafeEqual(
          Buffer.from(hash, 'hex'),
          Buffer.from(calculatedHash, 'hex')
        );
        
        return {
          isValid,
          shouldRehash: false
        };
      } catch (err) {
        console.error('Error during timing-safe verification:', err);
        return { isValid: false, shouldRehash: false };
      }
    }
  }

  // Fallback check for plain text password (lazy migration)
  const isValid = password === storedValue;
  return {
    isValid,
    shouldRehash: isValid // If it matches plain text, we need to hash it and save it back to DB
  };
}
