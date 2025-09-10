import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, studentsTable, letterRequestsTable, trackingLogsTable } from '../db/schema';
import { getTrackingLogs } from '../handlers/get_tracking_logs';

// Test data
const testUser = {
  email: 'kaprodi@test.com',
  name: 'Test Kaprodi',
  role: 'KAPRODI' as const,
  prodi: 'Informatika'
};

const testStudent = {
  nim: '123456789',
  name: 'Test Student',
  prodi: 'Informatika'
};

const testAdmin = {
  email: 'admin@test.com',
  name: 'Test Admin',
  role: 'ADMIN' as const,
  prodi: null
};

const testStaffOtherProdi = {
  email: 'staff@test.com',
  name: 'Test Staff Other Prodi',
  role: 'STAFF_PRODI' as const,
  prodi: 'Teknik Mesin'
};

describe('getTrackingLogs', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return tracking logs for valid request without user permission check', async () => {
    // Create test data
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Mahasiswa',
      purpose: 'Test purpose',
      priority: 'NORMAL',
      status: 'DRAFT'
    }).returning().execute();

    // Create tracking logs with slight delay to ensure chronological order
    const [log1] = await db.insert(trackingLogsTable).values({
      letter_request_id: letterRequest.id,
      user_id: user.id,
      action_type: 'CREATED',
      description: 'Request created',
      notes: 'Initial creation',
      previous_status: null,
      new_status: 'DRAFT'
    }).returning().execute();

    // Add small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    const [log2] = await db.insert(trackingLogsTable).values({
      letter_request_id: letterRequest.id,
      user_id: user.id,
      action_type: 'APPROVED',
      description: 'Request approved by Kaprodi',
      notes: null,
      previous_status: 'DRAFT',
      new_status: 'APPROVED_KAPRODI'
    }).returning().execute();

    // Get tracking logs without user ID (no permission check)
    const result = await getTrackingLogs(letterRequest.id);

    expect(result).toHaveLength(2);
    expect(result[0].action_type).toEqual('CREATED');
    expect(result[0].description).toEqual('Request created');
    expect(result[0].notes).toEqual('Initial creation');
    expect(result[0].previous_status).toBeNull();
    expect(result[0].new_status).toEqual('DRAFT');
    
    expect(result[1].action_type).toEqual('APPROVED');
    expect(result[1].description).toEqual('Request approved by Kaprodi');
    expect(result[1].notes).toBeNull();
    expect(result[1].previous_status).toEqual('DRAFT');
    expect(result[1].new_status).toEqual('APPROVED_KAPRODI');

    // Verify chronological order
    expect(result[0].created_at <= result[1].created_at).toBe(true);
  });

  it('should allow request creator to view tracking logs', async () => {
    // Create test data
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Mahasiswa',
      purpose: 'Test purpose',
      priority: 'NORMAL',
      status: 'DRAFT'
    }).returning().execute();

    await db.insert(trackingLogsTable).values({
      letter_request_id: letterRequest.id,
      user_id: user.id,
      action_type: 'CREATED',
      description: 'Request created',
      notes: null,
      previous_status: null,
      new_status: 'DRAFT'
    }).execute();

    // Creator should be able to view
    const result = await getTrackingLogs(letterRequest.id, user.id);

    expect(result).toHaveLength(1);
    expect(result[0].action_type).toEqual('CREATED');
  });

  it('should allow current handler to view tracking logs', async () => {
    // Create users
    const [creator] = await db.insert(usersTable).values(testUser).returning().execute();
    const [handler] = await db.insert(usersTable).values({
      ...testAdmin,
      email: 'handler@test.com',
      name: 'Test Handler',
      role: 'DEKAN'
    }).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: creator.id,
      current_handler_user_id: handler.id,
      letter_type: 'Surat Keterangan Mahasiswa',
      purpose: 'Test purpose',
      priority: 'NORMAL',
      status: 'FORWARDED_TO_DEKAN'
    }).returning().execute();

    await db.insert(trackingLogsTable).values({
      letter_request_id: letterRequest.id,
      user_id: creator.id,
      action_type: 'CREATED',
      description: 'Request created',
      notes: null,
      previous_status: null,
      new_status: 'DRAFT'
    }).execute();

    // Current handler should be able to view
    const result = await getTrackingLogs(letterRequest.id, handler.id);

    expect(result).toHaveLength(1);
    expect(result[0].action_type).toEqual('CREATED');
  });

  it('should allow admin and high-level roles to view tracking logs', async () => {
    // Create test data
    const [creator] = await db.insert(usersTable).values(testUser).returning().execute();
    const [admin] = await db.insert(usersTable).values(testAdmin).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: creator.id,
      letter_type: 'Surat Keterangan Mahasiswa',
      purpose: 'Test purpose',
      priority: 'NORMAL',
      status: 'DRAFT'
    }).returning().execute();

    await db.insert(trackingLogsTable).values({
      letter_request_id: letterRequest.id,
      user_id: creator.id,
      action_type: 'CREATED',
      description: 'Request created',
      notes: null,
      previous_status: null,
      new_status: 'DRAFT'
    }).execute();

    // Admin should be able to view
    const result = await getTrackingLogs(letterRequest.id, admin.id);

    expect(result).toHaveLength(1);
    expect(result[0].action_type).toEqual('CREATED');
  });

  it('should allow same prodi staff to view tracking logs', async () => {
    // Create users from same prodi
    const [creator] = await db.insert(usersTable).values(testUser).returning().execute();
    const [staffSameProdi] = await db.insert(usersTable).values({
      email: 'staff_same@test.com',
      name: 'Staff Same Prodi',
      role: 'STAFF_PRODI',
      prodi: 'Informatika'
    }).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: creator.id,
      letter_type: 'Surat Keterangan Mahasiswa',
      purpose: 'Test purpose',
      priority: 'NORMAL',
      status: 'DRAFT'
    }).returning().execute();

    await db.insert(trackingLogsTable).values({
      letter_request_id: letterRequest.id,
      user_id: creator.id,
      action_type: 'CREATED',
      description: 'Request created',
      notes: null,
      previous_status: null,
      new_status: 'DRAFT'
    }).execute();

    // Staff from same prodi should be able to view
    const result = await getTrackingLogs(letterRequest.id, staffSameProdi.id);

    expect(result).toHaveLength(1);
    expect(result[0].action_type).toEqual('CREATED');
  });

  it('should deny access to users without permission', async () => {
    // Create test data
    const [creator] = await db.insert(usersTable).values(testUser).returning().execute();
    const [unauthorizedUser] = await db.insert(usersTable).values(testStaffOtherProdi).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: creator.id,
      letter_type: 'Surat Keterangan Mahasiswa',
      purpose: 'Test purpose',
      priority: 'NORMAL',
      status: 'DRAFT'
    }).returning().execute();

    await db.insert(trackingLogsTable).values({
      letter_request_id: letterRequest.id,
      user_id: creator.id,
      action_type: 'CREATED',
      description: 'Request created',
      notes: null,
      previous_status: null,
      new_status: 'DRAFT'
    }).execute();

    // Unauthorized user should get empty array
    const result = await getTrackingLogs(letterRequest.id, unauthorizedUser.id);

    expect(result).toHaveLength(0);
  });

  it('should return empty array for non-existent request', async () => {
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();

    // Non-existent request should return empty array
    const result = await getTrackingLogs(999999, user.id);

    expect(result).toHaveLength(0);
  });

  it('should return empty array for non-existent user', async () => {
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Mahasiswa',
      purpose: 'Test purpose',
      priority: 'NORMAL',
      status: 'DRAFT'
    }).returning().execute();

    await db.insert(trackingLogsTable).values({
      letter_request_id: letterRequest.id,
      user_id: user.id,
      action_type: 'CREATED',
      description: 'Request created',
      notes: null,
      previous_status: null,
      new_status: 'DRAFT'
    }).execute();

    // Non-existent user should return empty array
    const result = await getTrackingLogs(letterRequest.id, 999999);

    expect(result).toHaveLength(0);
  });

  it('should return tracking logs in chronological order', async () => {
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Mahasiswa',
      purpose: 'Test purpose',
      priority: 'NORMAL',
      status: 'DRAFT'
    }).returning().execute();

    // Create tracking logs with different timestamps
    const now = new Date();
    const earlier = new Date(now.getTime() - 3600000); // 1 hour earlier
    const later = new Date(now.getTime() + 3600000); // 1 hour later

    // Insert in non-chronological order
    await db.insert(trackingLogsTable).values([
      {
        letter_request_id: letterRequest.id,
        user_id: user.id,
        action_type: 'FORWARDED',
        description: 'Later action',
        notes: null,
        previous_status: 'APPROVED_KAPRODI',
        new_status: 'FORWARDED_TO_DEKAN'
      },
      {
        letter_request_id: letterRequest.id,
        user_id: user.id,
        action_type: 'CREATED',
        description: 'First action',
        notes: null,
        previous_status: null,
        new_status: 'DRAFT'
      },
      {
        letter_request_id: letterRequest.id,
        user_id: user.id,
        action_type: 'APPROVED',
        description: 'Middle action',
        notes: null,
        previous_status: 'DRAFT',
        new_status: 'APPROVED_KAPRODI'
      }
    ]).execute();

    const result = await getTrackingLogs(letterRequest.id);

    // Should be ordered by created_at ascending (chronological)
    expect(result).toHaveLength(3);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].created_at <= result[i + 1].created_at).toBe(true);
    }
  });

  it('should handle multiple tracking logs with all required fields', async () => {
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [student] = await db.insert(studentsTable).values(testStudent).returning().execute();
    
    const [letterRequest] = await db.insert(letterRequestsTable).values({
      student_id: student.id,
      created_by_user_id: user.id,
      letter_type: 'Surat Keterangan Mahasiswa',
      purpose: 'Test purpose',
      priority: 'NORMAL',
      status: 'DRAFT'
    }).returning().execute();

    await db.insert(trackingLogsTable).values({
      letter_request_id: letterRequest.id,
      user_id: user.id,
      action_type: 'CREATED',
      description: 'Request created by staff',
      notes: 'Student requested urgent processing',
      previous_status: null,
      new_status: 'DRAFT'
    }).execute();

    const result = await getTrackingLogs(letterRequest.id);

    expect(result).toHaveLength(1);
    const log = result[0];
    
    // Verify all fields are properly mapped
    expect(log.id).toBeDefined();
    expect(log.letter_request_id).toEqual(letterRequest.id);
    expect(log.user_id).toEqual(user.id);
    expect(log.action_type).toEqual('CREATED');
    expect(log.description).toEqual('Request created by staff');
    expect(log.notes).toEqual('Student requested urgent processing');
    expect(log.previous_status).toBeNull();
    expect(log.new_status).toEqual('DRAFT');
    expect(log.created_at).toBeInstanceOf(Date);
  });
});