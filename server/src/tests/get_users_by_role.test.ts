import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type UserRole } from '../schema';
import { getUsersByRole } from '../handlers/get_users_by_role';

// Test users for different roles
const testUsers: CreateUserInput[] = [
  {
    email: 'kaprodi1@university.edu',
    name: 'Kaprodi Informatika',
    role: 'KAPRODI',
    prodi: 'Informatika'
  },
  {
    email: 'kaprodi2@university.edu',
    name: 'Kaprodi Sistem Informasi',
    role: 'KAPRODI',
    prodi: 'Sistem Informasi'
  },
  {
    email: 'dekan@university.edu',
    name: 'Dekan Fakultas',
    role: 'DEKAN',
    prodi: null
  },
  {
    email: 'wd1@university.edu',
    name: 'Wakil Dekan 1',
    role: 'WD1',
    prodi: null
  },
  {
    email: 'wd2@university.edu',
    name: 'Wakil Dekan 2',
    role: 'WD2',
    prodi: null
  },
  {
    email: 'kaur.akademik@university.edu',
    name: 'Kepala Urusan Akademik',
    role: 'KAUR_AKADEMIK',
    prodi: null
  },
  {
    email: 'student@university.edu',
    name: 'Test Student',
    role: 'STUDENT',
    prodi: null
  }
];

describe('getUsersByRole', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return users with specific role', async () => {
    // Create test users
    await db.insert(usersTable)
      .values(testUsers)
      .execute();

    const kaprodis = await getUsersByRole('KAPRODI');

    expect(kaprodis).toHaveLength(2);
    expect(kaprodis[0].role).toEqual('KAPRODI');
    expect(kaprodis[1].role).toEqual('KAPRODI');

    // Verify they are the correct users
    const names = kaprodis.map(u => u.name).sort();
    expect(names).toEqual(['Kaprodi Informatika', 'Kaprodi Sistem Informasi']);
  });

  it('should return empty array for non-existent role', async () => {
    // Create only some test users
    await db.insert(usersTable)
      .values([testUsers[0], testUsers[2]]) // Only KAPRODI and DEKAN
      .execute();

    const wd3Users = await getUsersByRole('WD3');

    expect(wd3Users).toHaveLength(0);
    expect(wd3Users).toEqual([]);
  });

  it('should return single user for unique role', async () => {
    // Create test users
    await db.insert(usersTable)
      .values(testUsers)
      .execute();

    const dekans = await getUsersByRole('DEKAN');

    expect(dekans).toHaveLength(1);
    expect(dekans[0].name).toEqual('Dekan Fakultas');
    expect(dekans[0].role).toEqual('DEKAN');
    expect(dekans[0].email).toEqual('dekan@university.edu');
  });

  it('should return multiple users for roles with multiple instances', async () => {
    // Create test users
    await db.insert(usersTable)
      .values(testUsers)
      .execute();

    const wds = await getUsersByRole('WD1');
    expect(wds).toHaveLength(1);

    const allKaprodis = await getUsersByRole('KAPRODI');
    expect(allKaprodis).toHaveLength(2);
  });

  it('should return users with correct fields populated', async () => {
    // Create test users
    await db.insert(usersTable)
      .values(testUsers)
      .execute();

    const users = await getUsersByRole('KAUR_AKADEMIK');

    expect(users).toHaveLength(1);
    const user = users[0];

    // Verify all fields are present
    expect(user.id).toBeDefined();
    expect(typeof user.id).toBe('number');
    expect(user.email).toEqual('kaur.akademik@university.edu');
    expect(user.name).toEqual('Kepala Urusan Akademik');
    expect(user.role).toEqual('KAUR_AKADEMIK');
    expect(user.prodi).toBeNull();
    expect(user.created_at).toBeInstanceOf(Date);
    expect(user.updated_at).toBeInstanceOf(Date);
  });

  it('should handle prodi-specific roles correctly', async () => {
    // Create test users
    await db.insert(usersTable)
      .values(testUsers)
      .execute();

    const kaprodis = await getUsersByRole('KAPRODI');

    expect(kaprodis).toHaveLength(2);
    
    // Check that prodi fields are correctly preserved
    const prodiValues = kaprodis.map(k => k.prodi).sort();
    expect(prodiValues).toEqual(['Informatika', 'Sistem Informasi']);
  });

  it('should return users in consistent order', async () => {
    // Create test users
    await db.insert(usersTable)
      .values(testUsers)
      .execute();

    // Call multiple times to ensure consistent ordering
    const result1 = await getUsersByRole('KAPRODI');
    const result2 = await getUsersByRole('KAPRODI');

    expect(result1).toHaveLength(2);
    expect(result2).toHaveLength(2);

    // Results should be in the same order (by id which is auto-increment)
    expect(result1[0].id).toEqual(result2[0].id);
    expect(result1[1].id).toEqual(result2[1].id);
  });

  it('should handle all administrative roles', async () => {
    const adminUsers: CreateUserInput[] = [
      {
        email: 'kabag.tu@university.edu',
        name: 'Kabag Tata Usaha',
        role: 'KABAG_TU',
        prodi: null
      },
      {
        email: 'kaur.kemahasiswaan@university.edu',
        name: 'Kaur Kemahasiswaan',
        role: 'KAUR_KEMAHASISWAAN',
        prodi: null
      },
      {
        email: 'kaur.keuangan@university.edu',
        name: 'Kaur Keuangan',
        role: 'KAUR_KEUANGAN',
        prodi: null
      }
    ];

    await db.insert(usersTable)
      .values(adminUsers)
      .execute();

    const kabagTU = await getUsersByRole('KABAG_TU');
    expect(kabagTU).toHaveLength(1);
    expect(kabagTU[0].name).toEqual('Kabag Tata Usaha');

    const kaurKemahasiswaan = await getUsersByRole('KAUR_KEMAHASISWAAN');
    expect(kaurKemahasiswaan).toHaveLength(1);
    expect(kaurKemahasiswaan[0].name).toEqual('Kaur Kemahasiswaan');

    const kaurKeuangan = await getUsersByRole('KAUR_KEUANGAN');
    expect(kaurKeuangan).toHaveLength(1);
    expect(kaurKeuangan[0].name).toEqual('Kaur Keuangan');
  });
});