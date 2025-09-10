import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, studentsTable, letterRequestsTable, trackingLogsTable } from '../db/schema';
import { type UploadFinalLetterInput } from '../schema';
import { uploadFinalLetter } from '../handlers/upload_final_letter';
import { eq } from 'drizzle-orm';

describe('uploadFinalLetter', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let dekanUser: any;
  let kaurUser: any;
  let student: any;
  let letterRequest: any;

  beforeEach(async () => {
    // Create prerequisite data
    const dekanUsers = await db.insert(usersTable)
      .values({
        email: 'dekan@university.edu',
        name: 'Prof. Dr. Dekan',
        role: 'DEKAN',
        prodi: null
      })
      .returning()
      .execute();
    dekanUser = dekanUsers[0];

    const kaurUsers = await db.insert(usersTable)
      .values({
        email: 'kaur@university.edu',
        name: 'Kaur Akademik',
        role: 'KAUR_AKADEMIK',
        prodi: null
      })
      .returning()
      .execute();
    kaurUser = kaurUsers[0];

    const students = await db.insert(studentsTable)
      .values({
        nim: '123456789',
        name: 'Test Student',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();
    student = students[0];

    const letterRequests = await db.insert(letterRequestsTable)
      .values({
        student_id: student.id,
        created_by_user_id: kaurUser.id,
        letter_type: 'Surat Keterangan Aktif',
        purpose: 'Beasiswa',
        priority: 'NORMAL',
        status: 'PROCESSED_BY_KAUR_AKADEMIK',
        current_handler_user_id: kaurUser.id
      })
      .returning()
      .execute();
    letterRequest = letterRequests[0];
  });

  const testInput: UploadFinalLetterInput = {
    request_id: 1, // Will be updated in tests
    file_url: 'https://example.com/final-letter.pdf'
  };

  it('should successfully upload final letter and update status to TTD_READY', async () => {
    const input = { ...testInput, request_id: letterRequest.id };
    
    const result = await uploadFinalLetter(input, kaurUser.id);

    // Verify returned data
    expect(result.id).toEqual(letterRequest.id);
    expect(result.final_letter_url).toEqual(input.file_url);
    expect(result.status).toEqual('TTD_READY');
    expect(result.current_handler_user_id).toEqual(dekanUser.id);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save changes to database', async () => {
    const input = { ...testInput, request_id: letterRequest.id };
    
    await uploadFinalLetter(input, kaurUser.id);

    // Verify database changes
    const updatedRequests = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, letterRequest.id))
      .execute();

    expect(updatedRequests).toHaveLength(1);
    const updatedRequest = updatedRequests[0];
    expect(updatedRequest.final_letter_url).toEqual(input.file_url);
    expect(updatedRequest.status).toEqual('TTD_READY');
    expect(updatedRequest.current_handler_user_id).toEqual(dekanUser.id);
  });

  it('should create tracking log entry', async () => {
    const input = { ...testInput, request_id: letterRequest.id };
    
    await uploadFinalLetter(input, kaurUser.id);

    // Verify tracking log was created
    const trackingLogs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, letterRequest.id))
      .execute();

    expect(trackingLogs).toHaveLength(1);
    const log = trackingLogs[0];
    expect(log.user_id).toEqual(kaurUser.id);
    expect(log.action_type).toEqual('DOCUMENT_UPLOADED');
    expect(log.description).toEqual('Final letter document uploaded and ready for signature');
    expect(log.notes).toContain(input.file_url);
    expect(log.previous_status).toEqual('PROCESSED_BY_KAUR_AKADEMIK');
    expect(log.new_status).toEqual('TTD_READY');
  });

  it('should work with different valid statuses', async () => {
    const validStatuses = [
      'PROCESSED_BY_KAUR_KEMAHASISWAAN',
      'PROCESSED_BY_KAUR_KEUANGAN',
      'PROCESSED_BY_WD1',
      'PROCESSED_BY_WD2',
      'PROCESSED_BY_WD3',
      'PROCESSED_BY_KABAG_TU'
    ];

    for (const status of validStatuses) {
      // Update request status and maintain current handler as authorized user
      await db.update(letterRequestsTable)
        .set({ 
          status: status as any,
          current_handler_user_id: kaurUser.id // Keep the same authorized user
        })
        .where(eq(letterRequestsTable.id, letterRequest.id))
        .execute();

      const input = { ...testInput, request_id: letterRequest.id };
      
      const result = await uploadFinalLetter(input, kaurUser.id);
      expect(result.status).toEqual('TTD_READY');

      // Reset status for next iteration
      await db.update(letterRequestsTable)
        .set({ status: 'PROCESSED_BY_KAUR_AKADEMIK' })
        .where(eq(letterRequestsTable.id, letterRequest.id))
        .execute();
    }
  });

  it('should throw error when request not found', async () => {
    const input = { ...testInput, request_id: 99999 };
    
    await expect(uploadFinalLetter(input, kaurUser.id)).rejects.toThrow(
      /Letter request with ID 99999 not found/i
    );
  });

  it('should throw error when user is not authorized', async () => {
    // Create another user
    const unauthorizedUsers = await db.insert(usersTable)
      .values({
        email: 'other@university.edu',
        name: 'Other User',
        role: 'STAFF_PRODI',
        prodi: 'Computer Science'
      })
      .returning()
      .execute();

    const input = { ...testInput, request_id: letterRequest.id };
    
    await expect(uploadFinalLetter(input, unauthorizedUsers[0].id)).rejects.toThrow(
      /User is not authorized to upload final letter for this request/i
    );
  });

  it('should throw error when request is in invalid status', async () => {
    // Update request to invalid status
    await db.update(letterRequestsTable)
      .set({ status: 'DRAFT' })
      .where(eq(letterRequestsTable.id, letterRequest.id))
      .execute();

    const input = { ...testInput, request_id: letterRequest.id };
    
    await expect(uploadFinalLetter(input, kaurUser.id)).rejects.toThrow(
      /Cannot upload final letter for request in status: DRAFT/i
    );
  });

  it('should throw error when no DEKAN user found', async () => {
    // Delete DEKAN user
    await db.delete(usersTable)
      .where(eq(usersTable.id, dekanUser.id))
      .execute();

    const input = { ...testInput, request_id: letterRequest.id };
    
    await expect(uploadFinalLetter(input, kaurUser.id)).rejects.toThrow(
      /No DEKAN user found to assign as next handler/i
    );
  });

  it('should handle request with different processor roles', async () => {
    // Test with WD1 as processor
    const wd1Users = await db.insert(usersTable)
      .values({
        email: 'wd1@university.edu',
        name: 'WD1 User',
        role: 'WD1',
        prodi: null
      })
      .returning()
      .execute();
    const wd1User = wd1Users[0];

    // Update request to be processed by WD1
    await db.update(letterRequestsTable)
      .set({
        status: 'PROCESSED_BY_WD1',
        current_handler_user_id: wd1User.id
      })
      .where(eq(letterRequestsTable.id, letterRequest.id))
      .execute();

    const input = { ...testInput, request_id: letterRequest.id };
    
    const result = await uploadFinalLetter(input, wd1User.id);
    expect(result.status).toEqual('TTD_READY');
    expect(result.current_handler_user_id).toEqual(dekanUser.id);
  });

  it('should handle multiple DEKAN users by selecting the first one', async () => {
    // Create additional DEKAN user
    await db.insert(usersTable)
      .values({
        email: 'dekan2@university.edu',
        name: 'Prof. Dr. Dekan Kedua',
        role: 'DEKAN',
        prodi: null
      })
      .execute();

    const input = { ...testInput, request_id: letterRequest.id };
    
    const result = await uploadFinalLetter(input, kaurUser.id);
    expect(result.status).toEqual('TTD_READY');
    expect(result.current_handler_user_id).toEqual(dekanUser.id); // Should still be the first DEKAN
  });
});