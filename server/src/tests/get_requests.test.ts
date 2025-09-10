import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, studentsTable, letterRequestsTable } from '../db/schema';
import { type CreateUserInput, type CreateStudentInput, type CreateLetterRequestInput, type GetRequestsFilter } from '../schema';
import { getRequests } from '../handlers/get_requests';

describe('getRequests', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data
  let adminUser: any;
  let kaprodiBIUser: any;
  let kaprodiTIUser: any; 
  let studentUser: any;
  let wd1User: any;
  let student1: any;
  let student2: any;
  let request1: any;
  let request2: any;
  let request3: any;

  const setupTestData = async () => {
    // Create users
    const adminUserData: CreateUserInput = {
      email: 'admin@test.com',
      name: 'Admin User',
      role: 'ADMIN'
    };

    const kaprodiBIUserData: CreateUserInput = {
      email: 'kaprodi.bi@test.com',
      name: 'Kaprodi BI',
      role: 'KAPRODI',
      prodi: 'Bisnis Digital'
    };

    const kaprodiTIUserData: CreateUserInput = {
      email: 'kaprodi.ti@test.com',
      name: 'Kaprodi TI',
      role: 'KAPRODI',
      prodi: 'Teknik Informatika'
    };

    const studentUserData: CreateUserInput = {
      email: 'student@test.com',
      name: 'Student User',
      role: 'STUDENT'
    };

    const wd1UserData: CreateUserInput = {
      email: 'wd1@test.com',
      name: 'WD1 User',
      role: 'WD1'
    };

    [adminUser] = await db.insert(usersTable).values(adminUserData).returning().execute();
    [kaprodiBIUser] = await db.insert(usersTable).values(kaprodiBIUserData).returning().execute();
    [kaprodiTIUser] = await db.insert(usersTable).values(kaprodiTIUserData).returning().execute();
    [studentUser] = await db.insert(usersTable).values(studentUserData).returning().execute();
    [wd1User] = await db.insert(usersTable).values(wd1UserData).returning().execute();

    // Create students
    const student1Data: CreateStudentInput = {
      nim: '123456789',
      name: 'Student One',
      prodi: 'Bisnis Digital'
    };

    const student2Data: CreateStudentInput = {
      nim: '987654321',
      name: 'Student Two',
      prodi: 'Teknik Informatika'
    };

    [student1] = await db.insert(studentsTable).values(student1Data).returning().execute();
    [student2] = await db.insert(studentsTable).values(student2Data).returning().execute();

    // Create letter requests
    const request1Data = {
      student_id: student1.id,
      created_by_user_id: kaprodiBIUser.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan beasiswa',
      priority: 'NORMAL' as const,
      status: 'DRAFT' as const,
      current_handler_user_id: kaprodiBIUser.id
    };

    const request2Data = {
      student_id: student2.id,
      created_by_user_id: kaprodiTIUser.id,
      letter_type: 'Surat Pengantar PKL',
      purpose: 'Untuk keperluan PKL',
      priority: 'URGENT' as const,
      status: 'APPROVED_KAPRODI' as const,
      current_handler_user_id: wd1User.id
    };

    const request3Data = {
      student_id: student1.id,
      created_by_user_id: studentUser.id,
      letter_type: 'Surat Keterangan Lulus',
      purpose: 'Untuk melamar kerja',
      priority: 'NORMAL' as const,
      status: 'TTD_DONE' as const,
      current_handler_user_id: null
    };

    [request1] = await db.insert(letterRequestsTable).values(request1Data).returning().execute();
    [request2] = await db.insert(letterRequestsTable).values(request2Data).returning().execute();
    [request3] = await db.insert(letterRequestsTable).values(request3Data).returning().execute();
  };

  it('should return all requests for admin user', async () => {
    await setupTestData();

    const results = await getRequests(undefined, adminUser.id);

    expect(results).toHaveLength(3);
    expect(results.map(r => r.id).sort()).toEqual([request1.id, request2.id, request3.id].sort());
  });

  it('should return only prodi requests for kaprodi users', async () => {
    await setupTestData();

    const biResults = await getRequests(undefined, kaprodiBIUser.id);
    const tiResults = await getRequests(undefined, kaprodiTIUser.id);

    // Kaprodi BI should see requests from Bisnis Digital students
    expect(biResults).toHaveLength(2);
    expect(biResults.map(r => r.id).sort()).toEqual([request1.id, request3.id].sort());

    // Kaprodi TI should see requests from Teknik Informatika students
    expect(tiResults).toHaveLength(1);
    expect(tiResults[0].id).toBe(request2.id);
  });

  it('should return only assigned or created requests for WD users', async () => {
    await setupTestData();

    const results = await getRequests(undefined, wd1User.id);

    // WD1 should see request2 (assigned to them)
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(request2.id);
  });

  it('should return only created requests for student users', async () => {
    await setupTestData();

    const results = await getRequests(undefined, studentUser.id);

    // Student user should only see request3 (created by them)
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(request3.id);
  });

  it('should filter by status', async () => {
    await setupTestData();

    const filter: GetRequestsFilter = {
      status: 'APPROVED_KAPRODI'
    };

    const results = await getRequests(filter, adminUser.id);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(request2.id);
    expect(results[0].status).toBe('APPROVED_KAPRODI');
  });

  it('should filter by priority', async () => {
    await setupTestData();

    const filter: GetRequestsFilter = {
      priority: 'URGENT'
    };

    const results = await getRequests(filter, adminUser.id);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(request2.id);
    expect(results[0].priority).toBe('URGENT');
  });

  it('should filter by student NIM', async () => {
    await setupTestData();

    const filter: GetRequestsFilter = {
      student_nim: '123456789'
    };

    const results = await getRequests(filter, adminUser.id);

    expect(results).toHaveLength(2);
    expect(results.map(r => r.id).sort()).toEqual([request1.id, request3.id].sort());
  });

  it('should filter by created_by_user_id', async () => {
    await setupTestData();

    const filter: GetRequestsFilter = {
      created_by_user_id: kaprodiBIUser.id
    };

    const results = await getRequests(filter, adminUser.id);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(request1.id);
  });

  it('should filter by current_handler_user_id', async () => {
    await setupTestData();

    const filter: GetRequestsFilter = {
      current_handler_user_id: wd1User.id
    };

    const results = await getRequests(filter, adminUser.id);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(request2.id);
  });

  it('should filter by date range', async () => {
    await setupTestData();

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const filter: GetRequestsFilter = {
      from_date: yesterday,
      to_date: tomorrow
    };

    const results = await getRequests(filter, adminUser.id);

    // All requests should be within the date range
    expect(results).toHaveLength(3);
    results.forEach(request => {
      expect(request.created_at).toBeInstanceOf(Date);
      expect(request.created_at >= yesterday).toBe(true);
      expect(request.created_at <= tomorrow).toBe(true);
    });
  });

  it('should combine multiple filters', async () => {
    await setupTestData();

    const filter: GetRequestsFilter = {
      status: 'DRAFT',
      priority: 'NORMAL',
      student_nim: '123456789'
    };

    const results = await getRequests(filter, adminUser.id);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(request1.id);
    expect(results[0].status).toBe('DRAFT');
    expect(results[0].priority).toBe('NORMAL');
  });

  it('should return results sorted by created_at descending', async () => {
    await setupTestData();

    const results = await getRequests(undefined, adminUser.id);

    expect(results).toHaveLength(3);
    // Results should be sorted by created_at descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i-1].created_at >= results[i].created_at).toBe(true);
    }
  });

  it('should return empty array for non-existent user', async () => {
    await setupTestData();

    const results = await getRequests(undefined, 999999);

    expect(results).toHaveLength(0);
  });

  it('should work without userId parameter', async () => {
    await setupTestData();

    const results = await getRequests();

    // Without userId, should return all requests
    expect(results).toHaveLength(3);
  });

  it('should work with filter but no userId', async () => {
    await setupTestData();

    const filter: GetRequestsFilter = {
      status: 'TTD_DONE'
    };

    const results = await getRequests(filter);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(request3.id);
  });

  it('should return proper letter request structure', async () => {
    await setupTestData();

    const results = await getRequests(undefined, adminUser.id);

    expect(results).toHaveLength(3);
    const request = results[0];

    // Validate structure
    expect(request.id).toBeDefined();
    expect(typeof request.student_id).toBe('number');
    expect(typeof request.created_by_user_id).toBe('number');
    expect(typeof request.letter_type).toBe('string');
    expect(typeof request.purpose).toBe('string');
    expect(request.priority).toMatch(/^(NORMAL|URGENT)$/);
    expect(request.status).toBeDefined();
    expect(request.created_at).toBeInstanceOf(Date);
    expect(request.updated_at).toBeInstanceOf(Date);
  });
});