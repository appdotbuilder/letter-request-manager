import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, studentsTable, letterRequestsTable, trackingLogsTable } from '../db/schema';
import { type UpdateRequestStatusInput } from '../schema';
import { updateRequestStatus } from '../handlers/update_request_status';
import { eq } from 'drizzle-orm';

describe('updateRequestStatus', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser: any;
  let testStudent: any;
  let testRequest: any;
  let otherUser: any;

  const setupTestData = async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        name: 'Test User',
        role: 'KAPRODI',
        prodi: 'Teknik Informatika'
      })
      .returning()
      .execute();
    testUser = userResult[0];

    // Create another user for permission testing
    const otherUserResult = await db.insert(usersTable)
      .values({
        email: 'other@example.com',
        name: 'Other User',
        role: 'STAFF_PRODI',
        prodi: 'Sistem Informasi'
      })
      .returning()
      .execute();
    otherUser = otherUserResult[0];

    // Create test student
    const studentResult = await db.insert(studentsTable)
      .values({
        nim: '123456789',
        name: 'Test Student',
        prodi: 'Teknik Informatika'
      })
      .returning()
      .execute();
    testStudent = studentResult[0];

    // Create test letter request
    const requestResult = await db.insert(letterRequestsTable)
      .values({
        student_id: testStudent.id,
        created_by_user_id: testUser.id,
        letter_type: 'Surat Keterangan Aktif Kuliah',
        purpose: 'Keperluan beasiswa',
        priority: 'NORMAL',
        status: 'DRAFT',
        current_handler_user_id: testUser.id
      })
      .returning()
      .execute();
    testRequest = requestResult[0];
  };

  it('should update request status successfully', async () => {
    await setupTestData();

    const input: UpdateRequestStatusInput = {
      request_id: testRequest.id,
      new_status: 'APPROVED_KAPRODI',
      notes: 'Request approved by Kaprodi'
    };

    const result = await updateRequestStatus(input, testUser.id);

    expect(result.id).toBe(testRequest.id);
    expect(result.status).toBe('APPROVED_KAPRODI');
    expect(result.updated_at).toBeInstanceOf(Date);

    // Verify the request was updated in database
    const updatedRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, testRequest.id))
      .execute();

    expect(updatedRequest[0].status).toBe('APPROVED_KAPRODI');
    expect(updatedRequest[0].updated_at).toBeInstanceOf(Date);
  });

  it('should update current handler when next_handler_user_id is provided', async () => {
    await setupTestData();

    const input: UpdateRequestStatusInput = {
      request_id: testRequest.id,
      new_status: 'FORWARDED_TO_DEKAN',
      next_handler_user_id: otherUser.id,
      notes: 'Forwarded to Dean'
    };

    const result = await updateRequestStatus(input, testUser.id);

    expect(result.current_handler_user_id).toBe(otherUser.id);

    // Verify in database
    const updatedRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, testRequest.id))
      .execute();

    expect(updatedRequest[0].current_handler_user_id).toBe(otherUser.id);
  });

  it('should create tracking log entry', async () => {
    await setupTestData();

    const input: UpdateRequestStatusInput = {
      request_id: testRequest.id,
      new_status: 'APPROVED_KAPRODI',
      notes: 'Request approved'
    };

    await updateRequestStatus(input, testUser.id);

    // Check tracking log was created
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, testRequest.id))
      .execute();

    expect(trackingLogs).toHaveLength(1);
    expect(trackingLogs[0].user_id).toBe(testUser.id);
    expect(trackingLogs[0].action_type).toBe('APPROVED');
    expect(trackingLogs[0].description).toBe('Status updated from DRAFT to APPROVED_KAPRODI');
    expect(trackingLogs[0].notes).toBe('Request approved');
    expect(trackingLogs[0].previous_status).toBe('DRAFT');
    expect(trackingLogs[0].new_status).toBe('APPROVED_KAPRODI');
    expect(trackingLogs[0].created_at).toBeInstanceOf(Date);
  });

  it('should allow creator to update request when not current handler', async () => {
    await setupTestData();

    // Update request to have different current handler
    await db.update(letterRequestsTable)
      .set({ current_handler_user_id: otherUser.id })
      .where(eq(letterRequestsTable.id, testRequest.id))
      .execute();

    const input: UpdateRequestStatusInput = {
      request_id: testRequest.id,
      new_status: 'APPROVED_KAPRODI',
      notes: 'Updated by creator'
    };

    // Creator should still be able to update
    const result = await updateRequestStatus(input, testUser.id);
    expect(result.status).toBe('APPROVED_KAPRODI');
  });

  it('should throw error when request not found', async () => {
    await setupTestData();

    const input: UpdateRequestStatusInput = {
      request_id: 999999, // Non-existent ID
      new_status: 'APPROVED_KAPRODI'
    };

    expect(updateRequestStatus(input, testUser.id))
      .rejects.toThrow(/Letter request with ID 999999 not found/);
  });

  it('should throw error when user has no permission', async () => {
    await setupTestData();

    const input: UpdateRequestStatusInput = {
      request_id: testRequest.id,
      new_status: 'APPROVED_KAPRODI'
    };

    // Try to update with unauthorized user
    expect(updateRequestStatus(input, otherUser.id))
      .rejects.toThrow(/User does not have permission to update this request/);
  });

  it('should handle update without notes', async () => {
    await setupTestData();

    const input: UpdateRequestStatusInput = {
      request_id: testRequest.id,
      new_status: 'APPROVED_KAPRODI'
    };

    const result = await updateRequestStatus(input, testUser.id);
    expect(result.status).toBe('APPROVED_KAPRODI');

    // Check tracking log has no notes
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, testRequest.id))
      .execute();

    expect(trackingLogs[0].notes).toBeNull();
  });

  it('should handle status change to rejected', async () => {
    await setupTestData();

    const input: UpdateRequestStatusInput = {
      request_id: testRequest.id,
      new_status: 'REJECTED',
      notes: 'Incomplete documentation'
    };

    const result = await updateRequestStatus(input, testUser.id);
    expect(result.status).toBe('REJECTED');

    // Verify tracking log
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, testRequest.id))
      .execute();

    expect(trackingLogs[0].new_status).toBe('REJECTED');
    expect(trackingLogs[0].notes).toBe('Incomplete documentation');
  });

  it('should update timestamp correctly', async () => {
    await setupTestData();

    const originalTimestamp = testRequest.updated_at;
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    const input: UpdateRequestStatusInput = {
      request_id: testRequest.id,
      new_status: 'APPROVED_KAPRODI'
    };

    const result = await updateRequestStatus(input, testUser.id);

    expect(result.updated_at.getTime()).toBeGreaterThan(originalTimestamp.getTime());
  });
});