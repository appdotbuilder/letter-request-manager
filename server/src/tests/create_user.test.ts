import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { createUser } from '../handlers/create_user';
import { eq } from 'drizzle-orm';

// Test inputs for different user roles
const testInputStudent: CreateUserInput = {
  email: 'student@example.com',
  name: 'Test Student',
  role: 'STUDENT',
  prodi: 'Teknik Informatika'
};

const testInputStaff: CreateUserInput = {
  email: 'staff@example.com',
  name: 'Test Staff',
  role: 'STAFF_PRODI',
  prodi: 'Teknik Informatika'
};

const testInputAdmin: CreateUserInput = {
  email: 'admin@example.com',
  name: 'Test Admin',
  role: 'ADMIN',
  prodi: null // Admin doesn't need prodi
};

const testInputDekan: CreateUserInput = {
  email: 'dekan@example.com',
  name: 'Test Dekan',
  role: 'DEKAN'
  // prodi is optional and will default to null
};

describe('createUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a student user', async () => {
    const result = await createUser(testInputStudent);

    // Basic field validation
    expect(result.email).toEqual('student@example.com');
    expect(result.name).toEqual('Test Student');
    expect(result.role).toEqual('STUDENT');
    expect(result.prodi).toEqual('Teknik Informatika');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a staff user', async () => {
    const result = await createUser(testInputStaff);

    expect(result.email).toEqual('staff@example.com');
    expect(result.name).toEqual('Test Staff');
    expect(result.role).toEqual('STAFF_PRODI');
    expect(result.prodi).toEqual('Teknik Informatika');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create an admin user with null prodi', async () => {
    const result = await createUser(testInputAdmin);

    expect(result.email).toEqual('admin@example.com');
    expect(result.name).toEqual('Test Admin');
    expect(result.role).toEqual('ADMIN');
    expect(result.prodi).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a dekan user with prodi defaulting to null', async () => {
    const result = await createUser(testInputDekan);

    expect(result.email).toEqual('dekan@example.com');
    expect(result.name).toEqual('Test Dekan');
    expect(result.role).toEqual('DEKAN');
    expect(result.prodi).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save user to database', async () => {
    const result = await createUser(testInputStudent);

    // Query using proper drizzle syntax
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].email).toEqual('student@example.com');
    expect(users[0].name).toEqual('Test Student');
    expect(users[0].role).toEqual('STUDENT');
    expect(users[0].prodi).toEqual('Teknik Informatika');
    expect(users[0].created_at).toBeInstanceOf(Date);
    expect(users[0].updated_at).toBeInstanceOf(Date);
  });

  it('should handle unique email constraint', async () => {
    // Create first user
    await createUser(testInputStudent);

    // Try to create another user with same email
    const duplicateUser: CreateUserInput = {
      email: 'student@example.com', // Same email
      name: 'Another Student',
      role: 'STUDENT',
      prodi: 'Sistem Informasi'
    };

    await expect(createUser(duplicateUser)).rejects.toThrow(/duplicate key value violates unique constraint|unique constraint failed/i);
  });

  it('should create users with different roles successfully', async () => {
    const users = await Promise.all([
      createUser(testInputStudent),
      createUser(testInputStaff),
      createUser(testInputAdmin)
    ]);

    expect(users).toHaveLength(3);
    expect(users[0].role).toEqual('STUDENT');
    expect(users[1].role).toEqual('STAFF_PRODI');
    expect(users[2].role).toEqual('ADMIN');
  });

  it('should query users by role correctly', async () => {
    // Create multiple users with different roles
    await createUser(testInputStudent);
    await createUser(testInputStaff);
    await createUser(testInputAdmin);

    // Query students only
    const students = await db.select()
      .from(usersTable)
      .where(eq(usersTable.role, 'STUDENT'))
      .execute();

    expect(students).toHaveLength(1);
    expect(students[0].role).toEqual('STUDENT');
    expect(students[0].email).toEqual('student@example.com');

    // Query admin users only
    const admins = await db.select()
      .from(usersTable)
      .where(eq(usersTable.role, 'ADMIN'))
      .execute();

    expect(admins).toHaveLength(1);
    expect(admins[0].role).toEqual('ADMIN');
    expect(admins[0].email).toEqual('admin@example.com');
  });

  it('should handle prodi field for roles that need it', async () => {
    const kaprodiUser: CreateUserInput = {
      email: 'kaprodi@example.com',
      name: 'Test Kaprodi',
      role: 'KAPRODI',
      prodi: 'Teknik Elektro'
    };

    const result = await createUser(kaprodiUser);

    expect(result.role).toEqual('KAPRODI');
    expect(result.prodi).toEqual('Teknik Elektro');
  });

  it('should handle roles that do not need prodi', async () => {
    const wd1User: CreateUserInput = {
      email: 'wd1@example.com',
      name: 'Test WD1',
      role: 'WD1'
      // No prodi specified - should default to null
    };

    const result = await createUser(wd1User);

    expect(result.role).toEqual('WD1');
    expect(result.prodi).toBeNull();
  });
});