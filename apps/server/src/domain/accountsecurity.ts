/** Sign-in hardening rules. Pure: a zero setting switches its rule off, which is today's behaviour. */
export type SecurityConfig = {
  /** Failed sign-ins in a row before the account locks. 0: never. */
  lockoutAttempts: number;
  /** How long a lock lasts. */
  lockoutMinutes: number;
  /** Days a password may be used. 0: no expiry. */
  passwordMaxAgeDays: number;
  /** Minutes without a request before a session ends. 0: no limit. */
  idleMinutes: number;
};

export const NO_LIMITS: SecurityConfig = {
  lockoutAttempts: 0,
  lockoutMinutes: 15,
  passwordMaxAgeDays: 0,
  idleMinutes: 0,
};

const MINUTE = 60_000;
const DAY = 86_400_000;

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/** When the account is locked until, given the failed count after this failure; null while under the limit. */
export function lockAfterFailure(failed: number, now: Date, config: SecurityConfig): Date | null {
  if (config.lockoutAttempts <= 0 || failed < config.lockoutAttempts) return null;
  return new Date(now.getTime() + config.lockoutMinutes * MINUTE);
}

export function passwordExpired(changedAt: Date, now: Date, config: SecurityConfig): boolean {
  return config.passwordMaxAgeDays > 0 && now.getTime() - changedAt.getTime() > config.passwordMaxAgeDays * DAY;
}

export function sessionIdle(lastSeenAt: Date, now: Date, config: SecurityConfig): boolean {
  return config.idleMinutes > 0 && now.getTime() - lastSeenAt.getTime() > config.idleMinutes * MINUTE;
}
