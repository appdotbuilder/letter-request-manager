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
import { type ProcessDispositionInput } from '../schema';
import { processDisposition } from '../handlers/process_disposition';
import { eq, and } from 'drizzle-orm';

// Test data
const testUser = {
  email: 'wd1@university.edu',
  name: 'WD1 User',
  role: 'WD1' as const,
  prodi: null
};

const testStudent = {
  nim: '12345678',
  name: 'Test Student',
  prodi: 'Teknik Informatika'
};

const testDekan = {
  email: 'dekan@university.edu',
  name: 'Dekan User',
  role: 'DEKAN' as const,
  prodi: null
};

const testAdmin = {
  email: 'admin@university.edu',
  name: 'Admin User',
  role: 'ADMIN' as const,
  prodi: null
};

const testWD2 = {
  email: 'wd2@university.edu',
  name: 'WD2 User',
  role: 'WD2' as const,
  prodi: null
};

describe('processDisposition', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should process disposition assignment successfully', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([testUser, testDekan])
      .returning()
      .execute();
    
    const wd1User = users[0];
    const dekanUser = users[1];

    // Create test student
    const students = await db.insert(studentsTable)
      .values(testStudent)
      .returning()
      .execute();
    
    const student = students[0];

    // Create letter request
    const requests = await db.insert(letterRequestsTable)
      .values({
        student_id: student.id,
        created_by_user_id: wd1User.id,
        letter_type: 'Surat Keterangan Aktif',
        purpose: 'Keperluan beasiswa',
        priority: 'NORMAL',
        status: 'DISPOSISI_TO_WD1',
        current_handler_user_id: wd1User.id
      })
      .returning()
      .execute();

    const request = requests[0];

    // Create disposition assignment
    const assignments = await db.insert(dispositionAssignmentsTable)
      .values({
        letter_request_id: request.id,
        assigned_to_user_id: wd1User.id,
        assigned_by_user_id: dekanUser.id,
        instructions: 'Process this request',
        order_sequence: 1,
        is_completed: false
      })
      .returning()
      .execute();

    const assignment = assignments[0];

    const input: ProcessDispositionInput = {
      assignment_id: assignment.id,
      notes: 'Processing completed successfully'
    };

    // Execute handler
    const result = await processDisposition(input, wd1User.id);

    // Verify result
    expect(result.id).toBe(assignment.id);
    expect(result.is_completed).toBe(true);
    expect(result.completed_at).toBeInstanceOf(Date);
    expect(result.notes).toBe('Processing completed successfully');

    // Verify database state
    const updatedAssignment = await db.select()
      .from(dispositionAssignmentsTable)
      .where(eq(dispositionAssignmentsTable.id, assignment.id))
      .execute();

    expect(updatedAssignment[0].is_completed).toBe(true);
    expect(updatedAssignment[0].notes).toBe('Processing completed successfully');

    // Verify letter request status
    const updatedRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, request.id))
      .execute();

    expect(updatedRequest[0].status).toBe('TTD_READY');
    expect(updatedRequest[0].current_handler_user_id).toBe(dekanUser.id);

    // Verify tracking log
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, request.id))
      .execute();

    expect(trackingLogs).toHaveLength(1);
    expect(trackingLogs[0].action_type).toBe('PROCESSED');
    expect(trackingLogs[0].user_id).toBe(wd1User.id);
    expect(trackingLogs[0].description).toBe('All disposition assignments completed, ready for signing');
    expect(trackingLogs[0].previous_status).toBe('DISPOSISI_TO_WD1');
    expect(trackingLogs[0].new_status).toBe('TTD_READY');
  });

  it('should handle escalation correctly', async () => {
    // Create test users including admin
    const users = await db.insert(usersTable)
      .values([testUser, testAdmin])
      .returning()
      .execute();
    
    const wd1User = users[0];
    const adminUser = users[1];

    // Create test student
    const students = await db.insert(studentsTable)
      .values(testStudent)
      .returning()
      .execute();
    
    const student = students[0];

    // Create letter request
    const requests = await db.insert(letterRequestsTable)
      .values({
        student_id: student.id,
        created_by_user_id: wd1User.id,
        letter_type: 'Surat Keterangan Aktif',
        purpose: 'Keperluan beasiswa',
        priority: 'URGENT',
        status: 'DISPOSISI_TO_WD1',
        current_handler_user_id: wd1User.id
      })
      .returning()
      .execute();

    const request = requests[0];

    // Create disposition assignment
    const assignments = await db.insert(dispositionAssignmentsTable)
      .values({
        letter_request_id: request.id,
        assigned_to_user_id: wd1User.id,
        assigned_by_user_id: adminUser.id,
        instructions: 'Process this urgent request',
        order_sequence: 1,
        is_completed: false
      })
      .returning()
      .execute();

    const assignment = assignments[0];

    const input: ProcessDispositionInput = {
      assignment_id: assignment.id,
      notes: 'Complex case requiring escalation',
      escalate: true
    };

    // Execute handler
    const result = await processDisposition(input, wd1User.id);

    // Verify result
    expect(result.is_completed).toBe(true);
    expect(result.notes).toBe('Complex case requiring escalation');

    // Verify letter request status changed to escalated
    const updatedRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, request.id))
      .execute();

    expect(updatedRequest[0].status).toBe('ESCALATED');
    expect(updatedRequest[0].current_handler_user_id).toBe(adminUser.id);

    // Verify tracking log shows escalation
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, request.id))
      .execute();

    expect(trackingLogs[0].action_type).toBe('ESCALATED');
    expect(trackingLogs[0].description).toBe('Request escalated to admin');
  });

  it('should handle coordination flag correctly', async () => {
    // Create test users including dekan
    const users = await db.insert(usersTable)
      .values([testUser, testDekan])
      .returning()
      .execute();
    
    const wd1User = users[0];
    const dekanUser = users[1];

    // Create test student
    const students = await db.insert(studentsTable)
      .values(testStudent)
      .returning()
      .execute();
    
    const student = students[0];

    // Create letter request
    const requests = await db.insert(letterRequestsTable)
      .values({
        student_id: student.id,
        created_by_user_id: wd1User.id,
        letter_type: 'Surat Keterangan Aktif',
        purpose: 'Keperluan beasiswa',
        priority: 'NORMAL',
        status: 'DISPOSISI_TO_WD1',
        current_handler_user_id: wd1User.id
      })
      .returning()
      .execute();

    const request = requests[0];

    // Create disposition assignment
    const assignments = await db.insert(dispositionAssignmentsTable)
      .values({
        letter_request_id: request.id,
        assigned_to_user_id: wd1User.id,
        assigned_by_user_id: dekanUser.id,
        instructions: 'Process this request',
        order_sequence: 1,
        is_completed: false
      })
      .returning()
      .execute();

    const assignment = assignments[0];

    const input: ProcessDispositionInput = {
      assignment_id: assignment.id,
      notes: 'Requires dean coordination',
      flag_for_coordination: true
    };

    // Execute handler
    const result = await processDisposition(input, wd1User.id);

    // Verify result
    expect(result.is_completed).toBe(true);
    expect(result.notes).toBe('Requires dean coordination');

    // Verify letter request status forwarded to dekan
    const updatedRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, request.id))
      .execute();

    expect(updatedRequest[0].status).toBe('FORWARDED_TO_DEKAN');
    expect(updatedRequest[0].current_handler_user_id).toBe(dekanUser.id);

    // Verify tracking log shows coordination
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, request.id))
      .execute();

    expect(trackingLogs[0].action_type).toBe('PROCESSED');
    expect(trackingLogs[0].description).toBe('Request flagged for dean coordination');
  });

  it('should move to next assignment in sequence', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([testUser, testWD2, testDekan])
      .returning()
      .execute();
    
    const wd1User = users[0];
    const wd2User = users[1];
    const dekanUser = users[2];

    // Create test student
    const students = await db.insert(studentsTable)
      .values(testStudent)
      .returning()
      .execute();
    
    const student = students[0];

    // Create letter request
    const requests = await db.insert(letterRequestsTable)
      .values({
        student_id: student.id,
        created_by_user_id: wd1User.id,
        letter_type: 'Surat Keterangan Aktif',
        purpose: 'Keperluan beasiswa',
        priority: 'NORMAL',
        status: 'DISPOSISI_TO_WD1',
        current_handler_user_id: wd1User.id
      })
      .returning()
      .execute();

    const request = requests[0];

    // Create multiple disposition assignments
    await db.insert(dispositionAssignmentsTable)
      .values([
        {
          letter_request_id: request.id,
          assigned_to_user_id: wd1User.id,
          assigned_by_user_id: dekanUser.id,
          instructions: 'First assignment',
          order_sequence: 1,
          is_completed: false
        },
        {
          letter_request_id: request.id,
          assigned_to_user_id: wd2User.id,
          assigned_by_user_id: dekanUser.id,
          instructions: 'Second assignment',
          order_sequence: 2,
          is_completed: false
        }
      ])
      .execute();

    // Get first assignment
    const firstAssignment = await db.select()
      .from(dispositionAssignmentsTable)
      .where(
        and(
          eq(dispositionAssignmentsTable.letter_request_id, request.id),
          eq(dispositionAssignmentsTable.order_sequence, 1)
        )
      )
      .execute();

    const input: ProcessDispositionInput = {
      assignment_id: firstAssignment[0].id,
      notes: 'First assignment completed'
    };

    // Execute handler
    const result = await processDisposition(input, wd1User.id);

    // Verify result
    expect(result.is_completed).toBe(true);
    expect(result.notes).toBe('First assignment completed');

    // Verify letter request moved to next handler
    const updatedRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, request.id))
      .execute();

    expect(updatedRequest[0].current_handler_user_id).toBe(wd2User.id);

    // Verify tracking log
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, request.id))
      .execute();

    expect(trackingLogs[0].description).toBe('Disposition assignment completed');
  });

  it('should throw error for invalid assignment', async () => {
    const input: ProcessDispositionInput = {
      assignment_id: 999, // Non-existent assignment
      notes: 'Test notes'
    };

    expect(processDisposition(input, 1)).rejects.toThrow(/Assignment not found/);
  });

  it('should throw error when user not assigned to disposition', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([testUser, testWD2])
      .returning()
      .execute();
    
    const wd1User = users[0];
    const wd2User = users[1];

    // Create test student
    const students = await db.insert(studentsTable)
      .values(testStudent)
      .returning()
      .execute();
    
    const student = students[0];

    // Create letter request
    const requests = await db.insert(letterRequestsTable)
      .values({
        student_id: student.id,
        created_by_user_id: wd1User.id,
        letter_type: 'Surat Keterangan Aktif',
        purpose: 'Keperluan beasiswa',
        priority: 'NORMAL',
        status: 'DISPOSISI_TO_WD1',
        current_handler_user_id: wd1User.id
      })
      .returning()
      .execute();

    const request = requests[0];

    // Create disposition assignment for WD1
    const assignments = await db.insert(dispositionAssignmentsTable)
      .values({
        letter_request_id: request.id,
        assigned_to_user_id: wd1User.id,
        assigned_by_user_id: wd1User.id,
        instructions: 'Process this request',
        order_sequence: 1,
        is_completed: false
      })
      .returning()
      .execute();

    const assignment = assignments[0];

    const input: ProcessDispositionInput = {
      assignment_id: assignment.id,
      notes: 'Test notes'
    };

    // Try to process with wrong user (WD2 instead of WD1)
    expect(processDisposition(input, wd2User.id)).rejects.toThrow(/Assignment not found/);
  });

  it('should throw error when assignment already completed', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const wd1User = users[0];

    // Create test student
    const students = await db.insert(studentsTable)
      .values(testStudent)
      .returning()
      .execute();
    
    const student = students[0];

    // Create letter request
    const requests = await db.insert(letterRequestsTable)
      .values({
        student_id: student.id,
        created_by_user_id: wd1User.id,
        letter_type: 'Surat Keterangan Aktif',
        purpose: 'Keperluan beasiswa',
        priority: 'NORMAL',
        status: 'DISPOSISI_TO_WD1',
        current_handler_user_id: wd1User.id
      })
      .returning()
      .execute();

    const request = requests[0];

    // Create already completed disposition assignment
    const assignments = await db.insert(dispositionAssignmentsTable)
      .values({
        letter_request_id: request.id,
        assigned_to_user_id: wd1User.id,
        assigned_by_user_id: wd1User.id,
        instructions: 'Process this request',
        order_sequence: 1,
        is_completed: true, // Already completed
        completed_at: new Date()
      })
      .returning()
      .execute();

    const assignment = assignments[0];

    const input: ProcessDispositionInput = {
      assignment_id: assignment.id,
      notes: 'Test notes'
    };

    // Try to process already completed assignment
    expect(processDisposition(input, wd1User.id)).rejects.toThrow(/Assignment not found/);
  });
});