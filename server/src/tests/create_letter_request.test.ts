import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, studentsTable, letterRequestsTable, supportingDocumentsTable, trackingLogsTable } from '../db/schema';
import { type CreateLetterRequestInput } from '../schema';
import { createLetterRequest } from '../handlers/create_letter_request';
import { eq } from 'drizzle-orm';

describe('createLetterRequest', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data setup
  let staffProdiUser: any;
  let kaprodiUser: any;
  let student: any;

  beforeEach(async () => {
    // Create test users
    const staffProdiResult = await db.insert(usersTable)
      .values({
        email: 'staff@prodi.com',
        name: 'Staff Prodi',
        role: 'STAFF_PRODI',
        prodi: 'Teknik Informatika'
      })
      .returning()
      .execute();
    staffProdiUser = staffProdiResult[0];

    const kaprodiResult = await db.insert(usersTable)
      .values({
        email: 'kaprodi@ti.com', 
        name: 'Kaprodi TI',
        role: 'KAPRODI',
        prodi: 'Teknik Informatika'
      })
      .returning()
      .execute();
    kaprodiUser = kaprodiResult[0];

    // Create test student
    const studentResult = await db.insert(studentsTable)
      .values({
        nim: '2024001',
        name: 'John Doe',
        prodi: 'Teknik Informatika'
      })
      .returning()
      .execute();
    student = studentResult[0];
  });

  it('should create a letter request successfully', async () => {
    const input: CreateLetterRequestInput = {
      student_id: student.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan beasiswa',
      priority: 'NORMAL'
    };

    const result = await createLetterRequest(input, staffProdiUser.id);

    // Basic field validation
    expect(result.student_id).toEqual(student.id);
    expect(result.created_by_user_id).toEqual(staffProdiUser.id);
    expect(result.letter_type).toEqual(input.letter_type);
    expect(result.purpose).toEqual(input.purpose);
    expect(result.priority).toEqual('NORMAL');
    expect(result.status).toEqual('DRAFT');
    expect(result.current_handler_user_id).toEqual(kaprodiUser.id);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save letter request to database', async () => {
    const input: CreateLetterRequestInput = {
      student_id: student.id,
      letter_type: 'Surat Keterangan Lulus',
      purpose: 'Untuk melamar kerja',
      priority: 'URGENT'
    };

    const result = await createLetterRequest(input, staffProdiUser.id);

    // Verify in database
    const requests = await db.select()
      .from(letterRequestsTable)
      .where(eq(letterRequestsTable.id, result.id))
      .execute();

    expect(requests).toHaveLength(1);
    expect(requests[0].letter_type).toEqual('Surat Keterangan Lulus');
    expect(requests[0].purpose).toEqual('Untuk melamar kerja');
    expect(requests[0].priority).toEqual('URGENT');
    expect(requests[0].status).toEqual('DRAFT');
    expect(requests[0].current_handler_user_id).toEqual(kaprodiUser.id);
  });

  it('should create tracking log entry', async () => {
    const input: CreateLetterRequestInput = {
      student_id: student.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan administrasi',
      priority: 'NORMAL'
    };

    const result = await createLetterRequest(input, staffProdiUser.id);

    // Verify tracking log was created
    const logs = await db.select()
      .from(trackingLogsTable)
      .where(eq(trackingLogsTable.letter_request_id, result.id))
      .execute();

    expect(logs).toHaveLength(1);
    expect(logs[0].user_id).toEqual(staffProdiUser.id);
    expect(logs[0].action_type).toEqual('CREATED');
    expect(logs[0].description).toEqual('Letter request created: Surat Keterangan Aktif');
    expect(logs[0].notes).toEqual('Purpose: Untuk keperluan administrasi');
    expect(logs[0].previous_status).toBeNull();
    expect(logs[0].new_status).toEqual('DRAFT');
  });

  it('should handle supporting documents', async () => {
    const input: CreateLetterRequestInput = {
      student_id: student.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan beasiswa',
      priority: 'NORMAL',
      supporting_documents: [
        {
          file_name: 'transkrip.pdf',
          file_url: 'https://example.com/transkrip.pdf'
        },
        {
          file_name: 'ktp.jpg',
          file_url: 'https://example.com/ktp.jpg'
        }
      ]
    };

    const result = await createLetterRequest(input, staffProdiUser.id);

    // Verify supporting documents were saved
    const documents = await db.select()
      .from(supportingDocumentsTable)
      .where(eq(supportingDocumentsTable.letter_request_id, result.id))
      .execute();

    expect(documents).toHaveLength(2);
    expect(documents[0].file_name).toEqual('transkrip.pdf');
    expect(documents[0].file_url).toEqual('https://example.com/transkrip.pdf');
    expect(documents[0].uploaded_by_user_id).toEqual(staffProdiUser.id);
    expect(documents[1].file_name).toEqual('ktp.jpg');
    expect(documents[1].file_url).toEqual('https://example.com/ktp.jpg');
  });

  it('should handle request without supporting documents', async () => {
    const input: CreateLetterRequestInput = {
      student_id: student.id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Untuk keperluan administrasi',
      priority: 'NORMAL'
      // No supporting_documents provided
    };

    const result = await createLetterRequest(input, staffProdiUser.id);

    // Should succeed without documents
    expect(result.id).toBeDefined();
    
    // Verify no documents were created
    const documents = await db.select()
      .from(supportingDocumentsTable)
      .where(eq(supportingDocumentsTable.letter_request_id, result.id))
      .execute();

    expect(documents).toHaveLength(0);
  });

  it('should throw error when student not found', async () => {
    const input: CreateLetterRequestInput = {
      student_id: 99999, // Non-existent student ID
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Test purpose',
      priority: 'NORMAL'
    };

    expect(createLetterRequest(input, staffProdiUser.id))
      .rejects.toThrow(/student not found/i);
  });

  it('should throw error when no Kaprodi found for prodi', async () => {
    // Create student with different prodi
    const differentStudent = await db.insert(studentsTable)
      .values({
        nim: '2024002',
        name: 'Jane Doe',
        prodi: 'Sistem Informasi'
      })
      .returning()
      .execute();

    const input: CreateLetterRequestInput = {
      student_id: differentStudent[0].id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Test purpose',
      priority: 'NORMAL'
    };

    expect(createLetterRequest(input, staffProdiUser.id))
      .rejects.toThrow(/no kaprodi found for prodi/i);
  });

  it('should handle multiple prodi correctly', async () => {
    // Create another Kaprodi for different prodi
    const kaprodiSI = await db.insert(usersTable)
      .values({
        email: 'kaprodi@si.com',
        name: 'Kaprodi SI',
        role: 'KAPRODI',
        prodi: 'Sistem Informasi'
      })
      .returning()
      .execute();

    // Create student from different prodi
    const siStudent = await db.insert(studentsTable)
      .values({
        nim: '2024003',
        name: 'Alice Smith',
        prodi: 'Sistem Informasi'
      })
      .returning()
      .execute();

    const input: CreateLetterRequestInput = {
      student_id: siStudent[0].id,
      letter_type: 'Surat Keterangan Aktif',
      purpose: 'Test purpose',
      priority: 'NORMAL'
    };

    const result = await createLetterRequest(input, staffProdiUser.id);

    // Should assign to correct Kaprodi based on student's prodi
    expect(result.current_handler_user_id).toEqual(kaprodiSI[0].id);
  });
});