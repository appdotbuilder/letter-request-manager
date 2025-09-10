import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, studentsTable, letterRequestsTable, trackingLogsTable } from '../db/schema';
import { type SignLetterInput } from '../schema';
import { signLetter } from '../handlers/sign_letter';
import { eq } from 'drizzle-orm';

describe('signLetter', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should successfully sign a letter when user is DEKAN and request is TTD_READY', async () => {
    // Create test data
    const student = await db.insert(studentsTable)
      .values({
        nim: '123456789',
        name: 'Test Student',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const staffProdi = await db.insert(usersTable)
      .values({
        email: 'staff@prodi.edu',
        name: 'Staff Prodi',
        role: 'STAFF_PRODI',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const dekan = await db.insert(usersTable)
      .values({
        email: 'dekan@university.edu',
        name: 'Dean User',
        role: 'DEKAN',
        prodi: null
      })
      .returning()
      .execute();

    const staffFakultas = await db.insert(usersTable)
      .values({
        email: 'staff@fakultas.edu',
        name: 'Staff Fakultas',
        role: 'STAFF_FAKULTAS',
        prodi: null
      })
      .returning()
      .execute();

    const letterRequest = await db.insert(letterRequestsTable)
      .values({
        student_id: student[0].id,
        created_by_user_id: staffProdi[0].id,
        letter_type: 'Academic Transcript',
        purpose: 'Job Application',
        priority: 'NORMAL',
        status: 'TTD_READY',
        current_handler_user_id: dekan[0].id,
        final_letter_url: 'https://storage.example.com/letter-123.pdf'
      })
      .returning()
      .execute();

    const input: SignLetterInput = {
      request_id: letterRequest[0].id,
      signature_data: 'digital_signature_hash_example_12345'
    };

    // Execute the handler
    const result = await signLetter(input, dekan[0].id);

    // Verify the result
    expect(result.id).toBe(letterRequest[0].id);
    expect(result.status).toBe('TTD_DONE');
    expect(result.current_handler_user_id).toBe(staffFakultas[0].id);
    expect(result.updated_at).toBeInstanceOf(Date);

    // Verify database was updated
    const updatedRequest = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, letterRequest[0].id))
      .execute();

    expect(updatedRequest[0].status).toBe('TTD_DONE');
    expect(updatedRequest[0].current_handler_user_id).toBe(staffFakultas[0].id);
  });

  it('should create tracking log entries for signing and forwarding', async () => {
    // Create test data
    const student = await db.insert(studentsTable)
      .values({
        nim: '123456789',
        name: 'Test Student',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const staffProdi = await db.insert(usersTable)
      .values({
        email: 'staff@prodi.edu',
        name: 'Staff Prodi',
        role: 'STAFF_PRODI',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const dekan = await db.insert(usersTable)
      .values({
        email: 'dekan@university.edu',
        name: 'Dean User',
        role: 'DEKAN',
        prodi: null
      })
      .returning()
      .execute();

    const staffFakultas = await db.insert(usersTable)
      .values({
        email: 'staff@fakultas.edu',
        name: 'Staff Fakultas',
        role: 'STAFF_FAKULTAS',
        prodi: null
      })
      .returning()
      .execute();

    const letterRequest = await db.insert(letterRequestsTable)
      .values({
        student_id: student[0].id,
        created_by_user_id: staffProdi[0].id,
        letter_type: 'Academic Transcript',
        purpose: 'Job Application',
        priority: 'URGENT',
        status: 'TTD_READY',
        current_handler_user_id: dekan[0].id,
        final_letter_url: 'https://storage.example.com/letter-123.pdf'
      })
      .returning()
      .execute();

    const input: SignLetterInput = {
      request_id: letterRequest[0].id,
      signature_data: 'digital_signature_hash_example_12345'
    };

    // Execute the handler
    await signLetter(input, dekan[0].id);

    // Verify tracking logs were created
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, letterRequest[0].id))
      .execute();

    expect(trackingLogs).toHaveLength(2);

    // Check signing log entry
    const signingLog = trackingLogs.find(log => log.action_type === 'SIGNED');
    expect(signingLog).toBeDefined();
    expect(signingLog!.user_id).toBe(dekan[0].id);
    expect(signingLog!.description).toBe('Letter digitally signed by Dean');
    expect(signingLog!.previous_status).toBe('TTD_READY');
    expect(signingLog!.new_status).toBe('TTD_DONE');
    expect(signingLog!.notes).toContain('Digital signature applied using signature data: digital_signature_ha');

    // Check forwarding log entry
    const forwardingLog = trackingLogs.find(log => log.action_type === 'FORWARDED');
    expect(forwardingLog).toBeDefined();
    expect(forwardingLog!.user_id).toBe(dekan[0].id);
    expect(forwardingLog!.description).toContain('Signed letter forwarded to Staff Fakultas');
    expect(forwardingLog!.description).toContain(staffFakultas[0].name);
    expect(forwardingLog!.notes).toBe('Letter ready for return to prodi or delivery');
  });

  it('should reject signing if user is not DEKAN', async () => {
    // Create test data
    const student = await db.insert(studentsTable)
      .values({
        nim: '123456789',
        name: 'Test Student',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const staffProdi = await db.insert(usersTable)
      .values({
        email: 'staff@prodi.edu',
        name: 'Staff Prodi',
        role: 'STAFF_PRODI',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const nonDekan = await db.insert(usersTable)
      .values({
        email: 'staff@university.edu',
        name: 'Non-Dean User',
        role: 'WD1',
        prodi: null
      })
      .returning()
      .execute();

    const letterRequest = await db.insert(letterRequestsTable)
      .values({
        student_id: student[0].id,
        created_by_user_id: staffProdi[0].id,
        letter_type: 'Academic Transcript',
        purpose: 'Job Application',
        priority: 'NORMAL',
        status: 'TTD_READY',
        final_letter_url: 'https://storage.example.com/letter-123.pdf'
      })
      .returning()
      .execute();

    const input: SignLetterInput = {
      request_id: letterRequest[0].id,
      signature_data: 'digital_signature_hash_example_12345'
    };

    // Should reject non-DEKAN user
    await expect(signLetter(input, nonDekan[0].id)).rejects.toThrow(/only dean.*can sign letters/i);
  });

  it('should reject signing if letter request is not found', async () => {
    // Create DEKAN user
    const dekan = await db.insert(usersTable)
      .values({
        email: 'dekan@university.edu',
        name: 'Dean User',
        role: 'DEKAN',
        prodi: null
      })
      .returning()
      .execute();

    const input: SignLetterInput = {
      request_id: 99999, // Non-existent ID
      signature_data: 'digital_signature_hash_example_12345'
    };

    await expect(signLetter(input, dekan[0].id)).rejects.toThrow(/letter request not found/i);
  });

  it('should reject signing if letter is not in TTD_READY status', async () => {
    // Create test data
    const student = await db.insert(studentsTable)
      .values({
        nim: '123456789',
        name: 'Test Student',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const staffProdi = await db.insert(usersTable)
      .values({
        email: 'staff@prodi.edu',
        name: 'Staff Prodi',
        role: 'STAFF_PRODI',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const dekan = await db.insert(usersTable)
      .values({
        email: 'dekan@university.edu',
        name: 'Dean User',
        role: 'DEKAN',
        prodi: null
      })
      .returning()
      .execute();

    const letterRequest = await db.insert(letterRequestsTable)
      .values({
        student_id: student[0].id,
        created_by_user_id: staffProdi[0].id,
        letter_type: 'Academic Transcript',
        purpose: 'Job Application',
        priority: 'NORMAL',
        status: 'DRAFT', // Wrong status
        final_letter_url: 'https://storage.example.com/letter-123.pdf'
      })
      .returning()
      .execute();

    const input: SignLetterInput = {
      request_id: letterRequest[0].id,
      signature_data: 'digital_signature_hash_example_12345'
    };

    await expect(signLetter(input, dekan[0].id)).rejects.toThrow(/not ready for signing.*current status: draft/i);
  });

  it('should reject signing if final letter document is missing', async () => {
    // Create test data
    const student = await db.insert(studentsTable)
      .values({
        nim: '123456789',
        name: 'Test Student',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const staffProdi = await db.insert(usersTable)
      .values({
        email: 'staff@prodi.edu',
        name: 'Staff Prodi',
        role: 'STAFF_PRODI',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const dekan = await db.insert(usersTable)
      .values({
        email: 'dekan@university.edu',
        name: 'Dean User',
        role: 'DEKAN',
        prodi: null
      })
      .returning()
      .execute();

    const letterRequest = await db.insert(letterRequestsTable)
      .values({
        student_id: student[0].id,
        created_by_user_id: staffProdi[0].id,
        letter_type: 'Academic Transcript',
        purpose: 'Job Application',
        priority: 'NORMAL',
        status: 'TTD_READY',
        final_letter_url: null // Missing final letter
      })
      .returning()
      .execute();

    const input: SignLetterInput = {
      request_id: letterRequest[0].id,
      signature_data: 'digital_signature_hash_example_12345'
    };

    await expect(signLetter(input, dekan[0].id)).rejects.toThrow(/final letter document not found/i);
  });

  it('should reject signing if no Staff Fakultas is available', async () => {
    // Create test data without Staff Fakultas
    const student = await db.insert(studentsTable)
      .values({
        nim: '123456789',
        name: 'Test Student',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const staffProdi = await db.insert(usersTable)
      .values({
        email: 'staff@prodi.edu',
        name: 'Staff Prodi',
        role: 'STAFF_PRODI',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const dekan = await db.insert(usersTable)
      .values({
        email: 'dekan@university.edu',
        name: 'Dean User',
        role: 'DEKAN',
        prodi: null
      })
      .returning()
      .execute();

    const letterRequest = await db.insert(letterRequestsTable)
      .values({
        student_id: student[0].id,
        created_by_user_id: staffProdi[0].id,
        letter_type: 'Academic Transcript',
        purpose: 'Job Application',
        priority: 'NORMAL',
        status: 'TTD_READY',
        current_handler_user_id: dekan[0].id,
        final_letter_url: 'https://storage.example.com/letter-123.pdf'
      })
      .returning()
      .execute();

    const input: SignLetterInput = {
      request_id: letterRequest[0].id,
      signature_data: 'digital_signature_hash_example_12345'
    };

    // No Staff Fakultas created, should fail
    await expect(signLetter(input, dekan[0].id)).rejects.toThrow(/no staff fakultas available/i);
  });
});