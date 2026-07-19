import { test, expect } from '@playwright/test';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';
import { PrismaClient } from '@prisma/client';
import { loginUser } from '../src/actions/auth';
import { createUser, updateUser } from '../src/actions/users';

const prisma = new PrismaClient();

test.describe('Password Security and Hashing Integration Scenarios', () => {
  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
    await disconnectDatabase();
  });

  test('Scenario 1: Lazy migration / progressive hashing on first login', async () => {
    // 1. Verify user was seeded with plain text password in DB
    const email = 'admin@tls.com';
    let user = await prisma.adminUser.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user!.password).toBe('admin1234'); // Seeded as plain text

    // 2. Perform login which should match plain text and trigger automatic re-hashing
    const loginResult = await loginUser(email, 'admin1234');
    expect(loginResult.success).toBe(true);

    // 3. Verify database password was automatically hashed to scrypt
    user = await prisma.adminUser.findUnique({ where: { email } });
    expect(user!.password).toBeDefined();
    expect(user!.password.startsWith('scrypt:')).toBe(true);

    // 4. Verify login still works now that it is hashed
    const loginResult2 = await loginUser(email, 'admin1234');
    expect(loginResult2.success).toBe(true);

    // 5. Verify incorrect password fails
    const badLogin = await loginUser(email, 'wrongpass');
    expect(badLogin.success).toBe(false);
    expect(badLogin.error).toBe('Invalid email or password');
  });

  test('Scenario 2: Creating a new user automatically hashes their password', async () => {
    const newUserEmail = 'new-user-test@tls.com';
    
    // Create new user using the server action
    const createResult = await createUser({
      name: 'New Test User',
      email: newUserEmail,
      password: 'mypassword123',
      role: 'staff',
      permissions: ['jobs']
    });

    expect(createResult.success).toBe(true);

    // Verify it is saved in the database as a hash
    const dbUser = await prisma.adminUser.findUnique({ where: { email: newUserEmail } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.password).not.toBe('mypassword123');
    expect(dbUser!.password.startsWith('scrypt:')).toBe(true);

    // Login with the new user credentials should work
    const loginRes = await loginUser(newUserEmail, 'mypassword123');
    expect(loginRes.success).toBe(true);
  });

  test('Scenario 3: Updating a user password hashes the new password', async () => {
    const email = 'admin@tls.com';
    let user = await prisma.adminUser.findUnique({ where: { email } });
    const userId = user!.id;

    // Update user password to a new one
    const updateResult = await updateUser(userId, {
      name: 'Test Admin User',
      email: email,
      password: 'newsecretpassword',
      role: 'admin',
      permissions: ['jobs', 'settings']
    });

    expect(updateResult.success).toBe(true);

    // Verify database password is now hashed to scrypt
    user = await prisma.adminUser.findUnique({ where: { email } });
    expect(user!.password).not.toBe('newsecretpassword');
    expect(user!.password.startsWith('scrypt:')).toBe(true);

    // Login with new password should succeed
    const loginNew = await loginUser(email, 'newsecretpassword');
    expect(loginNew.success).toBe(true);

    // Login with old password should fail
    const loginOld = await loginUser(email, 'admin1234');
    expect(loginOld.success).toBe(false);
  });
});
