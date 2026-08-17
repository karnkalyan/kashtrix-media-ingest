const { hashPassword } = require('./securityPolicy');

class SuperadminBootstrapError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SuperadminBootstrapError';
    this.code = code;
  }
}

const validateBootstrapCredentials = ({ username, email, password }) => {
  const normalizedUsername = String(username || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const suppliedPassword = String(password || '');

  if (!/^[a-zA-Z0-9._@+-]{3,64}$/.test(normalizedUsername)) {
    throw new SuperadminBootstrapError('INVALID_USERNAME', 'Username must be 3-64 characters using letters, numbers, dot, underscore, hyphen, or @');
  }
  if (normalizedEmail.length > 191 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new SuperadminBootstrapError('INVALID_EMAIL', 'Enter a valid email address');
  }
  if (suppliedPassword.length < 8) {
    throw new SuperadminBootstrapError('WEAK_PASSWORD', 'Password must be at least 8 characters');
  }
  if (Buffer.byteLength(suppliedPassword, 'utf8') > 72) {
    throw new SuperadminBootstrapError('PASSWORD_TOO_LONG', 'Password must not exceed 72 UTF-8 bytes');
  }

  return { username: normalizedUsername, email: normalizedEmail, password: suppliedPassword };
};

const createBootstrapSuperadmin = async (prisma, credentials) => {
  if (!prisma?.$transaction) throw new TypeError('A Prisma client is required');
  const validated = validateBootstrapCredentials(credentials);
  const passwordHash = hashPassword(validated.password);

  return prisma.$transaction(async transaction => {
    const existingSuperadmin = await transaction.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    });
    if (existingSuperadmin) {
      throw new SuperadminBootstrapError('SUPERADMIN_EXISTS', 'A persisted superadmin already exists; bootstrap did not change any account');
    }

    const conflictingUser = await transaction.user.findFirst({
      where: { OR: [{ username: validated.username }, { email: validated.email }] },
      select: { id: true },
    });
    if (conflictingUser) {
      throw new SuperadminBootstrapError('IDENTITY_EXISTS', 'Username or email already belongs to an existing account; bootstrap will not promote it');
    }

    const user = await transaction.user.create({
      data: {
        username: validated.username,
        email: validated.email,
        passwordHash,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
      select: { id: true, username: true, email: true, role: true },
    });
    await transaction.auditLog.create({
      data: {
        userId: user.id,
        action: 'BOOTSTRAP_SUPERADMIN_CREATED',
        targetId: String(user.id),
        type: 'AUTH',
        details: 'Created by trusted local Prisma bootstrap CLI',
      },
    });
    return user;
  }, { isolationLevel: 'Serializable' });
};

module.exports = {
  SuperadminBootstrapError,
  createBootstrapSuperadmin,
  validateBootstrapCredentials,
};
