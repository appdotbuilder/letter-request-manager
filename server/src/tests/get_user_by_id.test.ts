import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { getUserById } from '../handlers/get_user_by_id';

// Test user data
const testUser: CreateUserInput = {
  email: 'test@example.com',
  name: 'Test User',
  role: 'STUDENT',
  prodi: 'Informatika'
};

const testKaprodiUser: CreateUserInput = {
  email: 'kaprodi@example.com',
  name: 'Kaprodi Test',
  role: 'KAPRODI',
  prodi: 'Informatika'
};

describe('getUserById', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return user when found', async () => {
    // Create a test user
    const insertResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Get user by ID
    const result = await getUserById(createdUser.id);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(createdUser.id);
    expect(result!.email).toEqual('test@example.com');
    expect(result!.name).toEqual('Test User');
    expect(result!.role).toEqual('STUDENT');
    expect(result!.prodi).toEqual('Informatika');
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should return null when user not found', async () => {
    // Try to get a user that doesn't exist
    const result = await getUserById(999);

    expect(result).toBeNull();
  });

  it('should handle users with different roles correctly', async () => {
    // Create a kaprodi user
    const insertResult = await db.insert(usersTable)
      .values(testKaprodiUser)
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Get user by ID
    const result = await getUserById(createdUser.id);

    expect(result).not.toBeNull();
    expect(result!.role).toEqual('KAPRODI');
    expect(result!.prodi).toEqual('Informatika');
  });

  it('should handle users with null prodi', async () => {
    // Create user with null prodi (e.g., admin role)
    const adminUser: CreateUserInput = {
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'ADMIN',
      prodi: null
    };

    const insertResult = await db.insert(usersTable)
      .values(adminUser)
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Get user by ID
    const result = await getUserById(createdUser.id);

    expect(result).not.toBeNull();
    expect(result!.role).toEqual('ADMIN');
    expect(result!.prodi).toBeNull();
  });

  it('should return the first user when multiple users exist', async () => {
    // Create multiple users
    await db.insert(usersTable)
      .values([testUser, testKaprodiUser])
      .execute();

    // Get the first user (should have id = 1)
    const result = await getUserById(1);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(1);
    expect(result!.email).toEqual('test@example.com');
  });

  it('should handle zero as user ID', async () => {
    // Try to get user with ID 0 (should not exist)
    const result = await getUserById(0);

    expect(result).toBeNull();
  });

  it('should handle negative user ID', async () => {
    // Try to get user with negative ID (should not exist)
    const result = await getUserById(-1);

    expect(result).toBeNull();
  });
});