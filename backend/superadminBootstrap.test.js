const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPassword } = require('./securityPolicy');
const {
  createBootstrapSuperadmin,
  validateBootstrapCredentials,
} = require('./superadminBootstrap');

const validCredentials = {
  username: 'root.operator',
  email: 'Root.Operator@example.com',
  password: 'Unique-Local-Password-739!',
};

test('bootstrap credentials are normalized and require a strong bcrypt-safe password', () => {
  const credentials = validateBootstrapCredentials(validCredentials);
  assert.equal(credentials.username, 'root.operator');
  assert.equal(credentials.email, 'root.operator@example.com');
  assert.throws(() => validateBootstrapCredentials({ ...validCredentials, password: 'short' }), /8 characters/);
  assert.throws(() => validateBootstrapCredentials({ ...validCredentials, password: `Aa1!${'x'.repeat(70)}` }), /72 UTF-8 bytes/);
});

test('trusted bootstrap creates only a persisted SUPER_ADMIN and stores no plaintext password', async () => {
  let findCall = 0;
  let createdData;
  let auditData;
  let transactionOptions;
  const transaction = {
    user: {
      findFirst: async () => { findCall += 1; return null; },
      create: async ({ data }) => {
        createdData = data;
        return { id: 42, username: data.username, email: data.email, role: data.role };
      },
    },
    auditLog: { create: async ({ data }) => { auditData = data; } },
  };
  const prisma = {
    $transaction: async (operation, options) => {
      transactionOptions = options;
      return operation(transaction);
    },
  };

  const user = await createBootstrapSuperadmin(prisma, validCredentials);
  assert.equal(findCall, 2);
  assert.equal(user.role, 'SUPER_ADMIN');
  assert.equal(createdData.role, 'SUPER_ADMIN');
  assert.equal(createdData.password, undefined);
  assert.notEqual(createdData.passwordHash, validCredentials.password);
  assert.equal(verifyPassword(validCredentials.password, createdData.passwordHash), true);
  assert.equal(auditData.action, 'BOOTSTRAP_SUPERADMIN_CREATED');
  assert.equal(transactionOptions.isolationLevel, 'Serializable');
});

test('bootstrap fails closed when a superadmin already exists', async () => {
  let createCalled = false;
  const prisma = {
    $transaction: operation => operation({
      user: {
        findFirst: async () => ({ id: 7 }),
        create: async () => { createCalled = true; },
      },
      auditLog: { create: async () => {} },
    }),
  };

  await assert.rejects(() => createBootstrapSuperadmin(prisma, validCredentials), error => (
    error.code === 'SUPERADMIN_EXISTS' && /already exists/.test(error.message)
  ));
  assert.equal(createCalled, false);
});

test('bootstrap refuses to promote an existing admin or user identity', async () => {
  let findCall = 0;
  const prisma = {
    $transaction: operation => operation({
      user: {
        findFirst: async () => {
          findCall += 1;
          return findCall === 1 ? null : { id: 9 };
        },
        create: async () => assert.fail('existing identity must not be promoted or recreated'),
      },
      auditLog: { create: async () => {} },
    }),
  };

  await assert.rejects(() => createBootstrapSuperadmin(prisma, validCredentials), error => (
    error.code === 'IDENTITY_EXISTS' && /will not promote/.test(error.message)
  ));
});
