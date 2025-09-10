import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  studentsTable,
  letterRequestsTable, 
  dispositionAssignmentsTable,
  trackingLogsTable 
} from '../db/schema';
import { type CreateDispositionInput } from '../schema';
import { createDisposition } from '../handlers/create_disposition';
import { eq } from 'drizzle-orm';

describe('createDisposition', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let dekanUser: any;
  let wd1User: any;
  let kabagtUser: any;
  let student: any;
  let letterRequest: any;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'dekan@university.edu',
          name: 'Dekan Faculty',
          role: 'DEKAN',
          prodi: null
        },
        {
          email: 'wd1@university.edu',
          name: 'WD1 Officer',
          role: 'WD1',
          prodi: null
        },
        {
          email: 'kabag@university.edu',
          name: 'Kabag TU',
          role: 'KABAG_TU',
          prodi: null
        },
        {
          email: 'staff@university.edu',
          name: 'Staff Prodi',
          role: 'STAFF_PRODI',
          prodi: 'Teknik Informatika'
        }
      ])
      .returning()
      .execute();

    dekanUser = users[0];
    wd1User = users[1];
    kabagtUser = users[2];
    const staffUser = users[3];

    // Create test student
    const students = await db.insert(studentsTable)
      .values({
        nim: '123456789',
        name: 'Test Student',
        prodi: 'Teknik Informatika'
      })
      .returning()
      .execute();

    student = students[0];

    // Create test letter request in FORWARDED_TO_DEKAN status
    const letterRequests = await db.insert(letterRequestsTable)
      .values({
        student_id: student.id,
        created_by_user_id: staffUser.id,
        letter_type: 'Surat Keterangan Aktif',
        purpose: 'Keperluan beasiswa',
        priority: 'NORMAL',
        status: 'FORWARDED_TO_DEKAN',
        current_handler_user_id: dekanUser.id
      })
      .returning()
      .execute();

    letterRequest = letterRequests[0];
  });

  it('should create disposition assignments successfully', async () => {
    const input: CreateDispositionInput = {
      request_id: letterRequest.id,
      instructions: 'Please process this letter request according to university procedures',
      assignments: [
        {
          user_id: wd1User.id,
          order_sequence: 1
        },
        {
          user_id: kabagtUser.id,
          order_sequence: 2
        }
      ]
    };

    const result = await createDisposition(input, dekanUser.id);

    // Verify disposition assignments were created
    expect(result).toHaveLength(2);
    expect(result[0].letter_request_id).toEqual(letterRequest.id);
    expect(result[0].assigned_to_user_id).toEqual(wd1User.id);
    expect(result[0].assigned_by_user_id).toEqual(dekanUser.id);
    expect(result[0].instructions).toEqual(input.instructions);
    expect(result[0].order_sequence).toEqual(1);
    expect(result[0].is_completed).toBe(false);
    expect(result[0].id).toBeDefined();
    expect(result[0].created_at).toBeInstanceOf(Date);

    expect(result[1].assigned_to_user_id).toEqual(kabagtUser.id);
    expect(result[1].order_sequence).toEqual(2);
  });

  it('should update letter request status and handler correctly', async () => {
    const input: CreateDispositionInput = {
      request_id: letterRequest.id,
      instructions: 'Process with high priority',
      assignments: [
        {
          user_id: wd1User.id,
          order_sequence: 1
        }
      ]
    };

    await createDisposition(input, dekanUser.id);

    // Verify letter request was updated
    const updatedRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, letterRequest.id))
      .execute();

    expect(updatedRequest[0].status).toEqual('DISPOSISI_TO_WD1');
    expect(updatedRequest[0].current_handler_user_id).toEqual(wd1User.id);
    expect(updatedRequest[0].dekan_instructions).toEqual(input.instructions);
    expect(updatedRequest[0].updated_at).toBeInstanceOf(Date);
  });

  it('should create tracking log entry', async () => {
    const input: CreateDispositionInput = {
      request_id: letterRequest.id,
      instructions: 'Handle with care',
      assignments: [
        {
          user_id: wd1User.id,
          order_sequence: 1
        }
      ]
    };

    await createDisposition(input, dekanUser.id);

    // Verify tracking log was created
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, letterRequest.id))
      .execute();

    expect(trackingLogs).toHaveLength(1);
    expect(trackingLogs[0].user_id).toEqual(dekanUser.id);
    expect(trackingLogs[0].action_type).toEqual('DISPOSISI_ASSIGNED');
    expect(trackingLogs[0].description).toContain('Disposition assignments created by Dekan for 1 officers');
    expect(trackingLogs[0].notes).toEqual(input.instructions);
    expect(trackingLogs[0].previous_status).toEqual('FORWARDED_TO_DEKAN');
    expect(trackingLogs[0].new_status).toEqual('DISPOSISI_TO_WD1');
  });

  it('should reject if user is not Dekan', async () => {
    const input: CreateDispositionInput = {
      request_id: letterRequest.id,
      instructions: 'Test instructions',
      assignments: [
        {
          user_id: wd1User.id,
          order_sequence: 1
        }
      ]
    };

    await expect(createDisposition(input, wd1User.id)).rejects.toThrow(/Only Dekan can create disposition assignments/i);
  });

  it('should reject if letter request not found', async () => {
    const input: CreateDispositionInput = {
      request_id: 99999,
      instructions: 'Test instructions',
      assignments: [
        {
          user_id: wd1User.id,
          order_sequence: 1
        }
      ]
    };

    await expect(createDisposition(input, dekanUser.id)).rejects.toThrow(/Letter request not found/i);
  });

  it('should reject if assigned user does not exist', async () => {
    const input: CreateDispositionInput = {
      request_id: letterRequest.id,
      instructions: 'Test instructions',
      assignments: [
        {
          user_id: 99999,
          order_sequence: 1
        }
      ]
    };

    await expect(createDisposition(input, dekanUser.id)).rejects.toThrow(/Assigned user with ID 99999 not found/i);
  });

  it('should save disposition assignments to database', async () => {
    const input: CreateDispositionInput = {
      request_id: letterRequest.id,
      instructions: 'Database persistence test',
      assignments: [
        {
          user_id: wd1User.id,
          order_sequence: 1
        },
        {
          user_id: kabagtUser.id,
          order_sequence: 2
        }
      ]
    };

    const result = await createDisposition(input, dekanUser.id);

    // Query database directly to verify persistence
    const savedAssignments = await db.select()
      .from(dispositionAssignmentsTable)
      .where(eq(dispositionAssignmentsTable.letter_request_id, letterRequest.id))
      .execute();

    expect(savedAssignments).toHaveLength(2);
    expect(savedAssignments[0].id).toEqual(result[0].id);
    expect(savedAssignments[0].instructions).toEqual(input.instructions);
    expect(savedAssignments[0].assigned_by_user_id).toEqual(dekanUser.id);
    expect(savedAssignments[0].is_completed).toBe(false);
    expect(savedAssignments[0].completed_at).toBeNull();
  });

  it('should handle multiple assignments in correct sequence', async () => {
    const input: CreateDispositionInput = {
      request_id: letterRequest.id,
      instructions: 'Sequential processing required',
      assignments: [
        {
          user_id: wd1User.id,
          order_sequence: 1
        },
        {
          user_id: kabagtUser.id,
          order_sequence: 2
        }
      ]
    };

    const result = await createDisposition(input, dekanUser.id);

    // Verify assignments are ordered correctly
    const sortedResult = result.sort((a, b) => a.order_sequence - b.order_sequence);
    expect(sortedResult[0].assigned_to_user_id).toEqual(wd1User.id);
    expect(sortedResult[0].order_sequence).toEqual(1);
    expect(sortedResult[1].assigned_to_user_id).toEqual(kabagtUser.id);
    expect(sortedResult[1].order_sequence).toEqual(2);

    // Status should match first assigned user
    const updatedRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, letterRequest.id))
      .execute();

    expect(updatedRequest[0].status).toEqual('DISPOSISI_TO_WD1');
    expect(updatedRequest[0].current_handler_user_id).toEqual(wd1User.id);
  });
});