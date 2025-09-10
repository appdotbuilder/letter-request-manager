import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { trackingLogsTable, usersTable, studentsTable, letterRequestsTable } from '../db/schema';
import { type AddTrackingLogInput } from '../schema';
import { addTrackingLog } from '../handlers/add_tracking_log';
import { eq } from 'drizzle-orm';

describe('addTrackingLog', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: number;
  let testStudentId: number;
  let testRequestId: number;

  beforeEach(async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        name: 'Test User',
        role: 'STAFF_PRODI',
        prodi: 'Teknik Informatika'
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Create test student
    const studentResult = await db.insert(studentsTable)
      .values({
        nim: '123456789',
        name: 'Test Student',
        prodi: 'Teknik Informatika'
      })
      .returning()
      .execute();
    testStudentId = studentResult[0].id;

    // Create test letter request
    const requestResult = await db.insert(letterRequestsTable)
      .values({
        student_id: testStudentId,
        created_by_user_id: testUserId,
        letter_type: 'Surat Keterangan Aktif',
        purpose: 'Beasiswa',
        priority: 'NORMAL',
        status: 'DRAFT'
      })
      .returning()
      .execute();
    testRequestId = requestResult[0].id;
  });

  it('should add a basic tracking log', async () => {
    const input: AddTrackingLogInput = {
      request_id: testRequestId,
      action_type: 'CREATED',
      description: 'Letter request created'
    };

    const result = await addTrackingLog(input, testUserId);

    expect(result.id).toBeDefined();
    expect(result.letter_request_id).toEqual(testRequestId);
    expect(result.user_id).toEqual(testUserId);
    expect(result.action_type).toEqual('CREATED');
    expect(result.description).toEqual('Letter request created');
    expect(result.notes).toBeNull();
    expect(result.previous_status).toBeNull();
    expect(result.new_status).toBeNull();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should add a tracking log with all optional fields', async () => {
    const input: AddTrackingLogInput = {
      request_id: testRequestId,
      action_type: 'APPROVED',
      description: 'Request approved by Kaprodi',
      notes: 'Approved quickly due to urgent priority',
      previous_status: 'DRAFT',
      new_status: 'APPROVED_KAPRODI'
    };

    const result = await addTrackingLog(input, testUserId);

    expect(result.id).toBeDefined();
    expect(result.letter_request_id).toEqual(testRequestId);
    expect(result.user_id).toEqual(testUserId);
    expect(result.action_type).toEqual('APPROVED');
    expect(result.description).toEqual('Request approved by Kaprodi');
    expect(result.notes).toEqual('Approved quickly due to urgent priority');
    expect(result.previous_status).toEqual('DRAFT');
    expect(result.new_status).toEqual('APPROVED_KAPRODI');
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save tracking log to database', async () => {
    const input: AddTrackingLogInput = {
      request_id: testRequestId,
      action_type: 'FORWARDED',
      description: 'Request forwarded to Dekan',
      notes: 'Forwarded with recommendation',
      previous_status: 'APPROVED_KAPRODI',
      new_status: 'FORWARDED_TO_DEKAN'
    };

    const result = await addTrackingLog(input, testUserId);

    // Query the database to verify the log was saved
    const logs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.id, result.id))
      .execute();

    expect(logs).toHaveLength(1);
    const savedLog = logs[0];
    expect(savedLog.letter_request_id).toEqual(testRequestId);
    expect(savedLog.user_id).toEqual(testUserId);
    expect(savedLog.action_type).toEqual('FORWARDED');
    expect(savedLog.description).toEqual('Request forwarded to Dekan');
    expect(savedLog.notes).toEqual('Forwarded with recommendation');
    expect(savedLog.previous_status).toEqual('APPROVED_KAPRODI');
    expect(savedLog.new_status).toEqual('FORWARDED_TO_DEKAN');
    expect(savedLog.created_at).toBeInstanceOf(Date);
  });

  it('should handle different action types', async () => {
    const actionTypes: Array<AddTrackingLogInput['action_type']> = [
      'CREATED',
      'APPROVED', 
      'REJECTED',
      'FORWARDED',
      'DISPOSISI_ASSIGNED',
      'PROCESSED',
      'ESCALATED',
      'SIGNED',
      'RETURNED',
      'PRINTED',
      'DELIVERED',
      'ARCHIVED',
      'NOTE_ADDED',
      'DOCUMENT_UPLOADED'
    ];

    for (const actionType of actionTypes) {
      const input: AddTrackingLogInput = {
        request_id: testRequestId,
        action_type: actionType,
        description: `Test action: ${actionType}`
      };

      const result = await addTrackingLog(input, testUserId);
      expect(result.action_type).toEqual(actionType);
      expect(result.description).toEqual(`Test action: ${actionType}`);
    }
  });

  it('should throw error for non-existent letter request', async () => {
    const input: AddTrackingLogInput = {
      request_id: 99999,
      action_type: 'CREATED',
      description: 'Test log'
    };

    await expect(addTrackingLog(input, testUserId))
      .rejects.toThrow(/Letter request with ID 99999 not found/i);
  });

  it('should throw error for non-existent user', async () => {
    const input: AddTrackingLogInput = {
      request_id: testRequestId,
      action_type: 'CREATED',
      description: 'Test log'
    };

    await expect(addTrackingLog(input, 99999))
      .rejects.toThrow(/User with ID 99999 not found/i);
  });

  it('should handle multiple tracking logs for same request', async () => {
    const logs = [
      {
        action_type: 'CREATED' as const,
        description: 'Request created',
        previous_status: undefined,
        new_status: 'DRAFT' as const
      },
      {
        action_type: 'APPROVED' as const,
        description: 'Request approved',
        previous_status: 'DRAFT' as const,
        new_status: 'APPROVED_KAPRODI' as const
      },
      {
        action_type: 'FORWARDED' as const,
        description: 'Request forwarded',
        previous_status: 'APPROVED_KAPRODI' as const,
        new_status: 'FORWARDED_TO_DEKAN' as const
      }
    ];

    const results = [];
    for (const logData of logs) {
      const input: AddTrackingLogInput = {
        request_id: testRequestId,
        action_type: logData.action_type,
        description: logData.description,
        previous_status: logData.previous_status,
        new_status: logData.new_status
      };

      const result = await addTrackingLog(input, testUserId);
      results.push(result);
    }

    // Verify all logs were created with unique IDs
    expect(results).toHaveLength(3);
    const ids = results.map(r => r.id);
    expect(new Set(ids).size).toEqual(3); // All IDs should be unique

    // Verify all logs are in database
    const allLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, testRequestId))
      .execute();

    expect(allLogs).toHaveLength(3);
  });

  it('should handle empty notes correctly', async () => {
    const input: AddTrackingLogInput = {
      request_id: testRequestId,
      action_type: 'NOTE_ADDED',
      description: 'Added empty note',
      notes: ''
    };

    const result = await addTrackingLog(input, testUserId);
    expect(result.notes).toEqual('');
  });

  it('should preserve timestamps correctly', async () => {
    const beforeTime = new Date();
    
    const input: AddTrackingLogInput = {
      request_id: testRequestId,
      action_type: 'CREATED',
      description: 'Timestamp test'
    };

    const result = await addTrackingLog(input, testUserId);
    
    const afterTime = new Date();

    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.created_at.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    expect(result.created_at.getTime()).toBeLessThanOrEqual(afterTime.getTime());
  });
});