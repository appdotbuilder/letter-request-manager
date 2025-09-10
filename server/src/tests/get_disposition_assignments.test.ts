import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  studentsTable, 
  letterRequestsTable, 
  dispositionAssignmentsTable 
} from '../db/schema';
import { getDispositionAssignments } from '../handlers/get_disposition_assignments';

// Test data setup
const testUser = {
  email: 'test@example.com',
  name: 'Test User',
  role: 'KAPRODI' as const,
  prodi: 'Informatika'
};

const testDekan = {
  email: 'dekan@example.com',
  name: 'Dekan Test',
  role: 'DEKAN' as const,
  prodi: null
};

const testWD1 = {
  email: 'wd1@example.com',
  name: 'WD1 Test',
  role: 'WD1' as const,
  prodi: null
};

const testWD2 = {
  email: 'wd2@example.com',
  name: 'WD2 Test',
  role: 'WD2' as const,
  prodi: null
};

const testStudent = {
  nim: '123456789',
  name: 'Test Student',
  prodi: 'Informatika'
};

describe('getDispositionAssignments', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return disposition assignments sorted by order_sequence', async () => {
    // Create test data
    const users = await db.insert(usersTable)
      .values([testUser, testDekan, testWD1, testWD2])
      .returning()
      .execute();

    const students = await db.insert(studentsTable)
      .values([testStudent])
      .returning()
      .execute();

    const letterRequests = await db.insert(letterRequestsTable)
      .values([{
        student_id: students[0].id,
        created_by_user_id: users[0].id,
        letter_type: 'SURAT_REKOMENDASI',
        purpose: 'Test purpose',
        priority: 'NORMAL' as const,
        status: 'DISPOSISI_TO_WD1' as const,
        current_handler_user_id: users[1].id
      }])
      .returning()
      .execute();

    // Create disposition assignments in different order
    await db.insert(dispositionAssignmentsTable)
      .values([
        {
          letter_request_id: letterRequests[0].id,
          assigned_to_user_id: users[3].id, // WD2
          assigned_by_user_id: users[1].id, // Dekan
          instructions: 'Process second',
          order_sequence: 2,
          is_completed: false
        },
        {
          letter_request_id: letterRequests[0].id,
          assigned_to_user_id: users[2].id, // WD1
          assigned_by_user_id: users[1].id, // Dekan
          instructions: 'Process first',
          order_sequence: 1,
          is_completed: true,
          completed_at: new Date(),
          notes: 'Completed successfully'
        }
      ])
      .execute();

    const result = await getDispositionAssignments(letterRequests[0].id);

    expect(result).toHaveLength(2);
    
    // Should be sorted by order_sequence ascending
    expect(result[0].order_sequence).toBe(1);
    expect(result[0].assigned_to_user_id).toBe(users[2].id); // WD1
    expect(result[0].instructions).toBe('Process first');
    expect(result[0].is_completed).toBe(true);
    expect(result[0].completed_at).toBeInstanceOf(Date);
    expect(result[0].notes).toBe('Completed successfully');

    expect(result[1].order_sequence).toBe(2);
    expect(result[1].assigned_to_user_id).toBe(users[3].id); // WD2
    expect(result[1].instructions).toBe('Process second');
    expect(result[1].is_completed).toBe(false);
    expect(result[1].completed_at).toBeNull();
    expect(result[1].notes).toBeNull();
  });

  it('should return empty array for non-existent request', async () => {
    const result = await getDispositionAssignments(99999);
    expect(result).toHaveLength(0);
  });

  it('should return empty array when no dispositions exist for request', async () => {
    // Create test data without dispositions
    const users = await db.insert(usersTable)
      .values([testUser])
      .returning()
      .execute();

    const students = await db.insert(studentsTable)
      .values([testStudent])
      .returning()
      .execute();

    const letterRequests = await db.insert(letterRequestsTable)
      .values([{
        student_id: students[0].id,
        created_by_user_id: users[0].id,
        letter_type: 'SURAT_REKOMENDASI',
        purpose: 'Test purpose',
        priority: 'NORMAL' as const,
        status: 'DRAFT' as const
      }])
      .returning()
      .execute();

    const result = await getDispositionAssignments(letterRequests[0].id);
    expect(result).toHaveLength(0);
  });

  it('should allow request creator to view dispositions', async () => {
    // Create test data
    const users = await db.insert(usersTable)
      .values([testUser, testDekan])
      .returning()
      .execute();

    const students = await db.insert(studentsTable)
      .values([testStudent])
      .returning()
      .execute();

    const letterRequests = await db.insert(letterRequestsTable)
      .values([{
        student_id: students[0].id,
        created_by_user_id: users[0].id, // Creator
        letter_type: 'SURAT_REKOMENDASI',
        purpose: 'Test purpose',
        priority: 'NORMAL' as const,
        status: 'DISPOSISI_TO_WD1' as const,
        current_handler_user_id: users[1].id
      }])
      .returning()
      .execute();

    await db.insert(dispositionAssignmentsTable)
      .values([{
        letter_request_id: letterRequests[0].id,
        assigned_to_user_id: users[1].id,
        assigned_by_user_id: users[0].id,
        instructions: 'Process this',
        order_sequence: 1,
        is_completed: false
      }])
      .execute();

    // Request creator should be able to view
    const result = await getDispositionAssignments(letterRequests[0].id, users[0].id);
    expect(result).toHaveLength(1);
    expect(result[0].instructions).toBe('Process this');
  });

  it('should allow current handler to view dispositions', async () => {
    // Create test data
    const users = await db.insert(usersTable)
      .values([testUser, testDekan])
      .returning()
      .execute();

    const students = await db.insert(studentsTable)
      .values([testStudent])
      .returning()
      .execute();

    const letterRequests = await db.insert(letterRequestsTable)
      .values([{
        student_id: students[0].id,
        created_by_user_id: users[0].id,
        letter_type: 'SURAT_REKOMENDASI',
        purpose: 'Test purpose',
        priority: 'NORMAL' as const,
        status: 'DISPOSISI_TO_WD1' as const,
        current_handler_user_id: users[1].id // Current handler
      }])
      .returning()
      .execute();

    await db.insert(dispositionAssignmentsTable)
      .values([{
        letter_request_id: letterRequests[0].id,
        assigned_to_user_id: users[1].id,
        assigned_by_user_id: users[0].id,
        instructions: 'Process this',
        order_sequence: 1,
        is_completed: false
      }])
      .execute();

    // Current handler should be able to view
    const result = await getDispositionAssignments(letterRequests[0].id, users[1].id);
    expect(result).toHaveLength(1);
    expect(result[0].instructions).toBe('Process this');
  });

  it('should allow assigned user to view dispositions', async () => {
    // Create test data
    const users = await db.insert(usersTable)
      .values([testUser, testDekan, testWD1])
      .returning()
      .execute();

    const students = await db.insert(studentsTable)
      .values([testStudent])
      .returning()
      .execute();

    const letterRequests = await db.insert(letterRequestsTable)
      .values([{
        student_id: students[0].id,
        created_by_user_id: users[0].id,
        letter_type: 'SURAT_REKOMENDASI',
        purpose: 'Test purpose',
        priority: 'NORMAL' as const,
        status: 'DISPOSISI_TO_WD1' as const,
        current_handler_user_id: users[1].id
      }])
      .returning()
      .execute();

    await db.insert(dispositionAssignmentsTable)
      .values([{
        letter_request_id: letterRequests[0].id,
        assigned_to_user_id: users[2].id, // WD1 is assigned
        assigned_by_user_id: users[1].id, // Dekan assigned
        instructions: 'Process this',
        order_sequence: 1,
        is_completed: false
      }])
      .execute();

    // Assigned user should be able to view
    const result = await getDispositionAssignments(letterRequests[0].id, users[2].id);
    expect(result).toHaveLength(1);
    expect(result[0].instructions).toBe('Process this');
    expect(result[0].assigned_to_user_id).toBe(users[2].id);
  });

  it('should return empty array when user has no permission', async () => {
    // Create test data
    const users = await db.insert(usersTable)
      .values([testUser, testDekan, testWD1])
      .returning()
      .execute();

    const students = await db.insert(studentsTable)
      .values([testStudent])
      .returning()
      .execute();

    const letterRequests = await db.insert(letterRequestsTable)
      .values([{
        student_id: students[0].id,
        created_by_user_id: users[0].id, // Kaprodi created
        letter_type: 'SURAT_REKOMENDASI',
        purpose: 'Test purpose',
        priority: 'NORMAL' as const,
        status: 'DISPOSISI_TO_WD1' as const,
        current_handler_user_id: users[1].id // Dekan is current handler
      }])
      .returning()
      .execute();

    await db.insert(dispositionAssignmentsTable)
      .values([{
        letter_request_id: letterRequests[0].id,
        assigned_to_user_id: users[1].id, // Dekan is assigned
        assigned_by_user_id: users[0].id,
        instructions: 'Process this',
        order_sequence: 1,
        is_completed: false
      }])
      .execute();

    // WD1 user has no permission (not creator, not current handler, not assigned)
    const result = await getDispositionAssignments(letterRequests[0].id, users[2].id);
    expect(result).toHaveLength(0);
  });

  it('should return empty array for non-existent request with userId', async () => {
    const users = await db.insert(usersTable)
      .values([testUser])
      .returning()
      .execute();

    const result = await getDispositionAssignments(99999, users[0].id);
    expect(result).toHaveLength(0);
  });

  it('should handle multiple disposition assignments with mixed completion states', async () => {
    // Create test data
    const users = await db.insert(usersTable)
      .values([testUser, testDekan, testWD1, testWD2])
      .returning()
      .execute();

    const students = await db.insert(studentsTable)
      .values([testStudent])
      .returning()
      .execute();

    const letterRequests = await db.insert(letterRequestsTable)
      .values([{
        student_id: students[0].id,
        created_by_user_id: users[0].id,
        letter_type: 'SURAT_REKOMENDASI',
        purpose: 'Test purpose',
        priority: 'URGENT' as const,
        status: 'PROCESSED_BY_WD1' as const,
        current_handler_user_id: users[2].id
      }])
      .returning()
      .execute();

    const completedDate = new Date();
    completedDate.setHours(completedDate.getHours() - 1);

    await db.insert(dispositionAssignmentsTable)
      .values([
        {
          letter_request_id: letterRequests[0].id,
          assigned_to_user_id: users[2].id, // WD1
          assigned_by_user_id: users[1].id, // Dekan
          instructions: 'First processing step',
          order_sequence: 1,
          is_completed: true,
          completed_at: completedDate,
          notes: 'Completed first step'
        },
        {
          letter_request_id: letterRequests[0].id,
          assigned_to_user_id: users[3].id, // WD2
          assigned_by_user_id: users[1].id, // Dekan
          instructions: 'Second processing step',
          order_sequence: 2,
          is_completed: false
        },
        {
          letter_request_id: letterRequests[0].id,
          assigned_to_user_id: users[1].id, // Dekan
          assigned_by_user_id: users[0].id, // Kaprodi
          instructions: 'Final approval step',
          order_sequence: 3,
          is_completed: false
        }
      ])
      .execute();

    const result = await getDispositionAssignments(letterRequests[0].id);

    expect(result).toHaveLength(3);
    
    // Verify order and content
    expect(result[0].order_sequence).toBe(1);
    expect(result[0].is_completed).toBe(true);
    expect(result[0].completed_at).toBeInstanceOf(Date);
    expect(result[0].notes).toBe('Completed first step');

    expect(result[1].order_sequence).toBe(2);
    expect(result[1].is_completed).toBe(false);
    expect(result[1].completed_at).toBeNull();
    expect(result[1].notes).toBeNull();

    expect(result[2].order_sequence).toBe(3);
    expect(result[2].is_completed).toBe(false);
    expect(result[2].instructions).toBe('Final approval step');
  });
});